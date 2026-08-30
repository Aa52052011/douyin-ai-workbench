import { describe, expect, it } from 'vitest';
import { AgentError } from './agent.errors.js';
import { ErrorCode } from '../common/errors/app-error.js';
import { runWithTimeout } from './timeout.js';

describe('runWithTimeout', () => {
  it('returns the value when work finishes in time', async () => {
    await expect(runWithTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');
  });

  it('fails with AGENT_TIMEOUT when work exceeds the limit', async () => {
    const delayed = new Promise((resolve) => {
      setTimeout(resolve, 80);
    });
    await expect(runWithTimeout(delayed, 20)).rejects.toBeInstanceOf(AgentError);
    await expect(
      runWithTimeout(
        new Promise((resolve) => {
          setTimeout(resolve, 80);
        }),
        20,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.AGENT_TIMEOUT,
    });
  });
});
