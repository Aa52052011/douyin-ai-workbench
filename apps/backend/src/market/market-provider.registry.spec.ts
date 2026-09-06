import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/app-error.js';
import { MarketDataProviderRegistry } from './market-provider.registry.js';

describe('MarketDataProviderRegistry', () => {
  it('fails closed for reserved sources', () => {
    const registry = new MarketDataProviderRegistry();
    expect(() => registry.resolve('DOUYIN_OFFICIAL')).toThrow(
      expect.objectContaining({ code: ErrorCode.MARKET_PROVIDER_NOT_IMPLEMENTED }),
    );
    expect(() => registry.resolve('MANUAL')).toThrow(
      expect.objectContaining({ code: ErrorCode.MARKET_PROVIDER_NOT_IMPLEMENTED }),
    );
    expect(() => registry.resolve('IMPORT')).toThrow(
      expect.objectContaining({ code: ErrorCode.MARKET_PROVIDER_NOT_IMPLEMENTED }),
    );
  });
});
