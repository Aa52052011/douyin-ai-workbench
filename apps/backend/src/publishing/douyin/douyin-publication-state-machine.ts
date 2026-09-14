import { DouyinProviderError } from './douyin-provider-error.js';

export const DOUYIN_EXECUTION_STATES = [
  'READY',
  'UPLOADING',
  'UPLOAD_COMPLETED',
  'UPLOAD_FAILED',
  'CREATE_SUBMITTING',
  'CREATE_SUBMITTED',
  'CREATE_FAILED',
  'UNDER_PLATFORM_REVIEW',
  'PUBLISHED',
  'AMBIGUOUS_CREATE_STATE',
  'REAUTHORIZATION_REQUIRED',
  'BLOCKED_PERMISSION',
] as const;

export type DouyinExecutionState = (typeof DOUYIN_EXECUTION_STATES)[number];

const ALLOWED: Record<DouyinExecutionState, DouyinExecutionState[]> = {
  READY: ['UPLOADING', 'BLOCKED_PERMISSION'],
  UPLOADING: ['UPLOAD_COMPLETED', 'UPLOAD_FAILED'],
  UPLOAD_COMPLETED: ['CREATE_SUBMITTING'],
  UPLOAD_FAILED: ['UPLOADING', 'BLOCKED_PERMISSION'],
  CREATE_SUBMITTING: ['CREATE_SUBMITTED', 'CREATE_FAILED', 'AMBIGUOUS_CREATE_STATE', 'UNDER_PLATFORM_REVIEW'],
  CREATE_SUBMITTED: ['UNDER_PLATFORM_REVIEW', 'CREATE_FAILED', 'PUBLISHED'],
  CREATE_FAILED: ['BLOCKED_PERMISSION'],
  UNDER_PLATFORM_REVIEW: ['PUBLISHED', 'CREATE_FAILED'],
  PUBLISHED: [],
  AMBIGUOUS_CREATE_STATE: [],
  REAUTHORIZATION_REQUIRED: ['BLOCKED_PERMISSION'],
  BLOCKED_PERMISSION: [],
};

export function assertTransition(from: DouyinExecutionState, to: DouyinExecutionState): void {
  if (!ALLOWED[from].includes(to)) {
    throw new DouyinProviderError('INVALID_STATE_TRANSITION', { message: `${from} -> ${to}` });
  }
}

export function canRetryCreate(_state: DouyinExecutionState): boolean {
  return false;
}

export function duplicateCreateForbidden(state: DouyinExecutionState): boolean {
  return (
    state === 'CREATE_SUBMITTED' ||
    state === 'UNDER_PLATFORM_REVIEW' ||
    state === 'PUBLISHED' ||
    state === 'AMBIGUOUS_CREATE_STATE'
  );
}

export type DouyinPublicationExecutionRecord = {
  executionId: string;
  idempotencyKey: string;
  platform: 'DOUYIN';
  accountConnectionId: string;
  artifactSHA256: string;
  publicationAuthorizationId: string;
  status: DouyinExecutionState;
  uploadVideoId?: string;
  platformItemId?: string;
  requestId?: string;
  attemptedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function executionUniquenessKey(input: {
  platform?: string;
  accountConnectionId: string;
  artifactSHA256: string;
  publicationAuthorizationId: string;
}): string {
  return [
    input.platform ?? 'DOUYIN',
    input.accountConnectionId,
    input.artifactSHA256,
    input.publicationAuthorizationId,
  ].join(':');
}

export class InMemoryPublicationExecutionStore {
  private readonly byKey = new Map<string, DouyinPublicationExecutionRecord>();

  get(key: string): DouyinPublicationExecutionRecord | undefined {
    return this.byKey.get(key);
  }

  put(record: DouyinPublicationExecutionRecord): DouyinPublicationExecutionRecord {
    this.byKey.set(record.idempotencyKey, record);
    return record;
  }
}
