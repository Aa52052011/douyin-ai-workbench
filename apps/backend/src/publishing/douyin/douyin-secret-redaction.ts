const REDACTED = '***REDACTED***';

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(access[_-]?token)(["\s:=]+)([^\s"',}\\]+)/gi, label: 'access_token' },
  { pattern: /(refresh[_-]?token)(["\s:=]+)([^\s"',}\\]+)/gi, label: 'refresh_token' },
  { pattern: /(client[_-]?secret)(["\s:=]+)([^\s"',}\\]+)/gi, label: 'client_secret' },
  { pattern: /(authorization[_-]?code|(?<![a-z])code)(["\s:=]+)([^\s"',}\\]+)/gi, label: 'code' },
  { pattern: /(authorization)(["\s:=]+)([^\s"',}\\]+)/gi, label: 'authorization' },
];

export function redactDouyinSecrets(text: string): string {
  let out = text;
  for (const item of SECRET_PATTERNS) {
    out = out.replace(item.pattern, `${item.label}=${REDACTED}`);
  }
  return out;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'access-token' || lower === 'authorization' || lower.includes('secret') || lower.includes('token')) {
      next[key] = REDACTED;
    } else {
      next[key] = value;
    }
  }
  return next;
}

export const DOUYIN_REDACTED_TOKEN = REDACTED;
