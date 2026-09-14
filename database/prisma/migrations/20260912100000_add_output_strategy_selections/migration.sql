-- B2-15I human-selected output strategy persistence (not approval, not authorization)

CREATE TABLE "output_strategy_selections" (
    "selection_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "content_id" TEXT,
    "review_session_id" UUID NOT NULL,
    "source_visual_type" TEXT NOT NULL,
    "selected_strategy" TEXT NOT NULL,
    "selected_profile_ids" JSONB NOT NULL,
    "selection_source" TEXT NOT NULL,
    "human_feedback_ref" TEXT,
    "vertical_preference" TEXT,
    "landscape_preference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "output_strategy_selections_pkey" PRIMARY KEY ("selection_id")
);

CREATE UNIQUE INDEX "output_strategy_selections_id_tenant_id_key" ON "output_strategy_selections"("selection_id", "tenant_id");
CREATE UNIQUE INDEX "output_strategy_selections_tenant_id_review_session_id_key" ON "output_strategy_selections"("tenant_id", "review_session_id");
CREATE INDEX "output_strategy_selections_tenant_ws_project_idx" ON "output_strategy_selections"("tenant_id", "workspace_id", "project_id");

ALTER TABLE "output_strategy_selections" ADD CONSTRAINT "output_strategy_selections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "output_strategy_selections" ADD CONSTRAINT "output_strategy_selections_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "output_strategy_selections" ADD CONSTRAINT "output_strategy_selections_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "output_strategy_selections" ADD CONSTRAINT "output_strategy_selections_review_session_id_tenant_id_fkey" FOREIGN KEY ("review_session_id", "tenant_id") REFERENCES "crop_review_sessions"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
