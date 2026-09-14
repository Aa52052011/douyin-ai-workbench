-- Step 13.8 Voice System + Digital Human Foundation (additive)

CREATE TYPE "VoiceProfileType" AS ENUM ('SYSTEM', 'CUSTOM', 'CLONED');
CREATE TYPE "VoiceProfileStatus" AS ENUM ('DRAFT', 'READY', 'FAILED', 'DISABLED');
CREATE TYPE "DigitalHumanProfileStatus" AS ENUM ('DRAFT', 'REGISTERING', 'READY', 'FAILED', 'DISABLED');

CREATE TABLE "voice_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "type" "VoiceProfileType" NOT NULL,
    "status" "VoiceProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT,
    "provider_voice_id" TEXT,
    "language" TEXT,
    "gender" TEXT,
    "tone" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sample_asset_id" UUID,
    "rights_status" "AssetRightsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consent_status" "AssetConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consent_confirmed_at" TIMESTAMP(3),
    "consent_revoked_at" TIMESTAMP(3),
    "consent_confirmed_by_user_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "voice_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_profiles_id_tenant_id_key" ON "voice_profiles"("id", "tenant_id");
CREATE INDEX "voice_profiles_tenant_id_workspace_id_status_idx" ON "voice_profiles"("tenant_id", "workspace_id", "status");
CREATE INDEX "voice_profiles_tenant_id_sample_asset_id_idx" ON "voice_profiles"("tenant_id", "sample_asset_id");

ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_sample_asset_id_tenant_id_fkey" FOREIGN KEY ("sample_asset_id", "tenant_id") REFERENCES "assets"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "digital_human_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "status" "DigitalHumanProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT,
    "provider_avatar_id" TEXT,
    "source_asset_id" UUID NOT NULL,
    "voice_profile_id" UUID,
    "rights_status" "AssetRightsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consent_status" "AssetConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consent_confirmed_at" TIMESTAMP(3),
    "consent_revoked_at" TIMESTAMP(3),
    "consent_confirmed_by_user_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "digital_human_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "digital_human_profiles_id_tenant_id_key" ON "digital_human_profiles"("id", "tenant_id");
CREATE INDEX "digital_human_profiles_tenant_id_workspace_id_status_idx" ON "digital_human_profiles"("tenant_id", "workspace_id", "status");
CREATE INDEX "digital_human_profiles_tenant_id_source_asset_id_idx" ON "digital_human_profiles"("tenant_id", "source_asset_id");

ALTER TABLE "digital_human_profiles" ADD CONSTRAINT "digital_human_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digital_human_profiles" ADD CONSTRAINT "digital_human_profiles_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digital_human_profiles" ADD CONSTRAINT "digital_human_profiles_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digital_human_profiles" ADD CONSTRAINT "digital_human_profiles_source_asset_id_tenant_id_fkey" FOREIGN KEY ("source_asset_id", "tenant_id") REFERENCES "assets"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "digital_human_profiles" ADD CONSTRAINT "digital_human_profiles_voice_profile_id_tenant_id_fkey" FOREIGN KEY ("voice_profile_id", "tenant_id") REFERENCES "voice_profiles"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
