-- AlterEnum
ALTER TYPE "JobKind" ADD VALUE 'VIDEO_PUBLISH';

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('DOUYIN', 'TIKTOK', 'YOUTUBE', 'XIAOHONGSHU', 'BILIBILI', 'CHANNELS', 'MOCK');

-- CreateEnum
CREATE TYPE "PlatformAccountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "PublicationMode" AS ENUM ('API', 'MANUAL');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PENDING', 'UPLOADING', 'SUBMITTING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'UNKNOWN_EXTERNAL_STATE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SecretKind" AS ENUM ('PLATFORM_OAUTH');

-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "PlatformAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "credential_ref" UUID NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "connected_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "last_refreshed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_secrets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "kind" "SecretKind" NOT NULL,
    "cipher" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "platform_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "platform_account_id" UUID,
    "platform" "Platform" NOT NULL,
    "mode" "PublicationMode" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "visibility" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "external_post_id" TEXT,
    "external_url" TEXT,
    "provider_upload_id" TEXT,
    "provider_item_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "source_job_id" UUID,
    "error_code" TEXT,
    "error_message" TEXT,
    "provider_response_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_id_tenant_id_key" ON "platform_accounts"("id", "tenant_id");
CREATE UNIQUE INDEX "platform_accounts_tenant_ws_platform_ext_key" ON "platform_accounts"("tenant_id", "workspace_id", "platform", "external_account_id");
CREATE INDEX "platform_accounts_tenant_id_workspace_id_platform_status_idx" ON "platform_accounts"("tenant_id", "workspace_id", "platform", "status");

CREATE UNIQUE INDEX "platform_secrets_id_tenant_id_key" ON "platform_secrets"("id", "tenant_id");
CREATE INDEX "platform_secrets_tenant_id_workspace_id_idx" ON "platform_secrets"("tenant_id", "workspace_id");

CREATE UNIQUE INDEX "publications_id_tenant_id_key" ON "publications"("id", "tenant_id");
CREATE UNIQUE INDEX "publications_tenant_id_idempotency_key_key" ON "publications"("tenant_id", "idempotency_key");
CREATE INDEX "publications_tenant_id_workspace_id_project_id_idx" ON "publications"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "publications_tenant_id_video_id_created_at_idx" ON "publications"("tenant_id", "video_id", "created_at");
CREATE INDEX "publications_tenant_id_platform_account_id_status_idx" ON "publications"("tenant_id", "platform_account_id", "status");
CREATE INDEX "publications_tenant_id_platform_external_post_id_idx" ON "publications"("tenant_id", "platform", "external_post_id");

-- AddForeignKey
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_secrets" ADD CONSTRAINT "platform_secrets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_secrets" ADD CONSTRAINT "platform_secrets_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "publications" ADD CONSTRAINT "publications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_video_id_tenant_id_fkey" FOREIGN KEY ("video_id", "tenant_id") REFERENCES "videos"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_platform_account_id_tenant_id_fkey" FOREIGN KEY ("platform_account_id", "tenant_id") REFERENCES "platform_accounts"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
