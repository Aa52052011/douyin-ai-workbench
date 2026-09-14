-- B2-15O7: V1 manual publication / PublishedPost extension + monitoring handoff.
-- Reuses publications as PublishedPost. Does not remove official publish columns.

ALTER TYPE "PublicationMode" ADD VALUE IF NOT EXISTS 'SCHEDULED_API';

CREATE TYPE "PublishedPostLifecycleStatus" AS ENUM (
  'DRAFT',
  'AWAITING_MANUAL_PUBLICATION',
  'REGISTERED',
  'MONITORING_READY',
  'MONITORING_ACTIVE',
  'UNAVAILABLE',
  'DELETED',
  'ERROR'
);

CREATE TYPE "PublicationRegistrationSource" AS ENUM (
  'USER_PASTED_URL',
  'USER_ENTERED_POST_ID',
  'OFFICIAL_API_RESULT'
);

CREATE TYPE "PublicationVerificationStatus" AS ENUM (
  'USER_ASSERTED',
  'FORMAT_VALIDATED',
  'PLATFORM_VERIFIED',
  'VERIFICATION_FAILED'
);

CREATE TYPE "MonitoringMode" AS ENUM (
  'MANUAL_IMPORT',
  'OFFICIAL_API',
  'HYBRID'
);

CREATE TYPE "MonitoringRuntimeStatus" AS ENUM (
  'WAITING_REGISTRATION',
  'READY',
  'ACTIVE',
  'STOPPED'
);

CREATE TYPE "ManualExportDestinationType" AS ENUM (
  'DOWNLOAD',
  'USER_CHOSEN'
);

CREATE TYPE "ManualExportStatus" AS ENUM (
  'RECORDED'
);

ALTER TABLE "publications" ALTER COLUMN "video_id" DROP NOT NULL;

ALTER TABLE "publications"
  ADD COLUMN "content_plan_id" UUID,
  ADD COLUMN "script_id" UUID,
  ADD COLUMN "production_artifact_id" TEXT,
  ADD COLUMN "artifact_sha" TEXT,
  ADD COLUMN "lifecycle_status" "PublishedPostLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "registration_source" "PublicationRegistrationSource",
  ADD COLUMN "verification_status" "PublicationVerificationStatus",
  ADD COLUMN "monitoring_status" "MonitoringRuntimeStatus" NOT NULL DEFAULT 'WAITING_REGISTRATION',
  ADD COLUMN "monitoring_mode" "MonitoringMode" NOT NULL DEFAULT 'MANUAL_IMPORT',
  ADD COLUMN "platform_author_id" TEXT,
  ADD COLUMN "registered_at" TIMESTAMP(3),
  ADD COLUMN "feedback_cycle_id" TEXT,
  ADD COLUMN "metadata_snapshot" JSONB;

CREATE UNIQUE INDEX "publications_tenant_platform_ext_post_key"
  ON "publications"("tenant_id", "platform", "external_post_id");

CREATE INDEX "publications_tenant_id_production_artifact_id_idx"
  ON "publications"("tenant_id", "production_artifact_id");

ALTER TABLE "publication_metric_snapshots"
  ADD COLUMN "entered_by_user_id" UUID;

ALTER TABLE "publication_metric_snapshots"
  ADD CONSTRAINT "publication_metric_snapshots_entered_by_user_id_fkey"
  FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "manual_publication_exports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "artifact_sha" TEXT NOT NULL,
    "exported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destination_type" "ManualExportDestinationType" NOT NULL,
    "status" "ManualExportStatus" NOT NULL DEFAULT 'RECORDED',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_publication_exports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manual_publication_exports_id_tenant_id_key" ON "manual_publication_exports"("id", "tenant_id");
CREATE INDEX "manual_publication_exports_tenant_ws_project_exported_idx" ON "manual_publication_exports"("tenant_id", "workspace_id", "project_id", "exported_at");
CREATE INDEX "manual_publication_exports_tenant_artifact_idx" ON "manual_publication_exports"("tenant_id", "artifact_id");

ALTER TABLE "manual_publication_exports" ADD CONSTRAINT "manual_publication_exports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manual_publication_exports" ADD CONSTRAINT "manual_publication_exports_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manual_publication_exports" ADD CONSTRAINT "manual_publication_exports_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manual_publication_exports" ADD CONSTRAINT "manual_publication_exports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "monitoring_targets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "published_post_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "platform_post_id" TEXT,
    "platform_url" TEXT,
    "artifact_id" TEXT NOT NULL,
    "script_id" TEXT,
    "content_plan_id" TEXT,
    "registered_at" TIMESTAMP(3) NOT NULL,
    "monitoring_mode" "MonitoringMode" NOT NULL DEFAULT 'MANUAL_IMPORT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "monitoring_targets_id_tenant_id_key" ON "monitoring_targets"("id", "tenant_id");
CREATE UNIQUE INDEX "monitoring_targets_published_post_id_tenant_id_key" ON "monitoring_targets"("published_post_id", "tenant_id");
CREATE INDEX "monitoring_targets_tenant_ws_project_idx" ON "monitoring_targets"("tenant_id", "workspace_id", "project_id");

ALTER TABLE "monitoring_targets" ADD CONSTRAINT "monitoring_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monitoring_targets" ADD CONSTRAINT "monitoring_targets_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monitoring_targets" ADD CONSTRAINT "monitoring_targets_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monitoring_targets" ADD CONSTRAINT "monitoring_targets_published_post_id_tenant_id_fkey" FOREIGN KEY ("published_post_id", "tenant_id") REFERENCES "publications"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
