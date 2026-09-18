import { RuntimeConfigError } from './runtime-config-error.js';

export function splitCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function readCorsOriginRaw(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CORS_ORIGINS ?? env.CORS_ORIGIN ?? '').trim();
}

export function resolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string | string[] {
  const raw = readCorsOriginRaw(env);
  const production = env.NODE_ENV === 'production';
  const list = splitCorsOrigins(raw);

  if (production && list.length === 0) {
    throw new RuntimeConfigError(['CORS_ORIGIN is required']);
  }
  if (list.some((origin) => origin === '*')) {
    throw new RuntimeConfigError(['CORS wildcard is not allowed']);
  }
  if (list.length === 0) {
    return 'http://localhost:3000';
  }
  return list.length === 1 ? list[0]! : list;
}
