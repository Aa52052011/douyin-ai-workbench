import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthzModule } from '../authz/authz.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { MetricsIngestionService } from './metrics-ingestion.service.js';
import { MetricsSyncExecutionService } from './metrics-sync-execution.service.js';
import { MetricsSyncService } from './metrics-sync.service.js';
import { MockMetricsProvider } from './mock-metrics.provider.js';
import { PlatformMetricsProviderRegistry } from './metrics-provider.registry.js';
import { METRICS_PROVIDER_REGISTRY } from './metrics-provider.types.js';
import { MetricsImportParser } from './import/metrics-import.parser.js';
import { MetricsImportConfirmService } from './metrics-import-confirm.service.js';
import { MetricsImportController } from './metrics-import.controller.js';
import { MetricsImportPreviewService } from './metrics-import-preview.service.js';
import { PublicationMetricsController } from './publication-metrics.controller.js';
import { PublicationMetricsMatcher } from './publication-metrics-matcher.js';
import { PublicationMetricsSnapshotWriter } from './publication-metrics-snapshot.writer.js';
import { PublicationMetricsService } from './publication-metrics.service.js';
import { PerformanceFeedbackService } from './performance-feedback.service.js';

@Module({
  imports: [AuthModule, AuthzModule, JobsModule],
  controllers: [PublicationMetricsController, MetricsImportController],
  providers: [
    PublicationMetricsService,
    PerformanceFeedbackService,
    PublicationMetricsSnapshotWriter,
    MetricsIngestionService,
    PublicationMetricsMatcher,
    MetricsImportParser,
    MetricsImportPreviewService,
    MetricsImportConfirmService,
    MetricsSyncService,
    MetricsSyncExecutionService,
    MockMetricsProvider,
    PlatformMetricsProviderRegistry,
    {
      provide: METRICS_PROVIDER_REGISTRY,
      useExisting: PlatformMetricsProviderRegistry,
    },
  ],
  exports: [
    PlatformMetricsProviderRegistry,
    METRICS_PROVIDER_REGISTRY,
    PublicationMetricsService,
    PerformanceFeedbackService,
    PublicationMetricsSnapshotWriter,
    MetricsIngestionService,
    PublicationMetricsMatcher,
    MetricsImportParser,
    MetricsImportPreviewService,
    MetricsImportConfirmService,
    MetricsSyncService,
    MetricsSyncExecutionService,
    MockMetricsProvider,
  ],
})
export class MetricsModule {}
