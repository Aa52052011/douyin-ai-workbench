import { Injectable } from '@nestjs/common';
import type { TrendDataSnapshot } from '../definitions/content-planning.types.js';
import type { TrendDataProvider, TrendDataQuery } from './trend-data.provider.js';

@Injectable()
export class EmptyTrendDataProvider implements TrendDataProvider {
  async getSnapshot(_query?: TrendDataQuery): Promise<TrendDataSnapshot | null> {
    return null;
  }
}
