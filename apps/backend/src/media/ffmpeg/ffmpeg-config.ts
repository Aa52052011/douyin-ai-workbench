import { RuntimeConfigError } from '../../config/runtime-config-error.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';

export const ALLOWED_FPS = [24, 25, 30] as const;
export const MAX_COMPOSE_DURATION_SEC = 90;
export const MAX_COMPOSE_SCENES = 20;
export const MAX_DIMENSION = 1920;
export const MIN_DIMENSION = 16;
export const MAX_SUBTITLE_BYTES = 1_000_000;
export const DEFAULT_FFMPEG_TIMEOUT_MS = 180_000;
export const DEFAULT_FFMPEG_MAX_CONCURRENCY = 1;
export const MAX_FFMPEG_STDERR = 4_000;
export const MAX_FFMPEG_STDOUT = 65_536;

export function resolveComposeProviderId(env: NodeJS.ProcessEnv = process.env): 'mock' | 'ffmpeg' {
  if (env.NODE_ENV === 'test' && env.RUN_FFMPEG_TESTS !== 'true') {
    return 'mock';
  }
  const raw = env.MEDIA_COMPOSE_PROVIDER?.trim() ?? '';
  if (raw === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new RuntimeConfigError(['MEDIA_COMPOSE_PROVIDER=mock is not allowed in production']);
    }
    return 'mock';
  }
  if (raw === 'ffmpeg') {
    return 'ffmpeg';
  }
  if (!raw) {
    throw new RuntimeConfigError(['MEDIA_COMPOSE_PROVIDER is required']);
  }
  throw new RuntimeConfigError(['Unknown MEDIA_COMPOSE_PROVIDER']);
}

export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export function ffprobeBin(): string {
  return process.env.FFPROBE_PATH?.trim() || 'ffprobe';
}

export function ffmpegTimeoutMs(): number {
  const value = Number(process.env.FFMPEG_TIMEOUT_MS ?? DEFAULT_FFMPEG_TIMEOUT_MS);
  if (!Number.isFinite(value) || value < 1_000) {
    return DEFAULT_FFMPEG_TIMEOUT_MS;
  }
  return value;
}

export function ffmpegMaxConcurrency(): number {
  const value = Number(process.env.FFMPEG_MAX_CONCURRENCY ?? DEFAULT_FFMPEG_MAX_CONCURRENCY);
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_FFMPEG_MAX_CONCURRENCY;
  }
  return Math.min(8, Math.floor(value));
}

export function parseResolution(resolution: string | undefined): { width: number; height: number } {
  const match = /^(?<w>\d{2,4})x(?<h>\d{2,4})$/i.exec(resolution ?? '1080x1920');
  if (!match?.groups) {
    throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
  }
  const width = Number(match.groups.w);
  const height = Number(match.groups.h);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_DIMENSION ||
    height < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width % 2 !== 0 ||
    height % 2 !== 0
  ) {
    throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
  }
  return { width, height };
}

export function parseFps(fps: number | undefined): number {
  const value = fps ?? 30;
  if (!(ALLOWED_FPS as readonly number[]).includes(value)) {
    throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
  }
  return value;
}

export function assertComposeLimits(input: { sceneCount: number; voiceDuration: number; subtitleBytes?: number }): void {
  if (input.sceneCount < 1 || input.sceneCount > MAX_COMPOSE_SCENES) {
    throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
  }
  if (input.voiceDuration < 1 || input.voiceDuration > MAX_COMPOSE_DURATION_SEC) {
    throw new AppError(ErrorCode.VIDEO_PLAN_INVALID);
  }
  if (input.subtitleBytes != null && input.subtitleBytes > MAX_SUBTITLE_BYTES) {
    throw new AppError(ErrorCode.ASSET_INVALID_FILE);
  }
}

export function composeFailed(message = 'Video compose failed'): AppError {
  return new AppError(ErrorCode.VIDEO_PROVIDER_FAILED, message);
}
