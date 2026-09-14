import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import { classifyModelError } from './model-error-classify.js';

describe('classifyModelError', () => {
  it('marks HTTP 429/502/503/504 as failover-eligible from structured status', () => {
    for (const status of [429, 502, 503, 504]) {
      const error = new AgentError(ErrorCode.MODEL_REQUEST_FAILED, `Model request failed (HTTP ${status})`, true, {
        httpStatus: status,
      });
      expect(classifyModelError(error)).toMatchObject({ class: 'FAILOVER_ELIGIBLE', reason: `HTTP_${status}`, httpStatus: status });
    }
  });

  it('marks MODEL_TIMEOUT and network tokens as failover-eligible', () => {
    expect(classifyModelError(new AgentError(ErrorCode.MODEL_TIMEOUT, undefined, true))).toMatchObject({
      class: 'FAILOVER_ELIGIBLE',
      reason: 'MODEL_TIMEOUT',
    });
    expect(
      classifyModelError(new AgentError(ErrorCode.MODEL_REQUEST_FAILED, undefined, true, { networkCode: 'ECONNRESET' })),
    ).toMatchObject({ class: 'FAILOVER_ELIGIBLE', reason: 'ECONNRESET' });
    expect(classifyModelError(new Error('socket hang up'))).toMatchObject({ class: 'FAILOVER_ELIGIBLE' });
  });

  it('marks AGENT_TIMEOUT, 400/401/403, schema and unconfigured as non-failover', () => {
    expect(classifyModelError(new AgentError(ErrorCode.AGENT_TIMEOUT))).toMatchObject({
      class: 'NON_FAILOVER',
      reason: ErrorCode.AGENT_TIMEOUT,
    });
    expect(classifyModelError(new AgentError(ErrorCode.AGENT_INVALID_OUTPUT))).toMatchObject({ class: 'NON_FAILOVER' });
    expect(classifyModelError(new AgentError(ErrorCode.AGENT_INVALID_INPUT))).toMatchObject({ class: 'NON_FAILOVER' });
    expect(classifyModelError(new AgentError(ErrorCode.MODEL_PROVIDER_NOT_CONFIGURED))).toMatchObject({
      class: 'NON_FAILOVER',
    });
    for (const status of [400, 401, 403]) {
      const error = new AgentError(ErrorCode.MODEL_REQUEST_FAILED, `Model request failed (HTTP ${status})`, false, {
        httpStatus: status,
      });
      expect(classifyModelError(error).class).toBe('NON_FAILOVER');
    }
  });
});
