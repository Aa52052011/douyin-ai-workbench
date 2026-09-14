export const COST_CALCULATION_VERSION = 'v1';

export const MOCK_PROVIDER_IDS = new Set([
  'mock',
  'mock-tts',
  'mock-compose',
  'mock-video',
  'mock-subtitle',
  'color-background',
]);

export type QuotaDecision = {
  allow: boolean;
  reason?: string;
};

export type CreditAmount = {
  credits: string;
  currencyHint?: string;
};

/** Credits conversion is not implemented in 13.11. */
export type UsageCharge = {
  usageEventId: string;
  creditAmount?: CreditAmount;
};

export type MeteringScope = {
  tenantId: string;
  workspaceId: string;
  projectId?: string;
  userId?: string;
  videoId?: string;
  jobId?: string;
  agentRunId?: string;
  generationVersion?: string;
  stage?: string;
  repairAttempt?: number;
  repairIssueCode?: string;
  /** Identifies one real provider invocation. New retry = new attemptKey. */
  attemptKey?: string;
};

export type StartUsageInput = MeteringScope & {
  operationType: string;
  provider: string;
  model?: string;
  resourceType: string;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type CompleteUsageUnits = {
  inputUnits?: string | number | null;
  outputUnits?: string | number | null;
  totalUnits?: string | number | null;
  unitType?: string | null;
  durationSeconds?: string | number | null;
  imageCount?: number | null;
  videoSeconds?: string | number | null;
  characterCount?: number | null;
  storageBytes?: number | bigint | null;
  computeMs?: number | null;
  providerRequestId?: string | null;
  actualCost?: string | number | null;
  actualCurrency?: string | null;
};

export type UsageCostSummary = {
  usageCount: number;
  unpricedUsageCount: number;
  totalsByCurrency: Array<{ currency: string; totalKnownCost: string }>;
  mixedCurrency: boolean;
  breakdownByResource: Array<{
    resourceType: string;
    count: number;
    inputUnits?: string;
    outputUnits?: string;
    imageCount?: number;
    characterCount?: number;
    computeMs?: number;
    durationSeconds?: string;
  }>;
  breakdownByProvider: Array<{ provider: string; count: number }>;
  breakdownByOperation: Array<{ operationType: string; count: number }>;
};
