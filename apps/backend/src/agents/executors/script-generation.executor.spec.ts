import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { AgentRegistry } from '../agent.registry.js';
import type { AgentContext } from '../agent.types.js';
import { buildMockScriptInput, buildMockScriptOutput } from '../definitions/script-generation.fixture.js';
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
  requestId: 'req-sg',
  locale: 'zh-CN',
};

function executorWith(generate: ModelRouter['generate']): InProcessAgentExecutor {
  const router = new ModelRouter(new MockModelProvider(), new RealModelProvider());
  router.generate = generate;
  return new InProcessAgentExecutor(
    new AgentRegistry(),
    router,
    new ToolRegistry(),
    new PromptRegistry(),
  );
}

describe('script.generation executor', () => {
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
        agentId: 'script.generation',
        agentVersion: 'v1',
        context,
        input: buildMockScriptInput(),
      },
      5000,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.hook).toBeTruthy();
    expect(result.output?.sections).toBeTruthy();
    expect(result.usage?.totalTokens).toBeGreaterThan(0);
  });

  it('fails non-JSON and schema-invalid output', async () => {
    const badText = executorWith(async () => ({
      text: 'plain text',
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    await expect(
      badText.execute(
        {
          requestId: context.requestId,
          agentId: 'script.generation',
          agentVersion: 'v1',
          context,
          input: buildMockScriptInput(),
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_INVALID_OUTPUT });

    const badJson = executorWith(async () => ({
      text: JSON.stringify({ title: 'only' }),
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    await expect(
      badJson.execute(
        {
          requestId: context.requestId,
          agentId: 'script.generation',
          agentVersion: 'v1',
          context,
          input: buildMockScriptInput(),
        },
        5000,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_INVALID_OUTPUT });
  });

  it('surfaces real provider errors', async () => {
    const cases = [
      ErrorCode.MODEL_ERROR,
      ErrorCode.MODEL_TIMEOUT,
      ErrorCode.MODEL_REQUEST_FAILED,
      ErrorCode.MODEL_PROVIDER_NOT_CONFIGURED,
    ] as const;
    for (const code of cases) {
      const executor = executorWith(async () => {
        throw new AgentError(code);
      });
      await expect(
        executor.execute(
          {
            requestId: context.requestId,
            agentId: 'script.generation',
            agentVersion: 'v1',
            context,
            input: buildMockScriptInput(),
          },
          5000,
        ),
      ).rejects.toMatchObject({ code });
    }
  });

  it('accepts a 15s mock payload', async () => {
    const executor = executorWith(async () => ({
      text: JSON.stringify(buildMockScriptOutput(15)),
      provider: 'mock',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCost: 0 },
    }));
    const result = await executor.execute(
      {
        requestId: context.requestId,
        agentId: 'script.generation',
        agentVersion: 'v1',
        context,
        input: buildMockScriptInput({ targetDuration: 15 }),
      },
      5000,
    );
    expect(result.output?.totalDuration).toBe(15);
  });
});
