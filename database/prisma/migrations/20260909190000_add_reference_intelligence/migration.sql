-- Step 13.6 Reference Intelligence Foundation (additive)

CREATE TYPE "ReferenceAnalysisStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'INSUFFICIENT');

CREATE TABLE "reference_analyses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "reference_content_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReferenceAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "analysis_type" TEXT NOT NULL DEFAULT 'STRUCTURE_V1',
    "input_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "source_agent_run_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_analyses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_analyses_id_tenant_id_key" ON "reference_analyses"("id", "tenant_id");
CREATE UNIQUE INDEX "reference_analyses_tenant_id_reference_content_id_version_key" ON "reference_analyses"("tenant_id", "reference_content_id", "version");
CREATE INDEX "reference_analyses_tenant_id_workspace_id_project_id_idx" ON "reference_analyses"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "reference_analyses_tenant_id_reference_content_id_status_idx" ON "reference_analyses"("tenant_id", "reference_content_id", "status");
CREATE INDEX "reference_analyses_tenant_id_reference_content_id_input_hash_idx" ON "reference_analyses"("tenant_id", "reference_content_id", "input_hash");

ALTER TABLE "reference_analyses" ADD CONSTRAINT "reference_analyses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_analyses" ADD CONSTRAINT "reference_analyses_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_analyses" ADD CONSTRAINT "reference_analyses_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_analyses" ADD CONSTRAINT "reference_analyses_reference_content_id_tenant_id_fkey" FOREIGN KEY ("reference_content_id", "tenant_id") REFERENCES "reference_contents"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reference_patterns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "reference_content_id" UUID NOT NULL,
    "reference_analysis_id" UUID NOT NULL,
    "pattern_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_patterns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_patterns_id_tenant_id_key" ON "reference_patterns"("id", "tenant_id");
CREATE UNIQUE INDEX "reference_patterns_tenant_id_reference_analysis_id_key_key" ON "reference_patterns"("tenant_id", "reference_analysis_id", "key");
CREATE INDEX "reference_patterns_tenant_id_workspace_id_project_id_idx" ON "reference_patterns"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "reference_patterns_tenant_id_project_id_pattern_type_idx" ON "reference_patterns"("tenant_id", "project_id", "pattern_type");
CREATE INDEX "reference_patterns_tenant_id_reference_content_id_idx" ON "reference_patterns"("tenant_id", "reference_content_id");

ALTER TABLE "reference_patterns" ADD CONSTRAINT "reference_patterns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_patterns" ADD CONSTRAINT "reference_patterns_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_patterns" ADD CONSTRAINT "reference_patterns_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_patterns" ADD CONSTRAINT "reference_patterns_reference_content_id_tenant_id_fkey" FOREIGN KEY ("reference_content_id", "tenant_id") REFERENCES "reference_contents"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_patterns" ADD CONSTRAINT "reference_patterns_reference_analysis_id_tenant_id_fkey" FOREIGN KEY ("reference_analysis_id", "tenant_id") REFERENCES "reference_analyses"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
