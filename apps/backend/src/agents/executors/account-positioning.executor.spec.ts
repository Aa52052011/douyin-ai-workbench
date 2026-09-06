import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
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
  requestId: 'req-ap',
  locale: 'zh-CN',
};

const input = {
  industry: '教育',
  platform: 'douyin',
  accountType: '个人IP',
  goal: '帮助新人建立方法论',
};

function executorWith(
  generate: ModelRouter['generate'],
): InProcessAgentExecutor {
  const router = new ModelRouter(new MockModelProvider(), new RealModelProvider());
  router.generate = generate;
  return new InProcessAgentExecutor(
    new AgentRegistry(),
    router,
    new ToolRegistry(),
    new PromptRegistry(),
  );
}

describe('account.positioning executor', () => {
  it('returns structured output through ModelRouter mock', async () => {
    const executor = new InProcessAgentExecutor(
      new AgentRegistry(),
      new ModelRouter(new MockModelProvider(), new RealModelProvider()),
      new ToolRegistry(),
      new PromptRegistry(),
    );
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'account.positioning',
        agentVersion: 'v1',
        context,
        input,
      },
      5000,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.accountPositioning).toBeTruthy();
    expect(result.output?.persona).toBeTruthy();
    expect(result.usage?.totalTokens).toBeGreaterThan(0);
  });

  it('fails non-JSON model output as AGENT_INVALID_OUTPUT', async () => {
    const executor = executorWith(async () => ({
      text: 'this is markdown not json',
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    await expect(
      executor.execute(
        {
          requestId: context.requestId,
          agentId: 'account.positioning',
          agentVersion: 'v1',
          context,
          input,
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_INVALID_OUTPUT });
  });

  it('fails schema-invalid JSON as AGENT_INVALID_OUTPUT', async () => {
    const executor = executorWith(async () => ({
      text: JSON.stringify({ accountPositioning: 'only one field' }),
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    await expect(
      executor.execute(
        {
          requestId: context.requestId,
          agentId: 'account.positioning',
          agentVersion: 'v1',
          context,
          input,
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_INVALID_OUTPUT });
  });
});
