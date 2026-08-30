import { describe, expect, it } from 'vitest';
import { payloadFingerprint, sanitizeForLog, shouldLogFullPrompts } from './agent.logger.js';

describe('Agent logger', () => {
  it('redacts secrets and does not keep raw tokens', () => {
    const sanitized = sanitizeForLog({
      password: 'password1',
      accessToken: 'jwt-access',
      refreshToken: 'jwt-refresh',
      cookie: 'acf_rt=secret',
      authorization: 'Bearer abc',
      message: 'hello',
    }) as Record<string, string>;
    expect(sanitized.password).toBe('[redacted]');
    expect(sanitized.accessToken).toBe('[redacted]');
    expect(sanitized.refreshToken).toBe('[redacted]');
    expect(sanitized.cookie).toBe('[redacted]');
    expect(sanitized.authorization).toBe('[redacted]');
    expect(sanitized.message).toBe('hello');
    expect(JSON.stringify(sanitized)).not.toContain('password1');
    expect(JSON.stringify(sanitized)).not.toContain('jwt-access');
  });

  it('records hash and length instead of full prompt by default', () => {
    const fp = payloadFingerprint({ system: 'secret prompt', user: 'hello' });
    expect(fp.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(fp.length).toBeGreaterThan(10);
    expect(shouldLogFullPrompts()).toBe(false);
  });
});
