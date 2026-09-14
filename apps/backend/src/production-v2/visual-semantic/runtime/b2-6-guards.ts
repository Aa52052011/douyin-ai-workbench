export const CONTENT_01_NEW_ASSET_ID = '803fafd2-4c0e-4412-80d7-a0d6452cefac';
export const CONTENT_01_OLD_ASSET_ID = 'c59dfd61-d5fe-4794-9117-e993686710ec';
export const OLD_CONTAMINATED_ASSET_FORBIDDEN = 'OLD_CONTAMINATED_ASSET_FORBIDDEN_IN_B2_6';
export const REAL_ASSET_PRIVACY_PREFLIGHT_BLOCKED = 'REAL_ASSET_PRIVACY_PREFLIGHT_BLOCKED';

export function assertB26Cli(argv: string[]): void {
  const hasFile = argv.some((arg) => arg === '--file' || arg.startsWith('--file='));
  const hasAsset = argv.some((arg) => arg === '--assetId' || arg.startsWith('--assetId='));
  if (hasFile || hasAsset) {
    throw new Error('B26_REJECTS_EXTERNAL_INPUT');
  }
}

export function assertB26AssetId(assetId: string): void {
  if (assetId.toLowerCase().startsWith('c59dfd61') || assetId === CONTENT_01_OLD_ASSET_ID) {
    throw new Error(OLD_CONTAMINATED_ASSET_FORBIDDEN);
  }
  if (assetId !== CONTENT_01_NEW_ASSET_ID) {
    throw new Error('B26_ASSET_NOT_ALLOWED');
  }
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /rk-[A-Za-z0-9_-]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /Bearer\s+ey[A-Za-z0-9._-]{20,}/,
  /api[_-]?key\s*[:=]\s*\S{8,}/i,
  /password\s*[:=]\s*\S{6,}/i,
];

export function findSecretLikeHits(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      hits.push(pattern.source);
    }
  }
  return hits;
}

export function extractAsciiRuns(buf: Buffer, minLength = 24): string {
  const chars: string[] = [];
  for (const byte of buf) {
    if (byte >= 32 && byte <= 126) {
      chars.push(String.fromCharCode(byte));
    } else {
      chars.push('\n');
    }
  }
  return chars.join('').split('\n').filter((run) => run.length >= minLength).join('\n');
}

export function privacyPreflightScan(input: { label: string; text?: string; bytes?: Buffer }): { ok: true } | { ok: false; hits: string[] } {
  const parts: string[] = [];
  if (input.text) {
    parts.push(input.text);
  }
  if (input.bytes) {
    parts.push(extractAsciiRuns(input.bytes));
  }
  const hits = findSecretLikeHits(parts.join('\n'));
  if (hits.length > 0) {
    return { ok: false, hits: hits.map((item) => `${input.label}:${item}`) };
  }
  return { ok: true };
}

export function sanitizeVisibleText(text: string): { sanitized: string; redacted: boolean; category?: string } {
  let sanitized = text;
  let redacted = false;
  let category: string | undefined;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sanitized)) {
    sanitized = sanitized.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL_REDACTED]');
    redacted = true;
    category = 'EMAIL';
  }
  if (findSecretLikeHits(sanitized).length > 0) {
    sanitized = '[SECRET_REDACTED]';
    redacted = true;
    category = 'SECRET';
  }
  return { sanitized, redacted, category };
}
