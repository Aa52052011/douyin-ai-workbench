import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../common/errors/app-error.js';
import type { MarketSourceValue } from './market.types.js';
import type { MarketDataProvider } from './market-provider.types.js';

@Injectable()
export class MarketDataProviderRegistry {
  resolve(source: MarketSourceValue): MarketDataProvider {
    throw new AppError(
      ErrorCode.MARKET_PROVIDER_NOT_IMPLEMENTED,
      `Market data provider is not implemented for ${source}`,
    );
  }
}
