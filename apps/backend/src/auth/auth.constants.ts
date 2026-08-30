export const REFRESH_COOKIE_NAME = 'acf_rt';
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const JWT_ISSUER = 'ai-content-factory';

export function accessTtlSeconds(): number {
  const raw = process.env.JWT_ACCESS_EXPIRES_SEC;
  if (raw && Number.parseInt(raw, 10) > 0) {
    return Number.parseInt(raw, 10);
  }
  return ACCESS_TTL_SECONDS;
}

export function refreshTtlSeconds(): number {
  const raw = process.env.JWT_REFRESH_EXPIRES_SEC;
  if (raw && Number.parseInt(raw, 10) > 0) {
    return Number.parseInt(raw, 10);
  }
  return REFRESH_TTL_SECONDS;
}

export function jwtAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_ACCESS_SECRET is required in production');
  }
  return 'dev-only-insecure-jwt-secret';
}
