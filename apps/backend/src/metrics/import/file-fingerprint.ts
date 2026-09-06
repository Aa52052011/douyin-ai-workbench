import { createHash } from 'node:crypto';
import type { NormalizedPublicationMetrics } from '../ingestion.types.js';

export function hashImportFile(buffer: Buffer, mappingVersion: string): string {
  return createHash('sha256').update(buffer).update('\0').update(mappingVersion).digest('hex');
}

export function fileImportIdempotencyKey(input: {
  mappingVersion: string;
  publicationId: string;
  observedAt: Date;
  metrics: NormalizedPublicationMetrics;
  provider: 'CSV_IMPORT' | 'XLSX_IMPORT';
}): string {
  const metrics = JSON.stringify({
    views: input.metrics.views,
    likes: input.metrics.likes,
    comments: input.metrics.comments,
    shares: input.metrics.shares,
    favorites: input.metrics.favorites,
    averageWatchTimeSeconds: input.metrics.averageWatchTimeSeconds,
    completionRate: input.metrics.completionRate,
    newFollowers: input.metrics.newFollowers,
  });
  return createHash('sha256')
    .update(input.mappingVersion)
    .update('\0')
    .update(input.publicationId)
    .update('\0')
    .update(input.observedAt.toISOString())
    .update('\0')
    .update(metrics)
    .update('\0')
    .update(input.provider)
    .digest('hex');
}
