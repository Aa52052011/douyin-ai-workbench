-- CreateTable
CREATE TABLE "market_insights" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "market_research_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "source_agent_run_id" UUID,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_insights_id_tenant_id_key" ON "market_insights"("id", "tenant_id");
CREATE UNIQUE INDEX "market_insights_tenant_id_market_research_id_version_key" ON "market_insights"("tenant_id", "market_research_id", "version");
CREATE UNIQUE INDEX "market_insights_tenant_id_market_research_id_idempotency_key_key" ON "market_insights"("tenant_id", "market_research_id", "idempotency_key");
CREATE INDEX "market_insights_tenant_id_workspace_id_project_id_idx" ON "market_insights"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "market_insights_tenant_id_market_research_id_created_at_idx" ON "market_insights"("tenant_id", "market_research_id", "created_at");

-- AddForeignKey
ALTER TABLE "market_insights" ADD CONSTRAINT "market_insights_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_insights" ADD CONSTRAINT "market_insights_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_insights" ADD CONSTRAINT "market_insights_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_insights" ADD CONSTRAINT "market_insights_market_research_id_tenant_id_fkey" FOREIGN KEY ("market_research_id", "tenant_id") REFERENCES "market_researches"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
