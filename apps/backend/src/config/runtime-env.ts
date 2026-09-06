import { resolveModelProviderId } from '../agents/models/model.config.js';
import { isFfmpegAvailable } from '../media/ffmpeg/ffmpeg-available.js';
import { resolveComposeProviderId } from '../media/ffmpeg/ffmpeg-config.js';
import { resolveTtsProviderId, TTS_PROVIDER_MINIMAX, TTS_PROVIDER_OPENAI } from '../media/tts/tts-config.js';
import { IMAGE_PROVIDER_WANX, resolveImageProviderId } from '../media/visual/visual-config.js';
import { RuntimeConfigError } from './runtime-config-error.js';

export { CONFIG_INVALID, RuntimeConfigError, formatRuntimeConfigError } from './runtime-config-error.js';

export type RuntimeEnvRole = 'api' | 'worker';

export type RuntimeValidationResult = {
  warnings: string[];
};

type EnvMap = NodeJS.ProcessEnv;

function isTest(env: EnvMap): boolean {
  return env.NODE_ENV === 'test';
}

function isProduction(env: EnvMap): boolean {
  return env.NODE_ENV === 'production';
}

function present(env: EnvMap, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function assertSafeHttpUrl(name: string, value: string | undefined, production: boolean): string | undefined {
  const raw = value?.trim() ?? '';
  if (!raw) {
    return `${name} is required`;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return `${name} must be http or https`;
    }
    if (production && url.protocol !== 'https:') {
      return `${name} must use https in production`;
    }
    return undefined;
  } catch {
    return `${name} is not a valid URL`;
  }
}

function safeIssue(error: unknown, fallback: string): string {
  if (error instanceof RuntimeConfigError) {
    return error.issues[0] ?? fallback;
  }
  const message = error instanceof Error ? error.message : fallback;
  if (/https?:\/\/|postgres(?:ql)?:\/\/|redis:\/\/|=[^\s]{8,}/i.test(message)) {
    return fallback;
  }
  return message || fallback;
}

export function validateRuntimeEnvironment(options?: {
  env?: EnvMap;
  role?: RuntimeEnvRole;
  probeFfmpeg?: boolean;
}): RuntimeValidationResult {
  const env = options?.env ?? process.env;
  const warnings: string[] = [];
  const issues: string[] = [];
  const production = isProduction(env);
  const test = isTest(env);

  if (production) {
    if (!present(env, 'JWT_ACCESS_SECRET')) {
      issues.push('JWT_ACCESS_SECRET is required');
    }
    if (!present(env, 'DATABASE_URL')) {
      issues.push('DATABASE_URL is required');
    }
    if (!present(env, 'CORS_ORIGIN')) {
      issues.push('CORS_ORIGIN is required');
    }
    if (!present(env, 'REDIS_URL')) {
      issues.push('REDIS_URL is required');
    }
    if (!present(env, 'MEDIA_STORAGE_ROOT')) {
      issues.push('MEDIA_STORAGE_ROOT is required');
    }
    if (env.COOKIE_SECURE !== 'true') {
      warnings.push('COOKIE_SECURE is not true; set COOKIE_SECURE=true for HTTPS deployments');
    }
  }

  try {
    const model = resolveModelProviderId(env);
    if (model === 'real') {
      if (!present(env, 'MODEL_API_KEY')) {
        issues.push('MODEL_API_KEY is required');
      }
      if (!present(env, 'MODEL_NAME')) {
        issues.push('MODEL_NAME is required');
      }
      const urlIssue = assertSafeHttpUrl('MODEL_BASE_URL', env.MODEL_BASE_URL, production);
      if (urlIssue) {
        issues.push(urlIssue);
      }
    }
  } catch (error) {
    issues.push(safeIssue(error, 'MODEL_PROVIDER is invalid'));
  }

  try {
    const visual = resolveImageProviderId(env);
    if (visual === IMAGE_PROVIDER_WANX) {
      if (!present(env, 'WANX_API_KEY')) {
        issues.push('WANX_API_KEY is required');
      }
      const urlIssue = assertSafeHttpUrl('WANX_BASE_URL', env.WANX_BASE_URL, production);
      if (urlIssue) {
        issues.push(urlIssue);
      }
    }
  } catch (error) {
    issues.push(safeIssue(error, 'MEDIA_IMAGE_PROVIDER is invalid'));
  }

  try {
    const tts = resolveTtsProviderId(env);
    if (tts === TTS_PROVIDER_OPENAI) {
      if (!present(env, 'TTS_API_KEY')) {
        issues.push('TTS_API_KEY is required');
      }
      if (!present(env, 'TTS_MODEL')) {
        issues.push('TTS_MODEL is required');
      }
      const urlIssue = assertSafeHttpUrl('TTS_BASE_URL', env.TTS_BASE_URL, production);
      if (urlIssue) {
        issues.push(urlIssue);
      }
    }
    if (tts === TTS_PROVIDER_MINIMAX) {
      if (!present(env, 'MINIMAX_TTS_API_KEY')) {
        issues.push('MINIMAX_TTS_API_KEY is required');
      }
      if (!present(env, 'MINIMAX_TTS_VOICE')) {
        issues.push('MINIMAX_TTS_VOICE is required');
      }
      const urlIssue = assertSafeHttpUrl('MINIMAX_TTS_BASE_URL', env.MINIMAX_TTS_BASE_URL, production);
      if (urlIssue) {
        issues.push(urlIssue);
      }
    }
  } catch (error) {
    issues.push(safeIssue(error, 'MEDIA_TTS_PROVIDER is invalid'));
  }

  try {
    const compose = resolveComposeProviderId(env);
    if (compose === 'ffmpeg' && options?.probeFfmpeg && !test) {
      if (!isFfmpegAvailable()) {
        issues.push('FFMPEG_UNAVAILABLE');
      }
    }
  } catch (error) {
    issues.push(safeIssue(error, 'MEDIA_COMPOSE_PROVIDER is invalid'));
  }

  void options?.role;

  if (issues.length > 0) {
    throw new RuntimeConfigError(issues);
  }
  return { warnings };
}
