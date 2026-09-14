-- Step 13.3 Asset Library Foundation (additive, backward compatible)

-- AssetType extensions
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'VOICE_SAMPLE';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'LOGO';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'BROLL';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'DIGITAL_HUMAN';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'FINAL_VIDEO';

-- New enums
CREATE TYPE "AssetSourceType" AS ENUM (
  'USER_UPLOAD',
  'PROJECT_UPLOAD',
  'SYSTEM_GENERATED',
  'PROVIDER_GENERATED',
  'REFERENCE',
  'SYSTEM_LIBRARY',
  'DERIVED',
  'FINAL_OUTPUT',
  'UNKNOWN'
);

CREATE TYPE "AssetOwnerType" AS ENUM ('TENANT', 'PROJECT', 'SYSTEM');

CREATE TYPE "AssetRightsStatus" AS ENUM (
  'OWNED',
  'LICENSED',
  'USER_CONFIRMED',
  'REFERENCE_ONLY',
  'UNKNOWN',
  'RESTRICTED'
);

CREATE TYPE "AssetConsentStatus" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'CONFIRMED',
  'REVOKED'
);

-- Additive Asset columns (safe defaults; no rewrite of legacy semantics beyond defaults)
ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "source_type" "AssetSourceType" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "owner_type" "AssetOwnerType" NOT NULL DEFAULT 'PROJECT',
  ADD COLUMN IF NOT EXISTS "reference_only" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reusable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "rights_status" "AssetRightsStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "consent_status" "AssetConsentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "library_visible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "used_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "source_url" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_asset_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_asset_id" UUID,
  ADD COLUMN IF NOT EXISTS "generated_from_job_id" UUID,
  ADD COLUMN IF NOT EXISTS "quality_score" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "tags" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "assets_tenant_id_library_visible_project_id_idx"
  ON "assets"("tenant_id", "library_visible", "project_id");
CREATE INDEX IF NOT EXISTS "assets_tenant_id_source_type_idx"
  ON "assets"("tenant_id", "source_type");

-- AssetUsage
CREATE TABLE IF NOT EXISTS "asset_usages" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "project_id" UUID,
  "asset_id" UUID NOT NULL,
  "video_id" UUID,
  "job_id" UUID,
  "usage_type" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "asset_usages_tenant_id_asset_id_video_id_usage_type_key"
  ON "asset_usages"("tenant_id", "asset_id", "video_id", "usage_type");
CREATE INDEX IF NOT EXISTS "asset_usages_tenant_id_asset_id_idx" ON "asset_usages"("tenant_id", "asset_id");
CREATE INDEX IF NOT EXISTS "asset_usages_tenant_id_video_id_idx" ON "asset_usages"("tenant_id", "video_id");

ALTER TABLE "asset_usages"
  ADD CONSTRAINT "asset_usages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_usages"
  ADD CONSTRAINT "asset_usages_workspace_id_tenant_id_fkey"
  FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_usages"
  ADD CONSTRAINT "asset_usages_project_id_tenant_id_fkey"
  FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_usages"
  ADD CONSTRAINT "asset_usages_asset_id_tenant_id_fkey"
  FOREIGN KEY ("asset_id", "tenant_id") REFERENCES "assets"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_usages"
  ADD CONSTRAINT "asset_usages_video_id_tenant_id_fkey"
  FOREIGN KEY ("video_id", "tenant_id") REFERENCES "videos"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
