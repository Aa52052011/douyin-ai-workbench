-- Step 13.4 Reference Content thin table (additive)

CREATE TABLE "reference_contents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "platform" TEXT,
    "title" TEXT,
    "note" TEXT,
    "reason_for_reference" TEXT,
    "url" TEXT,
    "canonical_url" TEXT,
    "asset_id" UUID,
    "reference_only" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reference_contents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reference_contents_id_tenant_id_key" ON "reference_contents"("id", "tenant_id");
CREATE INDEX "reference_contents_tenant_id_workspace_id_project_id_idx" ON "reference_contents"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "reference_contents_tenant_id_canonical_url_idx" ON "reference_contents"("tenant_id", "canonical_url");
CREATE INDEX "reference_contents_tenant_id_asset_id_idx" ON "reference_contents"("tenant_id", "asset_id");

ALTER TABLE "reference_contents" ADD CONSTRAINT "reference_contents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_contents" ADD CONSTRAINT "reference_contents_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_contents" ADD CONSTRAINT "reference_contents_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reference_contents" ADD CONSTRAINT "reference_contents_asset_id_tenant_id_fkey" FOREIGN KEY ("asset_id", "tenant_id") REFERENCES "assets"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
