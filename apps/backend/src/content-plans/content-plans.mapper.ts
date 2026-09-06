import type { ContentPlan } from '@prisma/client';

export type ContentPlanPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  version: number;
  payload: unknown;
  positioningSnapshot: unknown;
  sourceAgentRunId: string | null;
  planningDays: number | null;
  postsPerDay: number | null;
  platform: string | null;
  usedTrendData: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicContentPlan(plan: ContentPlan): ContentPlanPublic {
  return {
    id: plan.id,
    tenantId: plan.tenantId,
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    title: plan.title,
    description: plan.description,
    status: plan.status,
    version: plan.version,
    payload: plan.payload,
    positioningSnapshot: plan.positioningSnapshot,
    sourceAgentRunId: plan.sourceAgentRunId,
    planningDays: plan.planningDays,
    postsPerDay: plan.postsPerDay,
    platform: plan.platform,
    usedTrendData: plan.usedTrendData,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}
