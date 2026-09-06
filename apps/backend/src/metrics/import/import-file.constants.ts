export const DOUYIN_EXPORT_MAPPING_VERSION = 'douyin-export-v1';

export const METRICS_IMPORT_MAX_FILE_BYTES = 1 * 1024 * 1024;

export const METRICS_IMPORT_MAX_ROWS = 200;

export const METRICS_IMPORT_MAX_COLUMNS = 40;

export const METRICS_IMPORT_MAX_CELL_CHARS = 2000;

export const METRICS_IMPORT_FORMATS = ['CSV', 'XLSX'] as const;

export type MetricsImportFormat = (typeof METRICS_IMPORT_FORMATS)[number];
