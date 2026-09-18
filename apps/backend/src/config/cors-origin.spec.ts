import { describe, expect, it } from 'vitest';
import { RuntimeConfigError } from './runtime-config-error.js';
import { resolveCorsOrigins } from './cors-origin.js';

describe('resolveCorsOrigins', () => {
  it('uses the development localhost:3000 fallback when unset', () => {
    expect(resolveCorsOrigins({ NODE_ENV: 'development' })).toBe('http://localhost:3000');
  });

  it('parses comma-separated origins', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:3010,http://localhost:3000',
      }),
    ).toEqual(['http://localhost:3010', 'http://localhost:3000']);
  });

  it('prefers CORS_ORIGINS over CORS_ORIGIN', () => {
    expect(
      resolveCorsOrigins({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://ignored.example',
        CORS_ORIGINS: 'https://app.example.com',
      }),
    ).toBe('https://app.example.com');
  });

  it('rejects wildcard', () => {
    expect(() => resolveCorsOrigins({ NODE_ENV: 'production', CORS_ORIGIN: '*' })).toThrow(RuntimeConfigError);
    expect(() => resolveCorsOrigins({ NODE_ENV: 'development', CORS_ORIGIN: '*' })).toThrow(RuntimeConfigError);
  });

  it('requires an origin in production', () => {
    expect(() => resolveCorsOrigins({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGIN is required/);
  });
});
