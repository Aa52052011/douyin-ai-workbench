-- AlterEnum
ALTER TYPE "ScriptStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "scripts" ADD COLUMN     "topic_id" UUID;
ALTER TABLE "scripts" ADD COLUMN     "payload" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "scripts" ADD COLUMN     "topic_snapshot" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "scripts" ADD COLUMN     "source_agent_run_id" UUID;

-- DropIndex
DROP INDEX "scripts_content_plan_id_version_idx";

-- CreateIndex
CREATE UNIQUE INDEX "scripts_id_tenant_id_key" ON "scripts"("id", "tenant_id");
CREATE UNIQUE INDEX "scripts_tenant_id_content_plan_id_topic_id_version_key" ON "scripts"("tenant_id", "content_plan_id", "topic_id", "version");
CREATE INDEX "scripts_tenant_id_content_plan_id_topic_id_idx" ON "scripts"("tenant_id", "content_plan_id", "topic_id");
