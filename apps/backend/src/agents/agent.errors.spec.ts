import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import { AgentError, isRetryableError } from './agent.errors.js';

describe('Agent errors', () => {
  it('marks network and timeout errors as retryable', () => {
    expect(isRetryableError(new AgentError(ErrorCode.AGENT_TIMEOUT))).toBe(true);
    expect(isRetryableError(new AgentError(ErrorCode.MODEL_ERROR, undefined, true))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('connect ECONNRESET'))).toBe(true);
  });

  it('marks invalid input and not-found as non-retryable', () => {
    expect(isRetryableError(new AgentError(ErrorCode.AGENT_INVALID_INPUT))).toBe(false);
    expect(isRetryableError(new AgentError(ErrorCode.AGENT_NOT_FOUND))).toBe(false);
    expect(isRetryableError(new AgentError(ErrorCode.TOOL_ERROR))).toBe(false);
  });
});
