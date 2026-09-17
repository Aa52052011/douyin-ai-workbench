-- Additive Final Production Acceptance for product Video versions.
-- Does not delete videos, artifacts, or historical rows.

CREATE TABLE "video_final_acceptances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "script_id" UUID,
    "video_id" UUID NOT NULL,
    "accepted_artifact_id" UUID NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'VERTICAL',
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "current" BOOLEAN NOT NULL DEFAULT true,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    "accepted_by_user_id" UUID NOT NULL,
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_final_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_final_acceptances_id_tenant_id_key" ON "video_final_acceptances"("id", "tenant_id");
CREATE UNIQUE INDEX "video_final_acceptances_tenant_id_video_id_key" ON "video_final_acceptances"("tenant_id", "video_id");
CREATE INDEX "video_final_acceptances_tenant_id_project_id_script_id_current_idx" ON "video_final_acceptances"("tenant_id", "project_id", "script_id", "current");
CREATE INDEX "video_final_acceptances_tenant_id_current_idx" ON "video_final_acceptances"("tenant_id", "current");

ALTER TABLE "video_final_acceptances" ADD CONSTRAINT "video_final_acceptances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_final_acceptances" ADD CONSTRAINT "video_final_acceptances_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_final_acceptances" ADD CONSTRAINT "video_final_acceptances_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_final_acceptances" ADD CONSTRAINT "video_final_acceptances_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_final_acceptances" ADD CONSTRAINT "video_final_acceptances_video_id_tenant_id_fkey" FOREIGN KEY ("video_id", "tenant_id") REFERENCES "videos"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_final_acceptances" ADD CONSTRAINT "video_final_acceptances_accepted_artifact_id_tenant_id_fkey" FOREIGN KEY ("accepted_artifact_id", "tenant_id") REFERENCES "assets"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "video_final_acceptances" ADD CONSTRAINT "video_final_acceptances_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
