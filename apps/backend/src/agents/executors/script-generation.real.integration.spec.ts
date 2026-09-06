import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
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

function loadWorkspaceEnv(): void {
  const envPath = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../../.env');
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const context: AgentContext = {
  userId: 'u',
  tenantId: 't',
  workspaceId: 'w',
  projectId: 'p',
  requestId: 'req-sg-real',
  locale: 'zh-CN',
};

describe.skipIf(!enabled)('script.generation real model', () => {
  it('returns a valid script through ModelRouter', async () => {
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
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'script.generation',
        agentVersion: 'v1',
        context,
        input: buildMockScriptInput({ targetDuration: 30 }),
      },
      60_000,
    );
    const output = result.output as unknown as ScriptOutput;
    expect(result.status).toBe('COMPLETED');
    expect(output.hook.length).toBeGreaterThan(0);
    expect(output.sections.length).toBeGreaterThan(0);
    expect(result.usage?.totalTokens).toBeGreaterThan(0);
  }, 90_000);
});
