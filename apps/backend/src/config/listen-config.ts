import { RuntimeConfigError } from './runtime-config-error.js';

export type BackendListenConfig = {
  port: number;
  host?: string;
};

export function resolveBackendListen(env: NodeJS.ProcessEnv = process.env): BackendListenConfig {
  const portRaw = (env.BACKEND_PORT ?? env.PORT ?? '3001').trim();
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RuntimeConfigError(['BACKEND_PORT / PORT is invalid']);
  }
  const explicitHost = env.BACKEND_HOST?.trim();
  if (explicitHost) {
    return { port, host: explicitHost };
  }
  if (env.NODE_ENV === 'production') {
    return { port, host: '127.0.0.1' };
  }
  return { port };
}
