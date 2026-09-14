-- B2-15O8: PerformanceAnalysis + ContentFeedbackCycle. Does not alter official publish tables.

CREATE TABLE "performance_analyses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "published_post_id" UUID NOT NULL,
    "agent_run_id" UUID,
    "analysis_window" TEXT NOT NULL,
    "analysis_version" TEXT NOT NULL DEFAULT 'v1',
    "input_snapshot_hash" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL DEFAULT '{}',
    "metrics_summary" JSONB NOT NULL DEFAULT '{}',
    "findings" JSONB NOT NULL DEFAULT '[]',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "benchmark_context" TEXT NOT NULL,
    "data_sufficiency" TEXT NOT NULL,
    "confidence_summary" JSONB NOT NULL DEFAULT '{}',
    "window_coverage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "llm_invoked" BOOLEAN NOT NULL DEFAULT false,
    "fixture" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_analyses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "performance_analyses_id_tenant_id_key" ON "performance_analyses"("id", "tenant_id");
CREATE INDEX "performance_analyses_tenant_id_published_post_id_created_at_idx" ON "performance_analyses"("tenant_id", "published_post_id", "created_at");
CREATE INDEX "performance_analyses_tenant_id_input_snapshot_hash_idx" ON "performance_analyses"("tenant_id", "input_snapshot_hash");

ALTER TABLE "performance_analyses" ADD CONSTRAINT "performance_analyses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_analyses" ADD CONSTRAINT "performance_analyses_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_analyses" ADD CONSTRAINT "performance_analyses_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_analyses" ADD CONSTRAINT "performance_analyses_published_post_id_tenant_id_fkey" FOREIGN KEY ("published_post_id", "tenant_id") REFERENCES "publications"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_analyses" ADD CONSTRAINT "performance_analyses_agent_run_id_tenant_id_fkey" FOREIGN KEY ("agent_run_id", "tenant_id") REFERENCES "agent_runs"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "content_feedback_cycles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_published_post_id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "applied_to_next_plan" BOOLEAN NOT NULL DEFAULT false,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_feedback_cycles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_feedback_cycles_id_tenant_id_key" ON "content_feedback_cycles"("id", "tenant_id");
CREATE INDEX "content_feedback_cycles_tenant_id_source_published_post_id_idx" ON "content_feedback_cycles"("tenant_id", "source_published_post_id");

ALTER TABLE "content_feedback_cycles" ADD CONSTRAINT "content_feedback_cycles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_feedback_cycles" ADD CONSTRAINT "content_feedback_cycles_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_feedback_cycles" ADD CONSTRAINT "content_feedback_cycles_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_feedback_cycles" ADD CONSTRAINT "content_feedback_cycles_source_published_post_id_tenant_id_fkey" FOREIGN KEY ("source_published_post_id", "tenant_id") REFERENCES "publications"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_feedback_cycles" ADD CONSTRAINT "content_feedback_cycles_analysis_id_tenant_id_fkey" FOREIGN KEY ("analysis_id", "tenant_id") REFERENCES "performance_analyses"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
