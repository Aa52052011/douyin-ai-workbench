import { describe, expect, it } from 'vitest';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { PRODUCT_INTAKE_AGENT_ID, PRODUCT_INTAKE_AGENT_VERSION } from '../agent.types.js';
import { MockModelProvider } from '../models/mock.provider.js';
import { ModelRouter } from '../models/model.router.js';
import { RealModelProvider } from '../models/real.provider.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { ToolRegistry } from '../tools/tool.registry.js';
import { InProcessAgentExecutor } from './in-process.executor.js';

const context: AgentContext = {
  userId: 'u',
  tenantId: 't',
  workspaceId: 'w',
  projectId: 'p',
  requestId: 'req-pi',
  locale: 'zh-CN',
};

describe('product.intake executor', () => {
  it('returns structured draftPatch through MockModelProvider', async () => {
    process.env.MODEL_PROVIDER = 'mock';
    const mock = new MockModelProvider();
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      new ModelRouter(mock, new RealModelProvider()),
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: PRODUCT_INTAKE_AGENT_ID,
        agentVersion: PRODUCT_INTAKE_AGENT_VERSION,
        context,
        input: {
          mode: 'product',
          currentDraft: {},
          recentConversation: [],
          latestUserMessage: '我做一个帮助美容院自动生成抖音短视频的工具。',
          locale: 'zh-CN',
        },
      },
      5000,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.message).toBeTruthy();
    expect(result.output?.draftPatch).toBeTruthy();
    expect((result.output?.draftPatch as { productName?: string }).productName).toBeUndefined();
    expect((result.output?.draftPatch as { targetAudience?: string }).targetAudience).toBe('美容院');
    expect(result.output?.readyForConfirmation).toBe(false);
    expect(mock.generateCalls).toBe(1);
  });
});
