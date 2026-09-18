import { describe, expect, it } from 'vitest';
import { resolveBackendListen } from './listen-config.js';

describe('resolveBackendListen', () => {
  it('keeps development on PORT 3001 without forcing a host', () => {
    expect(resolveBackendListen({ NODE_ENV: 'development' })).toEqual({ port: 3001 });
  });

  it('binds production to 127.0.0.1 by default', () => {
    expect(resolveBackendListen({ NODE_ENV: 'production' })).toEqual({ port: 3001, host: '127.0.0.1' });
  });

  it('honors BACKEND_HOST and BACKEND_PORT', () => {
    expect(
      resolveBackendListen({
        NODE_ENV: 'production',
        BACKEND_HOST: '127.0.0.1',
        BACKEND_PORT: '3001',
      }),
    ).toEqual({ port: 3001, host: '127.0.0.1' });
  });

  it('prefers BACKEND_PORT over PORT', () => {
    expect(resolveBackendListen({ PORT: '3999', BACKEND_PORT: '3001' })).toEqual({ port: 3001 });
  });
});
