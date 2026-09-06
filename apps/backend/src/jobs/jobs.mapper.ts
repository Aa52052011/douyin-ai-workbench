import type { Job } from '@prisma/client';

export type JobPublic = {
  id: string;
  tenantId: string;
  workspaceId: string;
  projectId: string;
  kind: string;
  status: string;
  provider: string | null;
  model: string | null;
  input: unknown;
  output: unknown;
  error: unknown;
  progress: number;
  requestId: string;
  scriptId: string | null;
  videoId: string | null;
  agentRunId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  durationMs: number | null;
};

const REDACTED_KEYS = new Set([
  'storageKey',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'authorization',
  'Authorization',
  'token',
  'cipher',
  'nonce',
  'authTag',
  'masterKey',
]);

export function toPublicJob(job: Job): JobPublic {
  const durationMs =
    job.startedAt && job.completedAt ? job.completedAt.getTime() - job.startedAt.getTime() : null;
  return {
    id: job.id,
    tenantId: job.tenantId,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    kind: job.kind,
    status: job.status,
    provider: job.provider,
    model: job.model,
    input: redactSensitive(job.input),
    output: redactSensitive(job.output),
    error: redactSensitive(job.error),
    progress: job.progress,
    requestId: job.requestId,
    scriptId: job.scriptId,
    videoId: job.videoId,
    agentRunId: job.agentRunId,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    durationMs,
  };
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key)) {
      continue;
    }
    next[key] = redactSensitive(nested);
  }
  return next;
}
