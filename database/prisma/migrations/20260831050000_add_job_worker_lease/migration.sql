-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "locked_at" TIMESTAMP(3),
ADD COLUMN "last_heartbeat_at" TIMESTAMP(3),
ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0;
