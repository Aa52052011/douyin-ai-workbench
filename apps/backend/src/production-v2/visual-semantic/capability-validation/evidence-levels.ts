export const EVIDENCE_LEVELS = [
  'CONFIRMED',
  'DOCUMENTED',
  'INFERRED',
  'UNVALIDATED',
  'NOT_SUPPORTED',
] as const;

export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  CONFIRMED: 4,
  DOCUMENTED: 3,
  INFERRED: 2,
  UNVALIDATED: 1,
  NOT_SUPPORTED: 0,
};

export const atLeast = (actual: EvidenceLevel, min: EvidenceLevel): boolean =>
  EVIDENCE_RANK[actual] >= EVIDENCE_RANK[min];

export type DocSnapshot = {
  title: string;
  source: string;
  sourceType: 'official-docs' | 'official-catalog' | 'local-code' | 'upstream' | 'generic-spec' | 'third-party';
  retrievedAt: string;
  relevantCapability: string;
  summary: string;
  evidenceLevel: EvidenceLevel;
  claim: string;
};
