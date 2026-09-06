-- CreateEnum
CREATE TYPE "CampaignStrategyStatus" AS ENUM ('READY', 'CONFIRMED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "campaign_strategies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CampaignStrategyStatus" NOT NULL DEFAULT 'READY',
    "product_brief_id" UUID,
    "market_research_id" UUID,
    "market_insight_id" UUID,
    "positioning_run_id" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "input_snapshot" JSONB NOT NULL DEFAULT '{}',
    "source_agent_run_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_strategies_id_tenant_id_key" ON "campaign_strategies"("id", "tenant_id");
CREATE UNIQUE INDEX "campaign_strategies_tenant_id_project_id_version_key" ON "campaign_strategies"("tenant_id", "project_id", "version");
CREATE INDEX "campaign_strategies_tenant_id_workspace_id_project_id_idx" ON "campaign_strategies"("tenant_id", "workspace_id", "project_id");

-- AddForeignKey
ALTER TABLE "campaign_strategies" ADD CONSTRAINT "campaign_strategies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_strategies" ADD CONSTRAINT "campaign_strategies_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_strategies" ADD CONSTRAINT "campaign_strategies_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_strategies" ADD CONSTRAINT "campaign_strategies_product_brief_id_tenant_id_fkey" FOREIGN KEY ("product_brief_id", "tenant_id") REFERENCES "product_briefs"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_strategies" ADD CONSTRAINT "campaign_strategies_market_research_id_tenant_id_fkey" FOREIGN KEY ("market_research_id", "tenant_id") REFERENCES "market_researches"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_strategies" ADD CONSTRAINT "campaign_strategies_market_insight_id_tenant_id_fkey" FOREIGN KEY ("market_insight_id", "tenant_id") REFERENCES "market_insights"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
