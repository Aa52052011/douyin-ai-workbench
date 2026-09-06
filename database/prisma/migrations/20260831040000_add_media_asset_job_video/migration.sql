-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'SUBTITLE', 'DOCUMENT', 'SOURCE_VIDEO', 'SOURCE_AUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetLinkRole" AS ENUM ('VIDEO_OUTPUT', 'VIDEO_SOURCE', 'VIDEO_AUDIO', 'VIDEO_BGM', 'VIDEO_SUBTITLE', 'VIDEO_COVER', 'VIDEO_PREVIEW', 'MOVIE_SOURCE', 'MOVIE_CLIP', 'MOVIE_VOICEOVER', 'MOVIE_SUBTITLE', 'MOVIE_COVER', 'MOVIE_OUTPUT');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('VIDEO_GENERATION', 'MOVIE_EDITING', 'TTS_GENERATION', 'SUBTITLE_GENERATION', 'VIDEO_COMPOSE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "videos" ADD COLUMN "output_asset_id" UUID;
ALTER TABLE "videos" ADD COLUMN "source_job_id" UUID;

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" "AssetType" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "storage_provider" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "size" INTEGER,
    "duration" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "model" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "error" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "request_id" TEXT NOT NULL,
    "script_id" UUID,
    "video_id" UUID,
    "agent_run_id" UUID,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "video_id" UUID,
    "job_id" UUID,
    "role" "AssetLinkRole" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_id_tenant_id_key" ON "assets"("id", "tenant_id");
CREATE UNIQUE INDEX "assets_tenant_id_storage_provider_storage_key_key" ON "assets"("tenant_id", "storage_provider", "storage_key");
CREATE INDEX "assets_tenant_id_workspace_id_project_id_type_idx" ON "assets"("tenant_id", "workspace_id", "project_id", "type");
CREATE INDEX "assets_tenant_id_status_idx" ON "assets"("tenant_id", "status");

CREATE UNIQUE INDEX "jobs_id_tenant_id_key" ON "jobs"("id", "tenant_id");
CREATE INDEX "jobs_tenant_id_workspace_id_project_id_idx" ON "jobs"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "jobs_tenant_id_status_idx" ON "jobs"("tenant_id", "status");
CREATE INDEX "jobs_video_id_idx" ON "jobs"("video_id");
CREATE INDEX "jobs_kind_created_at_idx" ON "jobs"("kind", "created_at");

CREATE INDEX "asset_links_tenant_id_workspace_id_project_id_idx" ON "asset_links"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "asset_links_asset_id_idx" ON "asset_links"("asset_id");
CREATE INDEX "asset_links_video_id_idx" ON "asset_links"("video_id");
CREATE INDEX "asset_links_job_id_idx" ON "asset_links"("job_id");
CREATE UNIQUE INDEX "asset_links_one_video_output" ON "asset_links"("tenant_id", "video_id") WHERE "role" = 'VIDEO_OUTPUT' AND "video_id" IS NOT NULL;

ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_owner_check" CHECK ("video_id" IS NOT NULL OR "job_id" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_asset_id_tenant_id_fkey" FOREIGN KEY ("asset_id", "tenant_id") REFERENCES "assets"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_video_id_tenant_id_fkey" FOREIGN KEY ("video_id", "tenant_id") REFERENCES "videos"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_job_id_tenant_id_fkey" FOREIGN KEY ("job_id", "tenant_id") REFERENCES "jobs"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
