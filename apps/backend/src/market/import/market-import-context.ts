import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { MARKET_STRING_LIMITS } from '../market.constants.js';
import {
  MARKET_IMPORT_ORIGINS,
  MARKET_IMPORT_SELECTION_METHODS,
} from './market-import.constants.js';
import type { MarketImportOrigin, MarketImportSelectionMethod } from './market-import.constants.js';

export function resolveMarketImportOrigin(value?: string | null): MarketImportOrigin {
  if (value == null || value === '') {
    return 'UNKNOWN';
  }
  if (!(MARKET_IMPORT_ORIGINS as readonly string[]).includes(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'origin is invalid');
  }
  return value as MarketImportOrigin;
}

export function resolveMarketImportSelectionMethod(value?: string | null): MarketImportSelectionMethod {
  if (value == null || value === '') {
    return 'UNKNOWN';
  }
  if (!(MARKET_IMPORT_SELECTION_METHODS as readonly string[]).includes(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'selectionMethod is invalid');
  }
  return value as MarketImportSelectionMethod;
}

export function resolveMarketImportShortText(value: unknown, field: string): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} is invalid`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > MARKET_STRING_LIMITS.pageContext) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field} exceeds ${MARKET_STRING_LIMITS.pageContext} characters`);
  }
  return trimmed;
}
