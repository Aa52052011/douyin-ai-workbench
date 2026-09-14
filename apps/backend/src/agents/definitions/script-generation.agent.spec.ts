import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentRegistry } from '../agent.registry.js';
import { PromptRegistry } from '../prompts/prompt.registry.js';
import { parseModelJson } from './account-positioning.agent.js';
import {
  parseScriptGenerationInput,
  parseTargetDuration,
  validateScriptOutput,
} from './script-generation.agent.js';
import { buildMockScriptInput, buildMockScriptOutput } from './script-generation.fixture.js';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected throw');
  } catch (error) {
    expect((error as { code: string }).code).toBe(code);
  }
}

describe('script.generation input/output', () => {
  it('accepts assembled input and rejects context ids', () => {
    const parsed = parseScriptGenerationInput(buildMockScriptInput());
    expect(parsed.targetDuration).toBe(30);
    expectCode(
      () => parseScriptGenerationInput({ ...buildMockScriptInput(), tenantId: 't' }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
    expectCode(
      () => parseScriptGenerationInput({ ...buildMockScriptInput(), userId: 'u' }),
      ErrorCode.AGENT_INVALID_INPUT,
    );
  });

  it('rejects missing topic or invalid duration', () => {
    const input = buildMockScriptInput();
    delete (input as { topic?: unknown }).topic;
    expectCode(() => parseScriptGenerationInput(input), ErrorCode.AGENT_INVALID_INPUT);
    expectCode(() => parseTargetDuration(90), ErrorCode.SCRIPT_DURATION_NOT_AVAILABLE);
    expectCode(() => parseTargetDuration(0), ErrorCode.SCRIPT_DURATION_NOT_AVAILABLE);
    expect(parseTargetDuration(undefined, '30-45s')).toBe(30);
  });

  it('validates structured output and rejects non-JSON', () => {
    const output = buildMockScriptOutput(30);
    expect(validateScriptOutput(output, 30).sections.length).toBeGreaterThan(0);
    expectCode(() => parseModelJson('not-json'), ErrorCode.AGENT_INVALID_OUTPUT);
    expectCode(() => validateScriptOutput({ title: 'only' }, 30), ErrorCode.AGENT_INVALID_OUTPUT);
  });

  it('registers agent and prompt, and keeps section sequence/duration', () => {
    const agent = new AgentRegistry().get('script.generation', 'v1');
    expect(agent.capabilities).toContain('script-generation');
    expect(agent.temperature).toBe(0.4);
    expect(agent.maxTokens).toBe(3500);
    expect(agent.timeoutMs).toBe(210_000);
    const prompt = new PromptRegistry().get('script.generation', 'v1');
    expect(prompt.systemPrompt).toContain('只输出一个 JSON 对象');
    const output = validateScriptOutput(buildMockScriptOutput(45), 45);
    expect(output.sections.map((item) => item.sequence)).toEqual(
      output.sections.map((_, index) => index + 1),
    );
    expect(output.totalDuration).toBe(output.sections.reduce((sum, item) => sum + item.duration, 0));
    expect(output.totalDuration).toBe(45);
  });

  it('keeps mock script domain-aware for coffee topics without pretending to be a model', () => {
    const coffee = buildMockScriptOutput(30, '手冲咖啡到店转化');
    expect(coffee.title).toContain('手冲');
    expect(coffee.cta).toMatch(/到店|来店/);
    expect(coffee.sections.some((item) => item.subtitle.length > 18)).toBe(true);
    const workplace = buildMockScriptOutput(30, '职场沟通清单');
    expect(workplace.title).toContain('沟通');
  });
});
