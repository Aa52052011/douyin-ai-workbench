-- Step 13.5 Account Content Memory Foundation (additive)

CREATE TYPE "AccountMemoryStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'FAILED');

CREATE TABLE "account_memory_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AccountMemoryStatus" NOT NULL DEFAULT 'DRAFT',
    "source_watermark" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_memory_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_memory_snapshots_id_tenant_id_key" ON "account_memory_snapshots"("id", "tenant_id");
CREATE UNIQUE INDEX "account_memory_snapshots_tenant_id_project_id_version_key" ON "account_memory_snapshots"("tenant_id", "project_id", "version");
CREATE INDEX "account_memory_snapshots_tenant_id_workspace_id_project_id_status_idx" ON "account_memory_snapshots"("tenant_id", "workspace_id", "project_id", "status");
CREATE INDEX "account_memory_snapshots_tenant_id_project_id_version_idx" ON "account_memory_snapshots"("tenant_id", "project_id", "version");

ALTER TABLE "account_memory_snapshots" ADD CONSTRAINT "account_memory_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_memory_snapshots" ADD CONSTRAINT "account_memory_snapshots_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_memory_snapshots" ADD CONSTRAINT "account_memory_snapshots_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
