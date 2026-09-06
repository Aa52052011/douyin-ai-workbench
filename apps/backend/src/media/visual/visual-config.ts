import { RuntimeConfigError } from '../../config/runtime-config-error.js';
import { ErrorCode } from '../../common/errors/app-error.js';
import { AppError } from '../../common/errors/app-error.js';

export const IMAGE_PROVIDER_COLOR_BACKGROUND = 'color-background';
export const IMAGE_PROVIDER_WANX = 'wanx';
export const IMAGE_PROVIDER_MINIMAX = 'minimax-image';
export const DEFAULT_VISUAL_MAX_CONCURRENCY = 1;
export const COLOR_BACKGROUND_WIDTH = 1080;
export const COLOR_BACKGROUND_HEIGHT = 1920;

export type ImageProviderId = typeof IMAGE_PROVIDER_COLOR_BACKGROUND | typeof IMAGE_PROVIDER_WANX;

export function resolveImageProviderId(env: NodeJS.ProcessEnv = process.env): ImageProviderId {
  if (env.NODE_ENV === 'test' && env.RUN_REAL_VISUAL_TESTS !== 'true') {
    return IMAGE_PROVIDER_COLOR_BACKGROUND;
  }
  const raw = env.MEDIA_IMAGE_PROVIDER?.trim() ?? '';
  if (raw === IMAGE_PROVIDER_COLOR_BACKGROUND || raw === 'mock') {
    return IMAGE_PROVIDER_COLOR_BACKGROUND;
  }
  if (raw === IMAGE_PROVIDER_WANX) {
    return IMAGE_PROVIDER_WANX;
  }
  if (!raw) {
    throw new RuntimeConfigError(['MEDIA_IMAGE_PROVIDER is required']);
  }
  throw new AppError(ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED);
}

export function isPaidImageProvider(id: string | undefined): boolean {
  return id === IMAGE_PROVIDER_WANX;
}

export function visualMaxConcurrency(): number {
  const value = Number(process.env.VISUAL_MAX_CONCURRENCY ?? DEFAULT_VISUAL_MAX_CONCURRENCY);
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_VISUAL_MAX_CONCURRENCY;
  }
  return Math.min(8, Math.floor(value));
}
