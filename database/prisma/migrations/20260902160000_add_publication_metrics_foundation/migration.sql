-- AlterEnum
ALTER TYPE "JobKind" ADD VALUE 'PUBLICATION_METRICS_SYNC';

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('API', 'MANUAL', 'IMPORT');

-- AlterTable
CREATE UNIQUE INDEX "publications_id_tenant_ws_project_key" ON "publications"("id", "tenant_id", "workspace_id", "project_id");

-- CreateTable
CREATE TABLE "publication_metric_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "publication_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "source" "MetricSource" NOT NULL,
    "collection_key" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "provider_collected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "favorites" INTEGER,
    "average_watch_time_seconds" DECIMAL(12,3),
    "completion_rate" DECIMAL(8,7),
    "new_followers" INTEGER,
    "provider" TEXT,
    "provider_metadata" JSONB NOT NULL DEFAULT '{}',
    "source_job_id" UUID,

    CONSTRAINT "publication_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_id_tenant_key" ON "publication_metric_snapshots"("id", "tenant_id");
CREATE UNIQUE INDEX "pms_collect_key" ON "publication_metric_snapshots"("tenant_id", "publication_id", "source", "collection_key");
CREATE INDEX "pms_tenant_pub_observed_idx" ON "publication_metric_snapshots"("tenant_id", "publication_id", "observed_at");
CREATE INDEX "pms_tenant_ws_proj_observed_idx" ON "publication_metric_snapshots"("tenant_id", "workspace_id", "project_id", "observed_at");
CREATE INDEX "pms_tenant_platform_observed_idx" ON "publication_metric_snapshots"("tenant_id", "platform", "observed_at");

-- AddForeignKey
ALTER TABLE "publication_metric_snapshots" ADD CONSTRAINT "publication_metric_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_metric_snapshots" ADD CONSTRAINT "publication_metric_snapshots_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_metric_snapshots" ADD CONSTRAINT "publication_metric_snapshots_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_metric_snapshots" ADD CONSTRAINT "pms_publication_scope_fkey" FOREIGN KEY ("publication_id", "tenant_id", "workspace_id", "project_id") REFERENCES "publications"("id", "tenant_id", "workspace_id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
