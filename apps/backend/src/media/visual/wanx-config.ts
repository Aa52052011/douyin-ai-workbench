import { ErrorCode } from '../../common/errors/app-error.js';
import { AppError } from '../../common/errors/app-error.js';

/**
 * Wanx / wan2.6-t2i (Alibaba Cloud Model Studio, Beijing).
 * Official sync POST: {WANX_BASE_URL}/services/aigc/multimodal-generation/generation
 * WANX_BASE_URL is the full workspace base (…/api/v1), never a hardcoded WorkspaceId.
 * Auth: Authorization Bearer WANX_API_KEY. API Key must match the Beijing endpoint.
 * Official n default is 4 (billed per image); V1 always sends n=1.
 * Official prompt_extend default is true; V1 always sends false (prompt is frozen).
 * Sync V1 has no idempotency header and no task_id lookup.
 */
export const IMAGE_PROVIDER_WANX = 'wanx';
export const DEFAULT_WANX_MODEL = 'wan2.6-t2i';
/** Official 9:16 recommendation for wan2.6-t2i (width*height), not 1080x1920. */
export const DEFAULT_WANX_SIZE = '960*1696';
export const DEFAULT_WANX_TIMEOUT_MS = 120_000;
export const DEFAULT_WANX_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
export const WANX_HARD_MAX_RESPONSE_BYTES = 40 * 1024 * 1024;
export const WANX_PROMPT_MAX_CHARS = 2100;
export const WANX_NEGATIVE_PROMPT_MAX_CHARS = 500;
export const WANX_GENERATION_PATH = '/services/aigc/multimodal-generation/generation';
export const WANX_DOWNLOAD_ATTEMPTS = 3;

export const WANX_CAPABILITIES = {
  image: true as const,
  async: false as const,
  idempotency: false as const,
  taskLookup: false as const,
};

export type WanxImageConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export function joinWanxGenerationUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED);
  }
  if (trimmed.endsWith(WANX_GENERATION_PATH)) {
    return trimmed;
  }
  return `${trimmed}${WANX_GENERATION_PATH}`;
}

export function parseWanxSize(value: string | undefined): string {
  const raw = (value?.trim() || DEFAULT_WANX_SIZE).replace(/x/i, '*');
  const match = /^(?<w>\d{2,5})\*(?<h>\d{2,5})$/.exec(raw);
  if (!match?.groups) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED);
  }
  const width = Number(match.groups.w);
  const height = Number(match.groups.h);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED);
  }
  return `${width}*${height}`;
}

export function parseWanxTimeoutMs(): number {
  const value = Number(process.env.WANX_TIMEOUT_MS ?? DEFAULT_WANX_TIMEOUT_MS);
  if (!Number.isFinite(value) || value < 1_000) {
    return DEFAULT_WANX_TIMEOUT_MS;
  }
  return Math.min(300_000, Math.floor(value));
}

export function parseWanxMaxResponseBytes(): number {
  const value = Number(process.env.WANX_MAX_RESPONSE_BYTES ?? DEFAULT_WANX_MAX_RESPONSE_BYTES);
  if (!Number.isFinite(value) || value < 1024) {
    return DEFAULT_WANX_MAX_RESPONSE_BYTES;
  }
  return Math.min(WANX_HARD_MAX_RESPONSE_BYTES, Math.floor(value));
}

export function clipWanxPrompt(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

export function readWanxImageConfig(): WanxImageConfig {
  return {
    baseUrl: process.env.WANX_BASE_URL?.trim().replace(/\/+$/, '') ?? '',
    apiKey: process.env.WANX_API_KEY?.trim() ?? '',
    model: process.env.WANX_MODEL?.trim() || DEFAULT_WANX_MODEL,
    size: parseWanxSize(process.env.WANX_SIZE),
    timeoutMs: parseWanxTimeoutMs(),
    maxResponseBytes: parseWanxMaxResponseBytes(),
  };
}

export function isWanxImageConfigured(config = readWanxImageConfig()): boolean {
  return Boolean(config.apiKey && config.baseUrl && config.model && config.size);
}

export function assertWanxImageConfigured(config = readWanxImageConfig()): WanxImageConfig {
  if (!isWanxImageConfigured(config)) {
    throw new AppError(ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED);
  }
  return config;
}
