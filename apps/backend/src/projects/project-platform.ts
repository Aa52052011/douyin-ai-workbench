/**
 * Project.platform API helpers — keep String? in Prisma; validate write path only.
 */

export const PROJECT_PLATFORM_API_ALLOWED = ['douyin'] as const;

export type ProjectPlatformApiValue = (typeof PROJECT_PLATFORM_API_ALLOWED)[number];

/** Map known legacy display aliases to canonical API values; empty → undefined. */
export function normalizeIncomingProjectPlatform(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'douyin' || trimmed === '抖音') {
    return 'douyin';
  }
  return trimmed;
}
