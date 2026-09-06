import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_WANX_SIZE,
  joinWanxGenerationUrl,
  parseWanxSize,
  WANX_CAPABILITIES,
  WANX_GENERATION_PATH,
} from './wanx-config.js';

describe('wanx config', () => {
  const previous = process.env.WANX_SIZE;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.WANX_SIZE;
    } else {
      process.env.WANX_SIZE = previous;
    }
  });

  it('joins the official beijing sync generation path onto the workspace base url', () => {
    expect(joinWanxGenerationUrl('https://workspace.cn-beijing.maas.aliyuncs.com/api/v1')).toBe(
      `https://workspace.cn-beijing.maas.aliyuncs.com/api/v1${WANX_GENERATION_PATH}`,
    );
    expect(
      joinWanxGenerationUrl(`https://workspace.cn-beijing.maas.aliyuncs.com/api/v1${WANX_GENERATION_PATH}`),
    ).toBe(`https://workspace.cn-beijing.maas.aliyuncs.com/api/v1${WANX_GENERATION_PATH}`);
  });

  it('defaults to the official 9:16 portrait size', () => {
    delete process.env.WANX_SIZE;
    expect(parseWanxSize(undefined)).toBe(DEFAULT_WANX_SIZE);
    expect(DEFAULT_WANX_SIZE).toBe('960*1696');
    expect(WANX_CAPABILITIES.idempotency).toBe(false);
    expect(WANX_CAPABILITIES.taskLookup).toBe(false);
  });
});
