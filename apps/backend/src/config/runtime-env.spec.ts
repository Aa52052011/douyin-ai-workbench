import { afterEach, describe, expect, it } from 'vitest';
import { resolveModelProviderId } from '../agents/models/model.config.js';
import { MockModelProvider } from '../agents/models/mock.provider.js';
import { ModelRouter } from '../agents/models/model.router.js';
import { RealModelProvider } from '../agents/models/real.provider.js';
import { resolveComposeProviderId } from '../media/ffmpeg/ffmpeg-config.js';
import { resolveTtsProviderId } from '../media/tts/tts-config.js';
import { IMAGE_PROVIDER_COLOR_BACKGROUND, resolveImageProviderId } from '../media/visual/visual-config.js';
import { RuntimeConfigError } from './runtime-config-error.js';
import { validateRuntimeEnvironment } from './runtime-env.js';

const SECRET = 'super-secret-model-key-do-not-leak';
const DB = 'postgresql://acf:password@localhost:5432/acf';

function productionBase(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'prod-jwt-secret',
    DATABASE_URL: DB,
    CORS_ORIGIN: 'https://app.example.com',
    REDIS_URL: 'redis://127.0.0.1:6379',
    MEDIA_STORAGE_ROOT: './storage',
    MODEL_PROVIDER: 'real',
    MODEL_API_KEY: SECRET,
    MODEL_BASE_URL: 'https://api.router.one/v1',
    MODEL_NAME: 'test-model',
    MEDIA_IMAGE_PROVIDER: 'color-background',
    MEDIA_TTS_PROVIDER: 'minimax-tts',
    MINIMAX_TTS_BASE_URL: 'https://api.minimax.chat',
    MINIMAX_TTS_API_KEY: 'minimax-secret-key',
    MINIMAX_TTS_MODEL: 'speech-2.8-turbo',
    MINIMAX_TTS_VOICE: 'voice-1',
    MEDIA_COMPOSE_PROVIDER: 'ffmpeg',
    ...overrides,
  };
}

