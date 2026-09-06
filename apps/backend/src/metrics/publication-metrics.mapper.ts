import { Prisma, type PublicationMetricSnapshot } from '@prisma/client';

export type PublicationMetricSnapshotPublic = {
  id: string;
  publicationId: string;
  platform: string;
  source: string;
  observedAt: Date;
  providerCollectedAt: Date | null;
  createdAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  averageWatchTimeSeconds: number | null;
  completionRate: number | null;
  newFollowers: number | null;
  provider: string | null;
};

export function decimalToJsonNumber(
  value: Prisma.Decimal | { toString(): string } | number | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = new Prisma.Decimal(value.toString());
  const n = parsed.toNumber();
  return Number.isFinite(n) ? n : null;
}

export function toPublicMetricSnapshot(row: PublicationMetricSnapshot): PublicationMetricSnapshotPublic {
  return {
    id: row.id,
    publicationId: row.publicationId,
    platform: row.platform,
    source: row.source,
    observedAt: row.observedAt,
    providerCollectedAt: row.providerCollectedAt,
    createdAt: row.createdAt,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    favorites: row.favorites,
    averageWatchTimeSeconds: decimalToJsonNumber(row.averageWatchTimeSeconds),
    completionRate: decimalToJsonNumber(row.completionRate),
    newFollowers: row.newFollowers,
    provider: row.provider,
  };
}
