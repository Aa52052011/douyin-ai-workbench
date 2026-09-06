import type { TrendDataSnapshot } from '../definitions/content-planning.types.js';

export type TrendDataQuery = {
  platform?: string;
};

export interface TrendDataProvider {
  getSnapshot(query?: TrendDataQuery): Promise<TrendDataSnapshot | null>;
}
