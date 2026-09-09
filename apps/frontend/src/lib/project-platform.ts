/**
 * Project target publish/ops platform registry (V1).
 * Canonical storage values are lowercase strings — no Prisma enum change.
 */

export const DEFAULT_PROJECT_PLATFORM = "douyin" as const;

export type ProjectPlatformId =
  | "douyin"
  | "kuaishou"
  | "xiaohongshu"
  | "wechat_channels"
  | "bilibili";

export type ProjectPlatformOption = {
  id: ProjectPlatformId;
  label: string;
  /** V1: only enabled options appear in the select. */
  enabled: boolean;
};

/** Full registry; V1 UI only surfaces enabled entries (others stay hidden). */
export const PROJECT_PLATFORM_OPTIONS: readonly ProjectPlatformOption[] = [
  { id: "douyin", label: "抖音", enabled: true },
  { id: "kuaishou", label: "快手", enabled: false },
  { id: "xiaohongshu", label: "小红书", enabled: false },
  { id: "wechat_channels", label: "视频号", enabled: false },
  { id: "bilibili", label: "B站", enabled: false },
] as const;

export const PROJECT_PLATFORM_ENABLED_IDS: readonly ProjectPlatformId[] = PROJECT_PLATFORM_OPTIONS.filter(
  (item) => item.enabled,
).map((item) => item.id);

export const PROJECT_PLATFORM_FIELD_LABEL = "目标发布/运营平台";

export const PROJECT_PLATFORM_HELP =
  "选择这个项目主要运营和发布内容的平台。";

const ALIASES: Record<string, ProjectPlatformId> = {
  douyin: "douyin",
  抖音: "douyin",
  DOUYIN: "douyin",
  kuaishou: "kuaishou",
  快手: "kuaishou",
  xiaohongshu: "xiaohongshu",
  小红书: "xiaohongshu",
  wechat_channels: "wechat_channels",
  视频号: "wechat_channels",
  channels: "wechat_channels",
  CHANNELS: "wechat_channels",
  bilibili: "bilibili",
  B站: "bilibili",
  BILIBILI: "bilibili",
};

export function normalizeProjectPlatform(value: string | null | undefined): ProjectPlatformId | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const mapped = ALIASES[trimmed] ?? ALIASES[trimmed.toLowerCase()];
  return mapped ?? null;
}

/** Select value for forms: known aliases → id; null/unknown → V1 default (display only until save). */
export function projectPlatformSelectValue(value: string | null | undefined): ProjectPlatformId {
  return normalizeProjectPlatform(value) ?? DEFAULT_PROJECT_PLATFORM;
}

/** Human label for display; never show raw canonical ids to users. */
export function projectPlatformLabel(value: string | null | undefined): string {
  const id = normalizeProjectPlatform(value);
  if (id) {
    return PROJECT_PLATFORM_OPTIONS.find((item) => item.id === id)?.label ?? "抖音";
  }
  if (value == null || !String(value).trim()) {
    return "抖音";
  }
  // Unknown legacy free-text: show as-is rather than inventing a platform.
  return String(value).trim();
}

export function isEnabledProjectPlatform(value: string | null | undefined): value is ProjectPlatformId {
  const id = normalizeProjectPlatform(value);
  return id != null && PROJECT_PLATFORM_ENABLED_IDS.includes(id);
}

/** Payload for create/update API — V1 always persists enabled canonical id. */
export function projectPlatformApiValue(value: string | null | undefined): ProjectPlatformId {
  const id = normalizeProjectPlatform(value);
  if (id && PROJECT_PLATFORM_ENABLED_IDS.includes(id)) {
    return id;
  }
  return DEFAULT_PROJECT_PLATFORM;
}
