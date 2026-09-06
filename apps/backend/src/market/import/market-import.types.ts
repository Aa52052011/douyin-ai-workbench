import type { MarketItemKind } from '../market.types.js';
import type {
  MarketImportFormat,
  MarketImportOrigin,
  MarketImportSelectionMethod,
} from './market-import.constants.js';

export type MarketImportField =
  | 'title'
  | 'externalContentId'
  | 'externalUrl'
  | 'author'
  | 'publishedAt'
  | 'durationSeconds'
  | 'views'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'favorites'
  | 'completionRate'
  | 'hashtags'
  | 'keywords'
  | 'collectedAt'
  | 'sourceContext'
  | 'keyword'
  | 'relatedKeywords'
  | 'searchRank'
  | 'trendScore'
  | 'volumeSignal'
  | 'competitionSignal'
  | 'displayName'
  | 'externalAccountId'
  | 'profileUrl'
  | 'followerCount'
  | 'recentPostCount'
  | 'postingFrequencySignal'
  | 'engagementSignal'
  | 'contentThemes'
  | 'name'
  | 'rank'
  | 'heatSignal'
  | 'category'
  | 'startedAt'
  | 'observedAt'
  | 'topic'
  | 'signalType'
  | 'frequency'
  | 'examples';

export type MarketImportFieldFormat =
  | 'string'
  | 'integer'
  | 'percent'
  | 'datetime'
  | 'duration'
  | 'list'
  | 'signal_enum'
  | 'score';

export type MarketImportTemplateColumn = {
  field: MarketImportField;
  required: boolean;
  format: MarketImportFieldFormat;
  description: string;
};

export type MarketImportTemplateDefinition = {
  kind: MarketItemKind;
  mappingVersion: string;
  columns: MarketImportTemplateColumn[];
};

export type ResolvedMarketImportMapping = {
  mappingVersion: string;
  kind: MarketItemKind;
  columns: Record<string, MarketImportField>;
  ignoredColumns: string[];
  warnings: string[];
};

export type MarketImportCells = Record<string, unknown>;

export type ParsedMarketImportRow = {
  rowNumber: number;
  cells: Record<string, string | null>;
  fields: Partial<Record<MarketImportField, unknown>>;
  warnings: string[];
  errors: string[];
};

export type ParsedMarketImportFile = {
  format: MarketImportFormat;
  fileName: string;
  mappingVersion: string;
  sheetName: string | null;
  detectedColumns: string[];
  resolvedMapping: ResolvedMarketImportMapping;
  rows: ParsedMarketImportRow[];
  warnings: string[];
};

export type MarketImportQueryContext = {
  source: 'IMPORT';
  kind: MarketItemKind;
  mappingVersion: string;
  fileFingerprint: string;
  normalizedItemsFingerprint: string;
  origin: MarketImportOrigin;
  selectionMethod: MarketImportSelectionMethod;
  sampleScope?: string;
  sourceContext?: string;
  collectedAt: string;
  collectedAtAssumed: boolean;
  itemCount: number;
  duplicateCount: number;
  productBriefId: string;
  productBriefVersion: number;
  idempotencyKey: string;
  idempotencyFingerprint: string;
};
