export type PreviousBatchUsageAttempt = {
  provider: string;
  status: string;
  metadata?: unknown;
};

export type PreviousBatchCandidate = {
  id: string;
  title: string | null;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  sourceAgentRunId: string | null;
  createdAt: Date;
  agentRunStatus?: string | null;
  usageEvents?: PreviousBatchUsageAttempt[];
};

export type PreviousBatchSummaryPick = {
  planId: string;
  title: string | null;
};

const BUSINESS_LLM_KINDS = new Set(['llm', undefined, null, '']);

export function isBusinessLlmUsage(metadata: unknown): boolean {
  if (metadata == null) {
    return true;
  }
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return true;
  }
  const kind = (metadata as { callKind?: unknown }).callKind;
  if (kind === 'RECOVERY_PROBE') {
    return false;
  }
  if (typeof kind === 'string') {
    return BUSINESS_LLM_KINDS.has(kind);
  }
  return kind == null;
}

export function hasLegitimateRealSucceededBusinessAttempt(events: PreviousBatchUsageAttempt[] | undefined): boolean {
  if (!events?.length) {
    return false;
  }
  return events.some(
    (event) =>
      event.provider === 'real' &&
      event.status === 'SUCCEEDED' &&
      isBusinessLlmUsage(event.metadata),
  );
}

export function isEligibleRealPreviousBatch(candidate: PreviousBatchCandidate): boolean {
  if (!candidate.sourceAgentRunId) {
    return false;
  }
  if (candidate.agentRunStatus !== 'COMPLETED') {
    return false;
  }
  return hasLegitimateRealSucceededBusinessAttempt(candidate.usageEvents);
}

/** Candidates must already be newest-first. Returns the latest eligible real batch. */
export function selectLatestEligiblePreviousBatch(
  candidates: PreviousBatchCandidate[],
  scope: { tenantId: string; workspaceId: string; projectId: string },
): PreviousBatchSummaryPick | null {
  for (const candidate of candidates) {
    if (
      candidate.tenantId !== scope.tenantId ||
      candidate.workspaceId !== scope.workspaceId ||
      candidate.projectId !== scope.projectId
    ) {
      continue;
    }
    if (!isEligibleRealPreviousBatch(candidate)) {
      continue;
    }
    return { planId: candidate.id, title: candidate.title };
  }
  return null;
}
