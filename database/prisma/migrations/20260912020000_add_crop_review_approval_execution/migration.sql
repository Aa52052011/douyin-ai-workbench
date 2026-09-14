-- B2-14 Human crop approval persistence + authorized execution runtime (additive)

CREATE TYPE "CropReviewSessionDbStatus" AS ENUM (
  'CREATED',
  'PREVIEW_PENDING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
  'EXPIRED',
  'INVALIDATED'
);

CREATE TYPE "CropReviewHumanDecisionDb" AS ENUM (
  'NOT_REVIEWED',
  'APPROVED',
  'REJECTED',
  'REQUEST_CHANGES'
);

CREATE TYPE "HumanCropApprovalDbStatus" AS ENUM (
  'ACTIVE',
  'REVOKED',
  'INVALIDATED'
);

CREATE TYPE "CropExecutionAuthorizationDbStatus" AS ENUM (
  'ACTIVE',
  'CONSUMED',
  'REVOKED',
  'INVALIDATED'
);

CREATE TYPE "CropExecutionRunDbStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "crop_review_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "candidate_version" TEXT NOT NULL,
    "review_packet_version" TEXT NOT NULL,
    "preview_id" TEXT,
    "preview_version" TEXT NOT NULL,
    "status" "CropReviewSessionDbStatus" NOT NULL,
    "background_treatment" TEXT NOT NULL,
    "required_warnings_json" JSONB NOT NULL DEFAULT '[]',
    "checklist_json" JSONB NOT NULL DEFAULT '[]',
    "human_decision" "CropReviewHumanDecisionDb" NOT NULL,
    "created_by_user_id" UUID,
    "reviewed_by_user_id" UUID,
    "expires_at" TIMESTAMP(3),
    "invalidated_at" TIMESTAMP(3),
    "invalidation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crop_review_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crop_review_sessions_id_tenant_id_key" ON "crop_review_sessions"("id", "tenant_id");
CREATE INDEX "crop_review_sessions_tenant_ws_project_idx" ON "crop_review_sessions"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "crop_review_sessions_tenant_asset_idx" ON "crop_review_sessions"("tenant_id", "asset_id");
CREATE INDEX "crop_review_sessions_tenant_status_idx" ON "crop_review_sessions"("tenant_id", "status");

ALTER TABLE "crop_review_sessions" ADD CONSTRAINT "crop_review_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_review_sessions" ADD CONSTRAINT "crop_review_sessions_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_review_sessions" ADD CONSTRAINT "crop_review_sessions_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "human_crop_approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "review_session_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "candidate_version" TEXT NOT NULL,
    "review_packet_version" TEXT NOT NULL,
    "preview_id" TEXT NOT NULL,
    "preview_version" TEXT NOT NULL,
    "background_treatment" TEXT NOT NULL,
    "accepted_warnings_json" JSONB NOT NULL DEFAULT '[]',
    "confirmed_checklist_json" JSONB NOT NULL DEFAULT '[]',
    "approval_source" TEXT NOT NULL,
    "approved_by_user_id" UUID NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL,
    "client_action_id" TEXT NOT NULL,
    "status" "HumanCropApprovalDbStatus" NOT NULL,
    "invalidated_at" TIMESTAMP(3),
    "invalidation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "human_crop_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "human_crop_approvals_id_tenant_id_key" ON "human_crop_approvals"("id", "tenant_id");
