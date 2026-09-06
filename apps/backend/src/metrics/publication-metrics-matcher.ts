import { Injectable } from '@nestjs/common';
import { PrismaClient, type Publication } from '@prisma/client';
import { parseDouyinItemIdFromUrl } from './parse-douyin-item-id.js';

export const PublicationMatchKind = {
  EXACT: 'EXACT',
  WEAK: 'WEAK',
  AMBIGUOUS: 'AMBIGUOUS',
  UNMATCHED: 'UNMATCHED',
} as const;

export type PublicationMatchKindValue = (typeof PublicationMatchKind)[keyof typeof PublicationMatchKind];

export type PublicationMatchBy =
  | 'publicationId'
  | 'externalPostId'
  | 'externalUrl'
  | 'titlePublishedAt';

export type PublicationMatchQuery = {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  publicationId?: string | null;
  externalPostId?: string | null;
  itemId?: string | null;
  externalUrl?: string | null;
  title?: string | null;
  publishedAt?: Date | string | null;
};

export type PublicationMatchResult = {
  kind: PublicationMatchKindValue;
  publicationIds: string[];
  matchedBy: PublicationMatchBy | null;
};

@Injectable()
export class PublicationMetricsMatcher {
  constructor(private readonly prisma: PrismaClient) {}

  async match(query: PublicationMatchQuery): Promise<PublicationMatchResult> {
    const scope = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      projectId: query.projectId,
    };

    const publicationId = trimToNull(query.publicationId);
    if (publicationId) {
      const row = await this.prisma.publication.findFirst({
        where: { id: publicationId, ...scope },
        select: { id: true },
      });
      return row
        ? exact([row.id], 'publicationId')
        : unmatched();
    }

    const itemId =
      trimToNull(query.externalPostId) ??
      trimToNull(query.itemId) ??
      parseDouyinItemIdFromUrl(query.externalUrl);
    if (itemId) {
      const rows = await this.prisma.publication.findMany({
        where: {
          ...scope,
          OR: [{ externalPostId: itemId }, { providerItemId: itemId }],
        },
        select: { id: true },
        take: 5,
      });
      const ranked = rank(rows, 'EXACT', 'externalPostId');
      if (ranked.kind !== PublicationMatchKind.UNMATCHED) {
        return ranked;
      }
    }

    const externalUrl = trimToNull(query.externalUrl);
    if (externalUrl) {
      const rows = await this.prisma.publication.findMany({
        where: { ...scope, externalUrl },
        select: { id: true },
        take: 5,
      });
      const ranked = rank(rows, 'EXACT', 'externalUrl');
      if (ranked.kind !== PublicationMatchKind.UNMATCHED) {
        return ranked;
      }
    }

    const title = trimToNull(query.title);
    const publishedDay = utcDayRange(query.publishedAt);
    if (title && publishedDay) {
      const rows = await this.prisma.publication.findMany({
        where: {
          ...scope,
          title,
          publishedAt: { gte: publishedDay.start, lt: publishedDay.end },
        },
        select: { id: true },
        take: 5,
      });
      return rank(rows, 'WEAK', 'titlePublishedAt');
    }

    return unmatched();
  }
}

function rank(
  rows: Pick<Publication, 'id'>[],
  strength: 'EXACT' | 'WEAK',
  matchedBy: PublicationMatchBy,
): PublicationMatchResult {
  if (rows.length === 0) {
    return unmatched();
  }
  if (rows.length > 1) {
    return {
      kind: PublicationMatchKind.AMBIGUOUS,
      publicationIds: rows.map((row) => row.id),
      matchedBy,
    };
  }
  return {
    kind: strength === 'WEAK' ? PublicationMatchKind.WEAK : PublicationMatchKind.EXACT,
    publicationIds: [rows[0]!.id],
    matchedBy,
  };
}

function exact(publicationIds: string[], matchedBy: PublicationMatchBy): PublicationMatchResult {
  return { kind: PublicationMatchKind.EXACT, publicationIds, matchedBy };
}

function unmatched(): PublicationMatchResult {
  return { kind: PublicationMatchKind.UNMATCHED, publicationIds: [], matchedBy: null };
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function utcDayRange(value: Date | string | null | undefined): { start: Date; end: Date } | null {
  if (value == null || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
