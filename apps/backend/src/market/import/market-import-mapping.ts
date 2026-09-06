import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { MarketItemKind } from '../market.types.js';
import { findAliasField, normalizeMarketImportHeader } from './market-import-aliases.js';
import {
  MARKET_IMPORT_AUDIENCE_IDENTITY_HEADERS,
  MARKET_IMPORT_BLOCKED_HEAT_HEADERS,
  MARKET_IMPORT_BLOCKED_VOLUME_HEADERS,
  MARKET_IMPORT_CONTROL_COLUMNS,
  MARKET_IMPORT_DANGEROUS_KEYS,
  MARKET_IMPORT_FORBIDDEN_TARGETS,
  MARKET_IMPORT_MAPPING_VERSION,
  MARKET_IMPORT_REQUIRED_BY_KIND,
} from './market-import.constants.js';
import type { MarketImportField, ResolvedMarketImportMapping } from './market-import.types.js';
import { isMarketImportFieldForKind } from './market-import-templates.js';

const FORBIDDEN_TARGETS = new Set<string>(MARKET_IMPORT_FORBIDDEN_TARGETS);
const CONTROL_COLUMNS = new Set(MARKET_IMPORT_CONTROL_COLUMNS.map(normalizeMarketImportHeader));
const BLOCKED_VOLUME = new Set(MARKET_IMPORT_BLOCKED_VOLUME_HEADERS.map(normalizeMarketImportHeader));
const BLOCKED_HEAT = new Set(MARKET_IMPORT_BLOCKED_HEAT_HEADERS.map(normalizeMarketImportHeader));
const AUDIENCE_IDENTITY = new Set(MARKET_IMPORT_AUDIENCE_IDENTITY_HEADERS.map(normalizeMarketImportHeader));
const DANGEROUS = new Set<string>(MARKET_IMPORT_DANGEROUS_KEYS);

export function sanitizeDetectedColumns(headers: unknown[]): string[] {
  const columns: string[] = [];
  for (const header of headers) {
    const name = typeof header === 'string' ? header.replace(/\uFEFF/g, '').trim() : header == null ? '' : String(header);
    if (!name || DANGEROUS.has(name.toLowerCase())) {
      columns.push(name);
      continue;
    }
    columns.push(name);
  }
  return columns;
}

export function resolveMarketImportMapping(input: {
  kind: MarketItemKind;
  detectedColumns: string[];
  customMapping?: Record<string, string> | null;
}): ResolvedMarketImportMapping {
  const warnings: string[] = [];
  const ignoredColumns: string[] = [];
  const columns: Record<string, MarketImportField> = Object.create(null);
  const usedTargets = new Map<MarketImportField, string>();
  const custom = sanitizeCustomMapping(input.customMapping);

  if (input.kind === 'AUDIENCE_SIGNAL') {
    const identity = input.detectedColumns.filter((column) => AUDIENCE_IDENTITY.has(normalizeMarketImportHeader(column)));
    if (identity.length > 0 || Object.entries(custom).some(([source, target]) => isAudienceIdentity(source, target))) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'audience identity columns are not allowed');
    }
  }

  for (const [source, target] of Object.entries(custom)) {
    if (BLOCKED_VOLUME.has(normalizeMarketImportHeader(source)) || target === 'searchVolume') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'searchVolume cannot be mapped');
    }
    assertMappableTarget(input.kind, target);
    if (!input.detectedColumns.includes(source)) {
      warnings.push(`Custom mapping source column "${source}" was not found`);
    }
  }

  for (const column of input.detectedColumns) {
    if (!column.trim() || DANGEROUS.has(column.toLowerCase())) {
      ignoredColumns.push(column);
      continue;
    }
    const normalized = normalizeMarketImportHeader(column);
    if (CONTROL_COLUMNS.has(normalized) || FORBIDDEN_TARGETS.has(normalized)) {
      ignoredColumns.push(column);
      warnings.push(`Ignored control column "${column}"`);
      continue;
    }
    if (BLOCKED_VOLUME.has(normalized)) {
      ignoredColumns.push(column);
      warnings.push(`searchVolume cannot be mapped; use volumeSignal`);
      continue;
    }
    if (BLOCKED_HEAT.has(normalized)) {
      ignoredColumns.push(column);
      warnings.push(`Official or numeric heat columns cannot be mapped; use heatSignal`);
      continue;
    }

    let target: MarketImportField | null = null;
    if (Object.prototype.hasOwnProperty.call(custom, column)) {
      target = custom[column] as MarketImportField;
    } else {
      target = findAliasField(input.kind, column);
    }

    if (!target) {
      ignoredColumns.push(column);
      warnings.push(`Unknown column "${column}"`);
      continue;
    }

    const previous = usedTargets.get(target);
    if (previous) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `target field ${target} is mapped more than once`);
    }
    usedTargets.set(target, column);
    columns[column] = target;
  }

  for (const required of MARKET_IMPORT_REQUIRED_BY_KIND[input.kind]) {
    if (![...usedTargets.keys()].includes(required as MarketImportField)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `required field ${required} is not mapped`);
    }
  }

  return {
    mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
    kind: input.kind,
    columns,
    ignoredColumns,
    warnings,
  };
}

