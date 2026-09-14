-- Step 13.12 Autonomous Research + Continuous Learning Foundation (additive)

ALTER TYPE "UsageOperationType" ADD VALUE IF NOT EXISTS 'MARKET_RESEARCH';
ALTER TYPE "UsageOperationType" ADD VALUE IF NOT EXISTS 'PERFORMANCE_LEARNING';

CREATE TYPE "ResearchRequestStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'NOT_CONFIGURED');
CREATE TYPE "ResearchEvidenceConfidence" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "StrategyRecommendationStatus" AS ENUM ('ACTIVE', 'APPLIED', 'SUPERSEDED', 'DISMISSED');

CREATE TABLE "research_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "status" "ResearchRequestStatus" NOT NULL DEFAULT 'PENDING',
    "goal" TEXT,
    "query_context" JSONB NOT NULL DEFAULT '{}',
    "seed_keywords" JSONB NOT NULL DEFAULT '[]',
    "seed_competitors" JSONB NOT NULL DEFAULT '[]',
    "seed_urls" JSONB NOT NULL DEFAULT '[]',
    "requested_by_user_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "query_hash" TEXT NOT NULL,
    "adapter_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "result_summary" JSONB,
    "usage_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "research_requests_id_tenant_id_key" ON "research_requests"("id", "tenant_id");
CREATE UNIQUE INDEX "research_requests_tenant_id_project_id_query_hash_key" ON "research_requests"("tenant_id", "project_id", "query_hash");
CREATE INDEX "research_requests_tenant_ws_project_created_idx" ON "research_requests"("tenant_id", "workspace_id", "project_id", "created_at");
CREATE INDEX "research_requests_tenant_id_status_idx" ON "research_requests"("tenant_id", "status");

ALTER TABLE "research_requests" ADD CONSTRAINT "research_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "research_requests" ADD CONSTRAINT "research_requests_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "research_requests" ADD CONSTRAINT "research_requests_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "research_evidences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "research_request_id" UUID,
    "source_type" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "external_id" TEXT,
    "canonical_url" TEXT,
    "content_hash" TEXT NOT NULL,
    "title" TEXT,
    "text_summary" TEXT,
    "raw_payload" JSONB,
    "normalized_payload" JSONB NOT NULL DEFAULT '{}',
    "captured_at" TIMESTAMP(3) NOT NULL,
    "confidence" "ResearchEvidenceConfidence" NOT NULL DEFAULT 'UNKNOWN',
    "provenance" TEXT NOT NULL,
    "reference_only" BOOLEAN NOT NULL DEFAULT true,
    "display_allowed" BOOLEAN NOT NULL DEFAULT false,
    "analysis_allowed" BOOLEAN NOT NULL DEFAULT true,
    "rights_status" TEXT,
    "source_policy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_evidences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "research_evidences_id_tenant_id_key" ON "research_evidences"("id", "tenant_id");
CREATE UNIQUE INDEX "research_evidences_tenant_project_content_hash_key" ON "research_evidences"("tenant_id", "project_id", "content_hash");
CREATE INDEX "research_evidences_tenant_ws_project_captured_idx" ON "research_evidences"("tenant_id", "workspace_id", "project_id", "captured_at");
CREATE INDEX "research_evidences_tenant_platform_external_id_idx" ON "research_evidences"("tenant_id", "platform", "external_id");
CREATE INDEX "research_evidences_tenant_canonical_url_idx" ON "research_evidences"("tenant_id", "canonical_url");
CREATE INDEX "research_evidences_tenant_request_idx" ON "research_evidences"("tenant_id", "research_request_id");

ALTER TABLE "research_evidences" ADD CONSTRAINT "research_evidences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "research_evidences" ADD CONSTRAINT "research_evidences_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "research_evidences" ADD CONSTRAINT "research_evidences_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "research_evidences" ADD CONSTRAINT "research_evidences_request_tenant_fkey" FOREIGN KEY ("research_request_id", "tenant_id") REFERENCES "research_requests"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "strategy_adjustment_recommendations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "StrategyRecommendationStatus" NOT NULL DEFAULT 'ACTIVE',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "source_watermark" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_adjustment_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "strategy_adjustment_recommendations_id_tenant_id_key" ON "strategy_adjustment_recommendations"("id", "tenant_id");
CREATE UNIQUE INDEX "sar_tenant_project_version_key" ON "strategy_adjustment_recommendations"("tenant_id", "project_id", "version");
CREATE UNIQUE INDEX "sar_tenant_project_watermark_key" ON "strategy_adjustment_recommendations"("tenant_id", "project_id", "source_watermark");
CREATE INDEX "sar_tenant_ws_project_status_idx" ON "strategy_adjustment_recommendations"("tenant_id", "workspace_id", "project_id", "status");

ALTER TABLE "strategy_adjustment_recommendations" ADD CONSTRAINT "sar_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy_adjustment_recommendations" ADD CONSTRAINT "sar_workspace_tenant_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy_adjustment_recommendations" ADD CONSTRAINT "sar_project_tenant_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
