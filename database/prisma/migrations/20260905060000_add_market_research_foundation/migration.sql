-- CreateEnum
CREATE TYPE "MarketSource" AS ENUM ('DOUYIN_OFFICIAL', 'IMPORT', 'MANUAL', 'DESKTOP_ASSISTED', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "MarketResearchStatus" AS ENUM ('DRAFT', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "product_briefs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_researches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "MarketResearchStatus" NOT NULL DEFAULT 'DRAFT',
    "product_brief_id" UUID,
    "product_brief_snapshot" JSONB NOT NULL DEFAULT '{}',
    "query_context" JSONB NOT NULL DEFAULT '{}',
    "source_agent_run_id" UUID,
    "source_job_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_researches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_research_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "market_research_id" UUID NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "time_window" JSONB,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "contents" JSONB NOT NULL DEFAULT '[]',
    "competitors" JSONB NOT NULL DEFAULT '[]',
    "trends" JSONB NOT NULL DEFAULT '[]',
    "audience_signals" JSONB NOT NULL DEFAULT '[]',
    "sample_stats" JSONB NOT NULL DEFAULT '{}',
    "data_quality" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_research_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_briefs_id_tenant_id_key" ON "product_briefs"("id", "tenant_id");
CREATE UNIQUE INDEX "product_briefs_tenant_id_project_id_version_key" ON "product_briefs"("tenant_id", "project_id", "version");
CREATE INDEX "product_briefs_tenant_id_workspace_id_project_id_idx" ON "product_briefs"("tenant_id", "workspace_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_researches_id_tenant_id_key" ON "market_researches"("id", "tenant_id");
CREATE UNIQUE INDEX "market_researches_tenant_id_project_id_version_key" ON "market_researches"("tenant_id", "project_id", "version");
CREATE INDEX "market_researches_tenant_id_workspace_id_project_id_idx" ON "market_researches"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "market_researches_tenant_id_status_idx" ON "market_researches"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "market_research_snapshots_id_tenant_id_key" ON "market_research_snapshots"("id", "tenant_id");
CREATE UNIQUE INDEX "market_research_snapshots_market_research_id_tenant_id_key" ON "market_research_snapshots"("market_research_id", "tenant_id");
CREATE INDEX "market_research_snapshots_tenant_id_workspace_id_project_id_idx" ON "market_research_snapshots"("tenant_id", "workspace_id", "project_id");

-- AddForeignKey
ALTER TABLE "product_briefs" ADD CONSTRAINT "product_briefs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_briefs" ADD CONSTRAINT "product_briefs_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_briefs" ADD CONSTRAINT "product_briefs_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_researches" ADD CONSTRAINT "market_researches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_researches" ADD CONSTRAINT "market_researches_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_researches" ADD CONSTRAINT "market_researches_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_researches" ADD CONSTRAINT "market_researches_product_brief_id_tenant_id_fkey" FOREIGN KEY ("product_brief_id", "tenant_id") REFERENCES "product_briefs"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_research_snapshots" ADD CONSTRAINT "market_research_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_research_snapshots" ADD CONSTRAINT "market_research_snapshots_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_research_snapshots" ADD CONSTRAINT "market_research_snapshots_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_research_snapshots" ADD CONSTRAINT "market_research_snapshots_market_research_id_tenant_id_fkey" FOREIGN KEY ("market_research_id", "tenant_id") REFERENCES "market_researches"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