export function validateResolvedMapping(input: {
  kind: MarketItemKind;
  mapping: Record<string, string>;
}): ResolvedMarketImportMapping {
  const columns: Record<string, MarketImportField> = Object.create(null);
  const usedTargets = new Map<string, string>();
  for (const [source, target] of Object.entries(sanitizeCustomMapping(input.mapping))) {
    assertMappableTarget(input.kind, target);
    if (usedTargets.has(target)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `target field ${target} is mapped more than once`);
    }
    usedTargets.set(target, source);
    columns[source] = target as MarketImportField;
  }
  for (const required of MARKET_IMPORT_REQUIRED_BY_KIND[input.kind]) {
    if (!usedTargets.has(required)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, `required field ${required} is not mapped`);
    }
  }
  if (input.kind === 'AUDIENCE_SIGNAL') {
    for (const [source, target] of Object.entries(columns)) {
      if (isAudienceIdentity(source, target)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'audience identity columns are not allowed');
      }
    }
  }
  return {
    mappingVersion: MARKET_IMPORT_MAPPING_VERSION,
    kind: input.kind,
    columns,
    ignoredColumns: [],
    warnings: [],
  };
}

function sanitizeCustomMapping(mapping?: Record<string, string> | null): Record<string, string> {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    return {};
  }
  const next: Record<string, string> = Object.create(null);
  for (const [source, target] of Object.entries(mapping)) {
    if (DANGEROUS.has(source.toLowerCase()) || DANGEROUS.has(String(target).toLowerCase())) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'mapping contains forbidden keys');
    }
    if (typeof target !== 'string' || !source.trim()) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'mapping is invalid');
    }
    next[source] = target;
  }
  return next;
}

function assertMappableTarget(kind: MarketItemKind, target: string): void {
  const normalized = normalizeMarketImportHeader(target);
  if (FORBIDDEN_TARGETS.has(target) || FORBIDDEN_TARGETS.has(normalized) || CONTROL_COLUMNS.has(normalized)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `mapping target ${target} is not allowed`);
  }
  if (BLOCKED_VOLUME.has(normalized) || target === 'searchVolume') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'searchVolume cannot be mapped');
  }
  if (!isMarketImportFieldForKind(kind, target)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `mapping target ${target} is not allowed for ${kind}`);
  }
}

function isAudienceIdentity(source: string, target: string): boolean {
  return AUDIENCE_IDENTITY.has(normalizeMarketImportHeader(source)) || AUDIENCE_IDENTITY.has(normalizeMarketImportHeader(target));
}
