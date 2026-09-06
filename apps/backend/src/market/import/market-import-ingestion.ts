import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { buildMarketDataQuality } from '../market-data-quality.js';
import { normalizeMarketItems } from '../market-normalizer.js';
import { buildMarketSampleStats } from '../market-sample-stats.js';
import type { MarketItemKind, NormalizedMarketItem } from '../market.types.js';
import { parseMarketImportDateTimeIso } from './market-import-datetime.js';
import type { ParsedMarketImportRow, ResolvedMarketImportMapping } from './market-import.types.js';
import { mapCellsToMarketImportRow } from './market-import-row.js';

export type MarketImportRowResult = {
  rowNumber: number;
  cells: Record<string, string | null>;
  parsedItem?: Record<string, unknown>;
  canonicalKey?: string;
  warnings: string[];
  errors: string[];
};

export type MarketImportIngestionResult = {
  kind: MarketItemKind;
  items: NormalizedMarketItem[];
  rows: MarketImportRowResult[];
  warnings: string[];
  duplicateCount: number;
  collectedAt: string;
  collectedAtAssumed: boolean;
  sampleStats: ReturnType<typeof buildMarketSampleStats>;
  dataQuality: ReturnType<typeof buildMarketDataQuality>;
};

export function ingestParsedMarketImportRows(input: {
  kind: MarketItemKind;
  rows: ParsedMarketImportRow[];
  collectedAtOverride?: string | null;
  now?: Date;
  fileFingerprint: string;
  sourceContext?: string | null;
  extraWarnings?: string[];
}): MarketImportIngestionResult {
  const now = (input.now ?? new Date()).toISOString();
  const override = parseOverride(input.collectedAtOverride);
  let usedNow = false;
  const built: { row: ParsedMarketImportRow; raw: Record<string, unknown> }[] = [];
  const rowResults: MarketImportRowResult[] = [];

  for (const row of input.rows) {
    if (row.errors.length > 0) {
      rowResults.push({
        rowNumber: row.rowNumber,
        cells: row.cells,
        warnings: row.warnings,
        errors: row.errors,
      });
      continue;
    }
    const collectedAt = resolveRowCollectedAt(row.fields.collectedAt, override, now, () => {
      usedNow = true;
    });
    const raw = buildRawItem({
      kind: input.kind,
      fields: row.fields,
      collectedAt,
      fileFingerprint: input.fileFingerprint,
      sourceContext: (row.fields.sourceContext as string | undefined) ?? input.sourceContext ?? undefined,
    });
    built.push({ row, raw });
  }

  const normalizedItems: NormalizedMarketItem[] = [];
  const pending = [];
  for (const entry of built) {
    try {
      const single = normalizeMarketItems({ items: [entry.raw], collectedAt: override ?? now });
      const item = single.items[0];
      if (!item) {
        rowResults.push({
          rowNumber: entry.row.rowNumber,
          cells: entry.row.cells,
          warnings: entry.row.warnings,
          errors: ['row could not be normalized'],
        });
        continue;
      }
      pending.push({ row: entry.row, item });
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'row could not be normalized';
      rowResults.push({
        rowNumber: entry.row.rowNumber,
        cells: entry.row.cells,
        warnings: entry.row.warnings,
        errors: [message],
      });
    }
  }

  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const entry of pending) {
    if (seen.has(entry.item.canonicalKey)) {
      duplicateCount += 1;
      rowResults.push({
        rowNumber: entry.row.rowNumber,
        cells: entry.row.cells,
        parsedItem: publicParsedItem(entry.item),
        canonicalKey: entry.item.canonicalKey,
        warnings: [...entry.row.warnings, 'duplicate canonicalKey'],
        errors: [],
      });
      continue;
    }
    seen.add(entry.item.canonicalKey);
    normalizedItems.push(entry.item);
    rowResults.push({
      rowNumber: entry.row.rowNumber,
      cells: entry.row.cells,
      parsedItem: publicParsedItem(entry.item),
      canonicalKey: entry.item.canonicalKey,
      warnings: entry.row.warnings,
      errors: [],
    });
  }

  rowResults.sort((left, right) => left.rowNumber - right.rowNumber);
  const collectedAt = override ?? (usedNow ? now : (normalizedItems[0]?.collectedAt ?? now));
  const collectedAtAssumed = usedNow;
  const warnings = [...(input.extraWarnings ?? [])];
  if (collectedAtAssumed) {
    warnings.push('COLLECTED_AT_ASSUMED');
  }
  if (duplicateCount > 0) {
    warnings.push(`Removed ${duplicateCount} duplicate canonicalKey item(s)`);
  }
  return {
    kind: input.kind,
    items: normalizedItems,
    rows: rowResults,
    warnings,
    duplicateCount,
    collectedAt,
    collectedAtAssumed,
    sampleStats: buildMarketSampleStats(normalizedItems),
    dataQuality: buildMarketDataQuality({ items: normalizedItems, duplicateCount }),
  };
}

export function ingestMarketImportCells(input: {
  kind: MarketItemKind;
  mapping: ResolvedMarketImportMapping;
  rows: { rowNumber: number; cells: Record<string, unknown> }[];
  collectedAtOverride?: string | null;
  now?: Date;
  fileFingerprint: string;
  sourceContext?: string | null;
  extraWarnings?: string[];
}): MarketImportIngestionResult {
  const parsedRows = input.rows.map((row) =>
    mapCellsToMarketImportRow({
      rowNumber: row.rowNumber,
      cells: row.cells,
      mapping: input.mapping,
    }),
  );
  return ingestParsedMarketImportRows({
    kind: input.kind,
    rows: parsedRows,
    collectedAtOverride: input.collectedAtOverride,
    now: input.now,
    fileFingerprint: input.fileFingerprint,
    sourceContext: input.sourceContext,
    extraWarnings: input.extraWarnings,
  });
}

function parseOverride(value?: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }
  const iso = parseMarketImportDateTimeIso(value);
  if (!iso) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'collectedAtOverride is invalid');
  }
  return iso;
}

function resolveRowCollectedAt(
  rowValue: unknown,
  override: string | null,
  now: string,
  markAssumed: () => void,
): string {
  if (typeof rowValue === 'string' && rowValue) {
    return rowValue;
  }
  if (override) {
    return override;
  }
  markAssumed();
  return now;
}

function buildRawItem(input: {
  kind: MarketItemKind;
  fields: ParsedMarketImportRow['fields'];
  collectedAt: string;
  fileFingerprint: string;
  sourceContext?: string;
}): Record<string, unknown> {
  const fields = { ...input.fields };
  delete fields.collectedAt;
  const pageContext = input.sourceContext;
  return {
    kind: input.kind,
    platform: 'douyin',
    source: 'IMPORT',
    collectedAt: input.collectedAt,
    ...fields,
    provenance: {
      source: 'IMPORT',
      ...(pageContext ? { pageContext } : {}),
      importFileFingerprint: input.fileFingerprint,
    },
  };
}

function publicParsedItem(item: NormalizedMarketItem): Record<string, unknown> {
  return { ...item };
}
