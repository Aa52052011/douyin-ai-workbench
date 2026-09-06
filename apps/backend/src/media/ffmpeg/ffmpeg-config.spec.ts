import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import { parseFps, parseResolution, resolveComposeProviderId } from './ffmpeg-config.js';

describe('ffmpeg config', () => {
  const previous = {
    node: process.env.NODE_ENV,
    compose: process.env.MEDIA_COMPOSE_PROVIDER,
    run: process.env.RUN_FFMPEG_TESTS,
  };

  afterEach(() => {
    process.env.NODE_ENV = previous.node;
    if (previous.compose === undefined) {
      delete process.env.MEDIA_COMPOSE_PROVIDER;
    } else {
      process.env.MEDIA_COMPOSE_PROVIDER = previous.compose;
    }
    if (previous.run === undefined) {
      delete process.env.RUN_FFMPEG_TESTS;
    } else {
      process.env.RUN_FFMPEG_TESTS = previous.run;
    }
  });

  it('keeps mock compose in unit tests even if ffmpeg is selected', () => {
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_COMPOSE_PROVIDER = 'ffmpeg';
    delete process.env.RUN_FFMPEG_TESTS;
    expect(resolveComposeProviderId()).toBe('mock');
  });

  it('fails closed on unknown or missing compose outside tests', () => {
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_COMPOSE_PROVIDER = 'ffmepg';
    expect(() => resolveComposeProviderId()).toThrow(/Unknown MEDIA_COMPOSE_PROVIDER/);
    delete process.env.MEDIA_COMPOSE_PROVIDER;
    expect(() => resolveComposeProviderId()).toThrow(/MEDIA_COMPOSE_PROVIDER is required/);
  });

  it('rejects unsafe resolution and fps', () => {
    expect(() => parseResolution('100000x100000')).toThrow();
    expect(() => parseResolution('1081x1920')).toThrow();
    expect(() => parseFps(120)).toThrow();
    expect(parseResolution('1080x1920')).toEqual({ width: 1080, height: 1920 });
    expect(parseFps(30)).toBe(30);
    try {
      parseResolution('8x8');
    } catch (error) {
      expect((error as { code?: string }).code).toBe(ErrorCode.VIDEO_PLAN_INVALID);
    }
  });
});