function expectRejected(env: NodeJS.ProcessEnv, fragment: string) {
  try {
    validateRuntimeEnvironment({ env, role: 'api', probeFfmpeg: false });
    throw new Error('expected configuration to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeConfigError);
    expect((error as RuntimeConfigError).message).toContain(fragment);
    expect((error as RuntimeConfigError).message).not.toContain(SECRET);
    expect((error as RuntimeConfigError).message).not.toContain('password');
    expect((error as RuntimeConfigError).message).not.toContain('minimax-secret-key');
    return error as RuntimeConfigError;
  }
}

function boot(env: NodeJS.ProcessEnv, role: 'api' | 'worker' = 'api') {
  try {
    validateRuntimeEnvironment({ env, role, probeFfmpeg: false });
    return { listened: true };
  } catch {
    return { listened: false };
  }
}

describe('runtime environment policy', () => {
  const previous = {
    node: process.env.NODE_ENV,
    modelProvider: process.env.MODEL_PROVIDER,
  };

  afterEach(() => {
    process.env.NODE_ENV = previous.node;
    if (previous.modelProvider === undefined) {
      delete process.env.MODEL_PROVIDER;
    } else {
      process.env.MODEL_PROVIDER = previous.modelProvider;
    }
  });

  it('allows test mock without real keys', () => {
    const result = validateRuntimeEnvironment({
      env: { NODE_ENV: 'test' },
      role: 'api',
      probeFfmpeg: false,
    });
    expect(result.warnings).toEqual([]);
    expect(resolveModelProviderId({ NODE_ENV: 'test' })).toBe('mock');
    expect(resolveTtsProviderId({ NODE_ENV: 'test', MEDIA_TTS_PROVIDER: 'minimax-tts' })).toBe('mock');
    expect(resolveComposeProviderId({ NODE_ENV: 'test', MEDIA_COMPOSE_PROVIDER: 'ffmpeg' })).toBe('mock');
    expect(resolveImageProviderId({ NODE_ENV: 'test', MEDIA_IMAGE_PROVIDER: 'wanx' })).toBe(
      IMAGE_PROVIDER_COLOR_BACKGROUND,
    );
  });

  it('allows development explicit mock without real keys', () => {
    const env = {
      NODE_ENV: 'development',
      MODEL_PROVIDER: 'mock',
      MEDIA_TTS_PROVIDER: 'mock',
      MEDIA_COMPOSE_PROVIDER: 'mock',
      MEDIA_IMAGE_PROVIDER: 'color-background',
    };
    expect(validateRuntimeEnvironment({ env, role: 'api', probeFfmpeg: false }).warnings).toEqual([]);
    expect(resolveModelProviderId(env)).toBe('mock');
    expect(resolveTtsProviderId(env)).toBe('mock');
    expect(resolveComposeProviderId(env)).toBe('mock');
  });

  it('rejects production mock model and does not listen', () => {
    const error = expectRejected(productionBase({ MODEL_PROVIDER: 'mock' }), 'MODEL_PROVIDER=mock');
    expect(error.code).toBe('CONFIG_INVALID');
    expect(boot(productionBase({ MODEL_PROVIDER: 'mock' })).listened).toBe(false);
  });

  it('rejects production missing model provider', () => {
    const env = productionBase();
    delete env.MODEL_PROVIDER;
    expectRejected(env, 'MODEL_PROVIDER is required');
    expect(boot(env).listened).toBe(false);
  });

  it('rejects production real model missing key without leaking the secret', () => {
    const env = productionBase({ MODEL_API_KEY: '' });
    const error = expectRejected(env, 'MODEL_API_KEY is required');
    expect(error.message).not.toContain(SECRET);
  });

  it('accepts production real model valid config', () => {
    expect(validateRuntimeEnvironment({ env: productionBase(), role: 'api', probeFfmpeg: false }).warnings.length).toBeGreaterThanOrEqual(0);
    expect(boot(productionBase()).listened).toBe(true);
    expect(resolveModelProviderId(productionBase())).toBe('real');
  });

  it('rejects production mock TTS', () => {
    expectRejected(productionBase({ MEDIA_TTS_PROVIDER: 'mock' }), 'MEDIA_TTS_PROVIDER=mock');
    expect(boot(productionBase({ MEDIA_TTS_PROVIDER: 'mock' })).listened).toBe(false);
  });

  it('rejects production unknown TTS', () => {
    expectRejected(productionBase({ MEDIA_TTS_PROVIDER: 'minimax' }), 'Unknown MEDIA_TTS_PROVIDER');
  });

  it('rejects production MiniMax missing key', () => {
    expectRejected(productionBase({ MINIMAX_TTS_API_KEY: '' }), 'MINIMAX_TTS_API_KEY is required');
  });

  it('accepts production MiniMax valid config', () => {
    expect(boot(productionBase()).listened).toBe(true);
    expect(resolveTtsProviderId(productionBase())).toBe('minimax-tts');
  });

  it('rejects production mock compose', () => {
    expectRejected(productionBase({ MEDIA_COMPOSE_PROVIDER: 'mock' }), 'MEDIA_COMPOSE_PROVIDER=mock');
    expect(boot(productionBase({ MEDIA_COMPOSE_PROVIDER: 'mock' })).listened).toBe(false);
  });

  it('rejects production missing compose', () => {
    const env = productionBase();
    delete env.MEDIA_COMPOSE_PROVIDER;
    expectRejected(env, 'MEDIA_COMPOSE_PROVIDER is required');
  });

  it('accepts production ffmpeg when config is valid', () => {
    expect(resolveComposeProviderId(productionBase())).toBe('ffmpeg');
    expect(boot(productionBase()).listened).toBe(true);
  });

  it('rejects production missing visual', () => {
    const env = productionBase();
    delete env.MEDIA_IMAGE_PROVIDER;
    expectRejected(env, 'MEDIA_IMAGE_PROVIDER is required');
  });

  it('accepts production color-background', () => {
    expect(resolveImageProviderId(productionBase())).toBe(IMAGE_PROVIDER_COLOR_BACKGROUND);
  });

  it('rejects production Wanx missing key', () => {
    expectRejected(
      productionBase({
        MEDIA_IMAGE_PROVIDER: 'wanx',
        WANX_API_KEY: '',
        WANX_BASE_URL: 'https://example.cn-beijing.maas.aliyuncs.com/api/v1',
      }),
      'WANX_API_KEY is required',
    );
  });

  it('accepts production Wanx valid config', () => {
    const env = productionBase({
      MEDIA_IMAGE_PROVIDER: 'wanx',
      WANX_API_KEY: 'wanx-secret-key',
      WANX_BASE_URL: 'https://example.cn-beijing.maas.aliyuncs.com/api/v1',
      WANX_MODEL: 'wan2.6-t2i',
    });
    expect(boot(env).listened).toBe(true);
    expect(resolveImageProviderId(env)).toBe('wanx');
  });

  it('rejects unknown providers outside tests', () => {
    expect(() => resolveModelProviderId({ NODE_ENV: 'development', MODEL_PROVIDER: 'routerone' })).toThrow(
      /Unknown MODEL_PROVIDER/,
    );
    expect(() => resolveTtsProviderId({ NODE_ENV: 'development', MEDIA_TTS_PROVIDER: 'MINIMX' })).toThrow(
      /Unknown MEDIA_TTS_PROVIDER/,
    );
    expect(() => resolveComposeProviderId({ NODE_ENV: 'development', MEDIA_COMPOSE_PROVIDER: 'ffmepg' })).toThrow(
      /Unknown MEDIA_COMPOSE_PROVIDER/,
    );
    expect(() => resolveImageProviderId({ NODE_ENV: 'development', MEDIA_IMAGE_PROVIDER: 'WANXX' })).toThrow();
  });

  it('rejects missing JWT in production and allows the development fallback', () => {
    const env = productionBase({ JWT_ACCESS_SECRET: '' });
    expectRejected(env, 'JWT_ACCESS_SECRET is required');
    expect(
      validateRuntimeEnvironment({
        env: {
          NODE_ENV: 'development',
          MODEL_PROVIDER: 'mock',
          MEDIA_TTS_PROVIDER: 'mock',
          MEDIA_COMPOSE_PROVIDER: 'mock',
          MEDIA_IMAGE_PROVIDER: 'color-background',
        },
        role: 'api',
        probeFfmpeg: false,
      }).warnings,
    ).toEqual([]);
  });

  it('rejects missing DATABASE_URL and CORS in production', () => {
    expectRejected(productionBase({ DATABASE_URL: '' }), 'DATABASE_URL is required');
    expectRejected(productionBase({ CORS_ORIGIN: '' }), 'CORS_ORIGIN is required');
  });

  it('rejects missing Redis in production for api and worker', () => {
    const env = productionBase({ REDIS_URL: '' });
    expectRejected(env, 'REDIS_URL is required');
    expect(boot(env, 'worker').listened).toBe(false);
    expect(boot(productionBase(), 'worker').listened).toBe(true);
  });

  it('does not require Douyin or AI_ENGINE_URL', () => {
    const env = productionBase();
    delete env.DOUYIN_CLIENT_KEY;
    delete env.DOUYIN_CLIENT_SECRET;
    delete env.AI_ENGINE_URL;
    expect(boot(env).listened).toBe(true);
  });

  it('does not fall back to mock in production ModelRouter', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MODEL_PROVIDER;
    expect(() => new ModelRouter(new MockModelProvider(), new RealModelProvider())).toThrow(RuntimeConfigError);
  });

  it('keeps ModelRouter on mock in tests', async () => {
    process.env.NODE_ENV = 'test';
    const router = new ModelRouter(new MockModelProvider(), new RealModelProvider());
    const result = await router.generate({
      prompt: 'hello',
      systemPrompt: 'echo',
      agentId: 'system.echo',
      tenantId: 'tenant',
      task: 'echo',
    });
    expect(result.provider).toBe('mock');
  });
});
