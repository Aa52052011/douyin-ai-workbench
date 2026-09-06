import type { NormalizedPublicationMetrics } from '../ingestion.types.js';
import type { PublicationMatchResult } from '../publication-metrics-matcher.js';
import type { MetricsImportFormat } from './import-file.constants.js';

export type ParsedMetricsImportRow = {
  rowNumber: number;
  rawTitle: string | null;
  rawUrl: string | null;
  externalPostId: string | null;
  publishedAt: Date | null;
  observedAt: Date | null;
  providerCollectedAt: Date | null;
  metrics: Partial<NormalizedPublicationMetrics>;
  rawColumns: Record<string, string>;
  warnings: string[];
  errors: string[];
};

export type ParsedMetricsImportFile = {
  format: MetricsImportFormat;
  fileName: string;
  mappingVersion: string;
  sheetName: string | null;
  rows: ParsedMetricsImportRow[];
  warnings: string[];
};

export type MetricsImportPreviewRow = {
  rowNumber: number;
  parsed: {
    title: string | null;
    url: string | null;
    externalPostId: string | null;
    publishedAt: string | null;
    observedAt: string | null;
    providerCollectedAt: string | null;
    metrics: Partial<NormalizedPublicationMetrics>;
  };
  matchResult: PublicationMatchResult;
  suggestedPublicationId: string | null;
  warnings: string[];
  errors: string[];
};

export type MetricsImportPreviewResult = {
  fileName: string;
  format: MetricsImportFormat;
  mappingVersion: string;
  fileFingerprint: string;
  rows: MetricsImportPreviewRow[];
  summary: {
    totalRows: number;
    exactMatches: number;
    weakMatches: number;
    ambiguous: number;
    unmatched: number;
    invalid: number;
  };
};
