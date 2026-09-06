import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../common/errors/app-error.js';
import {
  DEFAULT_VISUAL_MAX_CONCURRENCY,
  IMAGE_PROVIDER_COLOR_BACKGROUND,
  resolveImageProviderId,
  visualMaxConcurrency,
} from './visual-config.js';

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('visual config', () => {
  const previous = {
    node: process.env.NODE_ENV,
    image: process.env.MEDIA_IMAGE_PROVIDER,
    run: process.env.RUN_REAL_VISUAL_TESTS,
    concurrency: process.env.VISUAL_MAX_CONCURRENCY,
  };

  afterEach(() => {
    process.env.NODE_ENV = previous.node;
    restoreEnv('MEDIA_IMAGE_PROVIDER', previous.image);
    restoreEnv('RUN_REAL_VISUAL_TESTS', previous.run);
    restoreEnv('VISUAL_MAX_CONCURRENCY', previous.concurrency);
  });

  it('forces the local provider in tests even if a paid name is selected', () => {
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_IMAGE_PROVIDER = 'wanx';
    delete process.env.RUN_REAL_VISUAL_TESTS;
    expect(resolveImageProviderId()).toBe(IMAGE_PROVIDER_COLOR_BACKGROUND);
  });

  it('allows wanx outside ordinary tests', () => {
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_IMAGE_PROVIDER = 'wanx';
    expect(resolveImageProviderId()).toBe('wanx');
  });

  it('allows wanx in test only when real visual tests are opted in', () => {
    process.env.NODE_ENV = 'test';
    process.env.RUN_REAL_VISUAL_TESTS = 'true';
    process.env.MEDIA_IMAGE_PROVIDER = 'wanx';
    expect(resolveImageProviderId()).toBe('wanx');
  });

  it('requires an explicit visual provider outside tests', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MEDIA_IMAGE_PROVIDER;
    expect(() => resolveImageProviderId()).toThrow(/MEDIA_IMAGE_PROVIDER is required/);
  });

  it('does not implement reserved paid providers', () => {
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_IMAGE_PROVIDER = 'minimax-image';
    expect(() => resolveImageProviderId()).toThrow(
      expect.objectContaining({ code: ErrorCode.VISUAL_PROVIDER_NOT_CONFIGURED }),
    );
  });

  it('defaults concurrency to 1', () => {
    delete process.env.VISUAL_MAX_CONCURRENCY;
    expect(visualMaxConcurrency()).toBe(DEFAULT_VISUAL_MAX_CONCURRENCY);
    process.env.VISUAL_MAX_CONCURRENCY = '0';
    expect(visualMaxConcurrency()).toBe(DEFAULT_VISUAL_MAX_CONCURRENCY);
  });
});
