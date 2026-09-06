-- AlterEnum
ALTER TYPE "ContentPlanStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "content_plans" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "content_plans" ADD COLUMN     "payload" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "content_plans" ADD COLUMN     "positioning_snapshot" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "content_plans" ADD COLUMN     "source_agent_run_id" UUID;
ALTER TABLE "content_plans" ADD COLUMN     "planning_days" INTEGER;
ALTER TABLE "content_plans" ADD COLUMN     "posts_per_day" INTEGER;
ALTER TABLE "content_plans" ADD COLUMN     "platform" TEXT;
ALTER TABLE "content_plans" ADD COLUMN     "used_trend_data" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "content_plans_tenant_id_project_id_version_key" ON "content_plans"("tenant_id", "project_id", "version");
