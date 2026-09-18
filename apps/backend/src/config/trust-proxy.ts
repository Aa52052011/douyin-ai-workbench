export const TRUST_PROXY_LOOPBACK = 'loopback' as const;

export type TrustProxySetting = typeof TRUST_PROXY_LOOPBACK | false;

export function isBroadTrustProxyValue(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase() ?? '';
  return value === 'true' || value === '1' || value === '*' || value === 'all';
}

export function resolveTrustProxySetting(env: NodeJS.ProcessEnv = process.env): TrustProxySetting {
  if (isBroadTrustProxyValue(env.TRUST_PROXY)) {
    return TRUST_PROXY_LOOPBACK;
  }
  if (env.TRUST_PROXY?.trim().toLowerCase() === 'false') {
    return false;
  }
  return TRUST_PROXY_LOOPBACK;
}

export function applyTrustProxy(expressApp: { set: (key: string, value: unknown) => unknown }, env: NodeJS.ProcessEnv = process.env): TrustProxySetting {
  const setting = resolveTrustProxySetting(env);
  expressApp.set('trust proxy', setting);
  return setting;
}

export function resolveClientIp(req: { ip?: string }): string {
  const ip = req.ip?.trim();
  return ip && ip.length > 0 ? ip : '0.0.0.0';
}