CREATE UNIQUE INDEX "human_crop_approvals_tenant_client_action_id_key" ON "human_crop_approvals"("tenant_id", "client_action_id");
CREATE UNIQUE INDEX "human_crop_approvals_one_active_per_session" ON "human_crop_approvals"("review_session_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "human_crop_approvals_tenant_ws_project_idx" ON "human_crop_approvals"("tenant_id", "workspace_id", "project_id");
CREATE INDEX "human_crop_approvals_tenant_session_idx" ON "human_crop_approvals"("tenant_id", "review_session_id");
CREATE INDEX "human_crop_approvals_tenant_status_idx" ON "human_crop_approvals"("tenant_id", "status");

ALTER TABLE "human_crop_approvals" ADD CONSTRAINT "human_crop_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "human_crop_approvals" ADD CONSTRAINT "human_crop_approvals_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "human_crop_approvals" ADD CONSTRAINT "human_crop_approvals_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "human_crop_approvals" ADD CONSTRAINT "human_crop_approvals_session_tenant_fkey" FOREIGN KEY ("review_session_id", "tenant_id") REFERENCES "crop_review_sessions"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "crop_execution_authorizations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "approval_id" UUID NOT NULL,
    "review_session_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "candidate_version" TEXT NOT NULL,
    "preview_version" TEXT NOT NULL,
    "background_treatment" TEXT NOT NULL,
    "execution_plan_version" TEXT NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "status" "CropExecutionAuthorizationDbStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "crop_execution_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crop_execution_authorizations_id_tenant_id_key" ON "crop_execution_authorizations"("id", "tenant_id");
CREATE UNIQUE INDEX "crop_execution_authorizations_tenant_client_request_id_key" ON "crop_execution_authorizations"("tenant_id", "client_request_id");
CREATE UNIQUE INDEX "crop_execution_authorizations_one_active_per_approval" ON "crop_execution_authorizations"("approval_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "crop_execution_authorizations_tenant_approval_idx" ON "crop_execution_authorizations"("tenant_id", "approval_id");
CREATE INDEX "crop_execution_authorizations_tenant_status_idx" ON "crop_execution_authorizations"("tenant_id", "status");

ALTER TABLE "crop_execution_authorizations" ADD CONSTRAINT "crop_execution_authorizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_execution_authorizations" ADD CONSTRAINT "crop_execution_authorizations_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_execution_authorizations" ADD CONSTRAINT "crop_execution_authorizations_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_execution_authorizations" ADD CONSTRAINT "crop_execution_authorizations_approval_tenant_fkey" FOREIGN KEY ("approval_id", "tenant_id") REFERENCES "human_crop_approvals"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "crop_execution_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "approval_id" UUID NOT NULL,
    "authorization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "status" "CropExecutionRunDbStatus" NOT NULL,
    "input_ref" TEXT NOT NULL,
    "temp_output_ref" TEXT,
    "final_output_ref" TEXT,
    "ffmpeg_exit_code" INTEGER,
    "validation_json" JSONB,
    "failure_code" TEXT,
    "failure_message_sanitized" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crop_execution_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crop_execution_runs_id_tenant_id_key" ON "crop_execution_runs"("id", "tenant_id");
CREATE UNIQUE INDEX "crop_execution_runs_tenant_client_request_id_key" ON "crop_execution_runs"("tenant_id", "client_request_id");
CREATE INDEX "crop_execution_runs_tenant_authorization_idx" ON "crop_execution_runs"("tenant_id", "authorization_id");
CREATE INDEX "crop_execution_runs_tenant_status_idx" ON "crop_execution_runs"("tenant_id", "status");

ALTER TABLE "crop_execution_runs" ADD CONSTRAINT "crop_execution_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_execution_runs" ADD CONSTRAINT "crop_execution_runs_workspace_id_tenant_id_fkey" FOREIGN KEY ("workspace_id", "tenant_id") REFERENCES "workspaces"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_execution_runs" ADD CONSTRAINT "crop_execution_runs_project_id_tenant_id_fkey" FOREIGN KEY ("project_id", "tenant_id") REFERENCES "projects"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_execution_runs" ADD CONSTRAINT "crop_execution_runs_approval_tenant_fkey" FOREIGN KEY ("approval_id", "tenant_id") REFERENCES "human_crop_approvals"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_execution_runs" ADD CONSTRAINT "crop_execution_runs_authorization_tenant_fkey" FOREIGN KEY ("authorization_id", "tenant_id") REFERENCES "crop_execution_authorizations"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
