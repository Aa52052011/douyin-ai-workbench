-- Step 13.11 Usage / Cost Metering Foundation (additive)

CREATE TYPE "UsageEventStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "UsageResourceType" AS ENUM ('LLM', 'VISION', 'EMBEDDING', 'TTS', 'VOICE_CLONE', 'AI_IMAGE', 'AI_VIDEO', 'DIGITAL_HUMAN', 'ASR', 'STORAGE', 'BANDWIDTH', 'TRANSCODE', 'LOCAL_COMPUTE', 'OTHER');
CREATE TYPE "UsageOperationType" AS ENUM ('AGENT_RUN', 'REFERENCE_ANALYSIS', 'PRODUCTION_DIRECTOR', 'SCRIPT_GENERATION', 'IMAGE_GENERATION', 'VOICE_SYNTHESIS', 'VOICE_CLONE_CREATE', 'DIGITAL_HUMAN_CREATE', 'DIGITAL_HUMAN_GENERATE', 'AI_VIDEO_GENERATE', 'FFMPEG_COMPOSE', 'QUALITY_CHECK', 'QUALITY_REPAIR', 'ASSET_UPLOAD', 'STORAGE_WRITE', 'OTHER');
CREATE TYPE "UsageUnitType" AS ENUM ('TOKENS', 'CHARACTERS', 'SECONDS', 'IMAGES', 'REQUESTS', 'BYTES', 'MILLISECONDS', 'UNITS');
CREATE TYPE "CostLedgerStatus" AS ENUM ('ESTIMATED', 'FINAL', 'UNPRICED', 'WAIVED', 'REFUNDED', 'FAILED');

CREATE TABLE "usage_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "user_id" UUID,
    "video_id" UUID,
    "job_id" UUID,
    "agent_run_id" UUID,
    "operation_type" "UsageOperationType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "resource_type" "UsageResourceType" NOT NULL,
    "status" "UsageEventStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "input_units" DECIMAL(18,6),
    "output_units" DECIMAL(18,6),
    "total_units" DECIMAL(18,6),
    "unit_type" "UsageUnitType",
    "duration_seconds" DECIMAL(18,6),
    "image_count" INTEGER,
    "video_seconds" DECIMAL(18,6),
    "character_count" INTEGER,
    "storage_bytes" BIGINT,
    "compute_ms" INTEGER,
    "provider_request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usage_events_id_tenant_id_key" ON "usage_events"("id", "tenant_id");
CREATE UNIQUE INDEX "usage_events_tenant_id_idempotency_key_key" ON "usage_events"("tenant_id", "idempotency_key");
CREATE INDEX "usage_events_tenant_id_workspace_id_project_id_created_at_idx" ON "usage_events"("tenant_id", "workspace_id", "project_id", "created_at");
CREATE INDEX "usage_events_tenant_id_video_id_created_at_idx" ON "usage_events"("tenant_id", "video_id", "created_at");
CREATE INDEX "usage_events_tenant_id_job_id_idx" ON "usage_events"("tenant_id", "job_id");
CREATE INDEX "usage_events_tenant_id_resource_type_created_at_idx" ON "usage_events"("tenant_id", "resource_type", "created_at");
CREATE INDEX "usage_events_tenant_id_created_at_idx" ON "usage_events"("tenant_id", "created_at");

ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_video_id_tenant_id_fkey" FOREIGN KEY ("video_id", "tenant_id") REFERENCES "videos"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_job_id_tenant_id_fkey" FOREIGN KEY ("job_id", "tenant_id") REFERENCES "jobs"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_agent_run_id_tenant_id_fkey" FOREIGN KEY ("agent_run_id", "tenant_id") REFERENCES "agent_runs"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "provider_price_catalog" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "operation_type" "UsageOperationType" NOT NULL,
    "resource_type" "UsageResourceType" NOT NULL,
    "unit_type" "UsageUnitType" NOT NULL,
    "unit_scale" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "price_per_unit" DECIMAL(18,10) NOT NULL,
    "currency" TEXT NOT NULL,
    "rounding_mode" TEXT NOT NULL DEFAULT 'EXACT',
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_price_catalog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ppc_match_effective_idx" ON "provider_price_catalog"("provider", "operation_type", "resource_type", "unit_type", "effective_from");

CREATE TABLE "cost_ledgers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "video_id" UUID,
    "job_id" UUID,
    "usage_event_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "operation_type" "UsageOperationType" NOT NULL,
    "currency" TEXT,
    "estimated_cost" DECIMAL(18,6),
    "actual_cost" DECIMAL(18,6),
    "billable_cost" DECIMAL(18,6),
    "status" "CostLedgerStatus" NOT NULL,
    "calculation_version" TEXT NOT NULL,
    "price_catalog_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cost_ledgers_usage_event_id_key" ON "cost_ledgers"("usage_event_id");
CREATE UNIQUE INDEX "cost_ledgers_id_tenant_id_key" ON "cost_ledgers"("id", "tenant_id");
CREATE INDEX "cost_ledgers_tenant_id_workspace_id_project_id_created_at_idx" ON "cost_ledgers"("tenant_id", "workspace_id", "project_id", "created_at");
CREATE INDEX "cost_ledgers_tenant_id_video_id_idx" ON "cost_ledgers"("tenant_id", "video_id");
CREATE INDEX "cost_ledgers_tenant_id_job_id_idx" ON "cost_ledgers"("tenant_id", "job_id");
CREATE INDEX "cost_ledgers_tenant_id_status_idx" ON "cost_ledgers"("tenant_id", "status");

ALTER TABLE "cost_ledgers" ADD CONSTRAINT "cost_ledgers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_ledgers" ADD CONSTRAINT "cost_ledgers_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_ledgers" ADD CONSTRAINT "cost_ledgers_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_ledgers" ADD CONSTRAINT "cost_ledgers_video_id_tenant_id_fkey" FOREIGN KEY ("video_id", "tenant_id") REFERENCES "videos"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_ledgers" ADD CONSTRAINT "cost_ledgers_job_id_tenant_id_fkey" FOREIGN KEY ("job_id", "tenant_id") REFERENCES "jobs"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_ledgers" ADD CONSTRAINT "cost_ledgers_usage_event_id_fkey" FOREIGN KEY ("usage_event_id") REFERENCES "usage_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_ledgers" ADD CONSTRAINT "cost_ledgers_price_catalog_id_fkey" FOREIGN KEY ("price_catalog_id") REFERENCES "provider_price_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
