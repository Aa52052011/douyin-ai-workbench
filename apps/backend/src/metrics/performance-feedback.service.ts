import { Injectable } from '@nestjs/common';
import { PrismaClient, PublicationStatus } from '@prisma/client';
import { generatePerformanceInsights } from './performance-insight.engine.js';
import {
  DEFAULT_FEEDBACK_PUBLICATION_LIMIT,
  MAX_FEEDBACK_PUBLICATION_LIMIT,
} from './performance-feedback.constants.js';
import {
  buildPerformanceFeedback,
  selectRecentPublishedPublications,
} from './performance-feedback.builder.js';
import type { CompactPerformanceFeedback } from './performance-feedback.types.js';
import { aggregatePublicationPerformance } from './publication-metrics-aggregator.js';
import { toPublicMetricSnapshot } from './publication-metrics.mapper.js';
import { METRIC_SNAPSHOT_ORDER } from './snapshot-order.js';

export type FeedbackProjectScope = {
  tenantId: string;
  workspaceId: string;
  projectId: string;
};

@Injectable()
export class PerformanceFeedbackService {
  constructor(private readonly prisma: PrismaClient) {}

  async buildForProject(
    scope: FeedbackProjectScope,
    generatedAt: Date = new Date(),
  ): Promise<CompactPerformanceFeedback> {
    const limit = DEFAULT_FEEDBACK_PUBLICATION_LIMIT;
    const rows = await this.prisma.publication.findMany({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        status: PublicationStatus.PUBLISHED,
        publishedAt: { not: null },
      },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        projectId: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        title: true,
        videoId: true,
        platform: true,
      },
    });
    const selected = selectRecentPublishedPublications(rows, scope, Math.min(limit, MAX_FEEDBACK_PUBLICATION_LIMIT));
    if (selected.length === 0) {
      return buildPerformanceFeedback({ publications: [], generatedAt });
    }
    const snapshots = await this.prisma.publicationMetricSnapshot.findMany({
      where: {
        tenantId: scope.tenantId,
        publicationId: { in: selected.map((row) => row.id) },
      },
      orderBy: METRIC_SNAPSHOT_ORDER,
    });
    const byPublication = new Map<string, typeof snapshots>();
    for (const row of snapshots) {
      const list = byPublication.get(row.publicationId) ?? [];
      list.push(row);
      byPublication.set(row.publicationId, list);
    }
    const publications = selected.map((publication) => {
      const rowsForPub = byPublication.get(publication.id) ?? [];
      const summary = aggregatePublicationPerformance({
        publication: {
          id: publication.id,
          videoId: publication.videoId,
          platform: publication.platform,
          publishedAt: publication.publishedAt,
        },
        snapshots: rowsForPub.map((row) => {
          const mapped = toPublicMetricSnapshot(row);
          return {
            id: mapped.id,
            source: mapped.source,
            observedAt: mapped.observedAt,
            createdAt: mapped.createdAt,
            views: mapped.views,
            likes: mapped.likes,
            comments: mapped.comments,
            shares: mapped.shares,
            favorites: mapped.favorites,
            averageWatchTimeSeconds: mapped.averageWatchTimeSeconds,
            completionRate: mapped.completionRate,
            newFollowers: mapped.newFollowers,
          };
        }),
        generatedAt,
      });
      return {
        publicationId: publication.id,
        title: publication.title,
        publishedAt: publication.publishedAt,
        insight: generatePerformanceInsights(summary, generatedAt),
      };
    });
    return buildPerformanceFeedback({ publications, generatedAt });
  }
}
