import type { PrismaClient } from '@prisma/client';
import {
  selectLatestEligiblePreviousBatch,
  type PreviousBatchCandidate,
  type PreviousBatchSummaryPick,
} from './previous-batch-eligibility.js';

export const PREVIOUS_BATCH_CANDIDATE_LIMIT = 40;

export async function loadLatestEligiblePreviousBatch(
  prisma: PrismaClient,
  scope: { tenantId: string; workspaceId: string; projectId: string },
): Promise<PreviousBatchSummaryPick | null> {
  const plans = await prisma.contentPlan.findMany({
    where: {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      deletedAt: null,
      sourceAgentRunId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: PREVIOUS_BATCH_CANDIDATE_LIMIT,
    select: {
      id: true,
      title: true,
      tenantId: true,
      workspaceId: true,
      projectId: true,
      sourceAgentRunId: true,
      createdAt: true,
    },
  });
  if (plans.length === 0) {
    return null;
  }
  const runIds = plans
    .map((row) => row.sourceAgentRunId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const runs = await prisma.agentRun.findMany({
    where: { id: { in: runIds }, tenantId: scope.tenantId },
    select: { id: true, status: true },
  });
  const usage = await prisma.usageEvent.findMany({
    where: { agentRunId: { in: runIds }, tenantId: scope.tenantId },
    select: { agentRunId: true, provider: true, status: true, metadata: true },
  });
  const runStatus = new Map(runs.map((row) => [row.id, row.status]));
  const usageByRun = new Map<string, PreviousBatchCandidate['usageEvents']>();
  for (const event of usage) {
    if (!event.agentRunId) {
      continue;
    }
    const list = usageByRun.get(event.agentRunId) ?? [];
    list.push({ provider: event.provider, status: event.status, metadata: event.metadata });
    usageByRun.set(event.agentRunId, list);
  }
  const candidates: PreviousBatchCandidate[] = plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    tenantId: plan.tenantId,
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    sourceAgentRunId: plan.sourceAgentRunId,
    createdAt: plan.createdAt,
    agentRunStatus: plan.sourceAgentRunId ? (runStatus.get(plan.sourceAgentRunId) ?? null) : null,
    usageEvents: plan.sourceAgentRunId ? (usageByRun.get(plan.sourceAgentRunId) ?? []) : [],
  }));
  return selectLatestEligiblePreviousBatch(candidates, scope);
}
