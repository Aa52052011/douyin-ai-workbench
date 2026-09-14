import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { AuthModule } from '../../auth/auth.module.js';
import { AuthzModule } from '../../authz/authz.module.js';
import { CropReviewController } from './crop-review.controller.js';
import { CropReviewFlowEngine } from './review-flow-engine.js';
import { CropApprovalPersistenceService } from '../crop-approval-persistence/approval-persistence.js';
import { CropExecutionRunController } from '../crop-approval-persistence/crop-execution-run.controller.js';
import { DurableCropReviewHttpService } from '../crop-approval-persistence/durable-http.service.js';
import { CropReviewPreviewRuntimeService } from '../crop-approval-persistence/crop-review-preview-runtime.service.js';
import { DynamicPreviewRuntimeService } from '../dynamic-reframe/dynamic-preview-runtime.service.js';
import { EditorialPreviewRuntimeService } from '../editorial-shot-runtime/editorial-preview-runtime.service.js';
import { SourceAwarePreviewRuntimeService } from '../source-aware-preview/source-aware-preview-runtime.service.js';
import { PG_POOL, PgCropReviewRepository } from '../crop-approval-persistence/pg-repository.js';
import { PgOutputSelectionRepository } from '../source-aware-output/output-selection.repository.js';
import { FileExecutionPlanStore } from '../source-aware-output/execution-plan-store.js';
import { FileVisualApprovalStore } from '../source-aware-output/visual-approval-store.js';
import { FileProductionAuthorizationStore } from '../source-aware-output/production-authorization-store.js';
import { FileFinalProductionReviewStore } from '../source-aware-output/final-production-review-store.js';

class CropReviewPgPoolShutdown implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [CropReviewController, CropExecutionRunController],
  providers: [
    CropReviewFlowEngine,
    CropApprovalPersistenceService,
    {
      provide: PG_POOL,
      useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
    },
    PgCropReviewRepository,
    PgOutputSelectionRepository,
    {
      provide: FileExecutionPlanStore,
      useFactory: () => new FileExecutionPlanStore(process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()),
    },
    {
      provide: FileVisualApprovalStore,
      useFactory: () => new FileVisualApprovalStore(process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()),
    },
    {
      provide: FileProductionAuthorizationStore,
      useFactory: () => new FileProductionAuthorizationStore(process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()),
    },
    {
      provide: FileFinalProductionReviewStore,
      useFactory: () => new FileFinalProductionReviewStore(process.env.CROP_REVIEW_REPO_ROOT ?? process.cwd()),
    },
    DurableCropReviewHttpService,
    CropReviewPreviewRuntimeService,
    DynamicPreviewRuntimeService,
    EditorialPreviewRuntimeService,
    SourceAwarePreviewRuntimeService,
    CropReviewPgPoolShutdown,
  ],
})
export class CropReviewModule {}
