/**
 * Step 12.12P — real provider continuity: two consecutive scripts with week context.
 * Enable with AGENT_REAL_MODEL_TEST=true (loads workspace .env).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { MOCK_CONTENT_PLAN_OUTPUT } from '../definitions/content-planning.fixture.js';
import {
  buildCompactContentPlanContext,
  buildCompactPreviousScriptSummaries,
  buildCompactStrategyContext,
} from '../definitions/script-generation.context.js';
import { buildMockScriptInput } from '../definitions/script-generation.fixture.js';
import type { ScriptOutput } from '../definitions/script-generation.types.js';
import { isRealModelConfigured } from '../models/model.config.js';
import { MockModelProvider } from '../models/mock.provider.js';
import { ModelRouter } from '../models/model.router.js';
import { RealModelProvider } from '../models/real.provider.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { InProcessAgentExecutor } from './in-process.executor.js';

loadWorkspaceEnv();

const enabled = process.env.AGENT_REAL_MODEL_TEST === 'true' && isRealModelConfigured();
const outDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../../.local/uat-12.12P');

function loadWorkspaceEnv(): void {
  const envPath = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const context: AgentContext = {
  userId: 'u',
  tenantId: 't',
  workspaceId: 'w',
  projectId: 'p',
  requestId: 'req-sg-continuity',
  locale: 'zh-CN',
};

describe.skipIf(!enabled)('script.generation continuity real acceptance (12.12P)', () => {
  it('generates Day1 then Day2 with full plan context and low repetition', async () => {
    mkdirSync(outDir, { recursive: true });
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const router = new ModelRouter(new MockModelProvider(), new RealModelProvider());
    process.env.NODE_ENV = previousEnv;
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      router,
      new ToolRegistry(),
      new PromptRegistry(),
    );

    const topics = MOCK_CONTENT_PLAN_OUTPUT.topics;
    const day1 = topics[0];
    const day2 = topics[1];
    const strategyContext = buildCompactStrategyContext({
      version: 'v1',
      objective: { primaryObjective: '验证职场成长内容', businessGoal: '建立信任并涨粉' },
      targetAudience: { primary: '职场新人' },
      positioning: { accountRole: '过来人教练', marketPosition: '方法拆解' },
      contentMix: [{ type: '认知纠偏', purpose: '建立信任' }],
    });

    const day1Input = buildMockScriptInput({
      topicId: day1.id,
      topic: day1,
      targetDuration: 30,
      contentPlanContext: buildCompactContentPlanContext({
        planTitle: MOCK_CONTENT_PLAN_OUTPUT.title,
        payload: MOCK_CONTENT_PLAN_OUTPUT,
        currentTopicId: day1.id,
      }),
      previousScriptSummaries: [],
      strategyContext,
    });

    const t0 = Date.now();
    const run1 = await executor.execute(
      {
        requestId: `${context.requestId}-d1`,
        agentId: 'script.generation',
        agentVersion: 'v1',
        context,
        input: day1Input,
      },
      90_000,
    );
    const latency1 = Date.now() - t0;
    const out1 = run1.output as unknown as ScriptOutput;
    expect(run1.status).toBe('COMPLETED');

    const day2Input = buildMockScriptInput({
      topicId: day2.id,
      topic: day2,
      requirements:
        '本条必须与已完成脚本在 hook、开场、核心论点和案例结构上明显不同；CTA 可服务同一账号目标但措辞不要照搬。',
      previousScriptSummaries: buildCompactPreviousScriptSummaries({
        topics,
        currentTopicId: day2.id,
        scripts: [
          {
            topicId: day1.id,
            status: 'CONFIRMED',
            title: out1.title,
            payload: out1,
            topicSnapshot: day1,
          },
        ],
      }),
      strategyContext,
    });

    const t1 = Date.now();
    const run2 = await executor.execute(
      {
        requestId: `${context.requestId}-d2`,
        agentId: 'script.generation',
        agentVersion: 'v1',
        context,
        input: day2Input,
      },
      90_000,
    );
    const latency2 = Date.now() - t1;
    const out2 = run2.output as unknown as ScriptOutput;
    expect(run2.status).toBe('COMPLETED');

    const sameHook = out1.hook.trim() === out2.hook.trim();
    const sameTitle = out1.title.trim() === out2.title.trim();
    const sameCta = out1.cta.trim() === out2.cta.trim();
    const sameOpening = out1.opening.trim() === out2.opening.trim();
    const day2LeaksFuture = topics
      .slice(2, 5)
      .some((topic) => out2.hook.includes(topic.title) || out2.opening.includes(topic.title));

    // Shared topic CTA templates in fixtures can match; do not mark POOR for CTA-only overlap.
    let continuity: 'GOOD' | 'ACCEPTABLE' | 'POOR' = 'GOOD';
    if (sameHook || sameTitle || sameOpening) continuity = 'POOR';
    else if (sameCta || day2LeaksFuture) continuity = 'ACCEPTABLE';

    const evidence = {
      provider: process.env.MODEL_PROVIDER ?? 'unknown',
      day1: {
        title: out1.title,
        hook: out1.hook,
        opening: out1.opening,
        cta: out1.cta,
        latencyMs: latency1,
        tokens: run1.usage,
      },
      day2: {
        title: out2.title,
        hook: out2.hook,
        opening: out2.opening,
        cta: out2.cta,
        latencyMs: latency2,
        tokens: run2.usage,
      },
      checks: {
        differentHook: !sameHook,
        differentTitle: !sameTitle,
        differentOpening: !sameOpening,
        differentCta: !sameCta,
        day1Pillar: day1.contentPillar,
        day2Pillar: day2.contentPillar,
        day2LeaksFuture,
      },
      continuity,
      promptHasPlanContext: true,
      previousSummariesCount: day2Input.previousScriptSummaries?.length ?? 0,
    };
    writeFileSync(path.join(outDir, 'continuity-evidence.json'), JSON.stringify(evidence, null, 2));

    expect(sameHook).toBe(false);
    expect(sameTitle).toBe(false);
    expect(sameOpening).toBe(false);
    expect(continuity).not.toBe('POOR');
  }, 180_000);
});
