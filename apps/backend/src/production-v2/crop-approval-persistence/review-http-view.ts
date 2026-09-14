import { HUMAN_REQUIRED_ITEMS, SELECTABLE_BACKGROUNDS, VISIBLE_WARNINGS } from '../crop-review-flow/review-flow.types.js';
import { SMOKE_PLACEHOLDER_BACKGROUND } from '../crop-review-flow/preview-runtime-plan.js';
import type { PersistedHumanApproval, PersistedReviewSession } from './persistence.types.js';
import { abstractPreviewRef } from './preview-media-store.js';

const STRATEGY_BY_CANDIDATE: Record<string, string> = {
  'crop:top-trim': 'TOP_TRIM',
  'crop:contain': 'CONTAIN',
  'crop:ui-focus-balanced': 'UI_FOCUS_BALANCED',
  'crop:safe-region': 'SAFE_REGION',
  'crop:center-cover': 'CENTER_COVER',
  'crop:ui-focus-tight': 'UI_FOCUS_TIGHT',
};

export const ELIGIBLE_ALTERNATIVES = [
  { candidateId: 'crop:contain', strategy: 'CONTAIN' },
  { candidateId: 'crop:top-trim', strategy: 'TOP_TRIM' },
  { candidateId: 'crop:ui-focus-balanced', strategy: 'UI_FOCUS_BALANCED' },
  { candidateId: 'crop:safe-region', strategy: 'SAFE_REGION' },
];

export const INELIGIBLE_ALTERNATIVES = [
  { candidateId: 'crop:center-cover', strategy: 'CENTER_COVER', reason: 'INELIGIBLE HIGH_EVIDENCE_LOSS' },
  { candidateId: 'crop:ui-focus-tight', strategy: 'UI_FOCUS_TIGHT', reason: 'INELIGIBLE semantic/safety' },
];

export function bumpPreviewVersion(current: string): string {
  const match = current.match(/(\d+)$/);
  if (!match) return `${current}:1`;
  return `${current.slice(0, -match[1].length)}${Number(match[1]) + 1}`;
}

export function bumpPacketVersion(current: string): string {
  const match = current.match(/(\d+)$/);
  if (!match) return `${current}.1`;
  return `${current.slice(0, -match[1].length)}${Number(match[1]) + 1}`;
}

export function derivePreviewStatus(session: PersistedReviewSession): string {
  if (session.status === 'PREVIEW_PENDING' || !session.previewId) {
    if (session.backgroundTreatment === 'UNRESOLVED' && !session.previewId) return 'PLACEHOLDER_ONLY';
    if (session.status === 'PREVIEW_PENDING') return 'STALE';
    return session.previewId ? 'READY' : 'NOT_RENDERED';
  }
  if (session.status === 'READY_FOR_REVIEW' || session.status === 'APPROVED') return 'READY';
  return 'STALE';
}

export function pendingHuman(session: PersistedReviewSession): boolean {
  const items = session.checklistJson.length
    ? session.checklistJson
    : HUMAN_REQUIRED_ITEMS.map((id) => ({ id, interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' }));
  return items.some(
    (item) => HUMAN_REQUIRED_ITEMS.includes(item.id as (typeof HUMAN_REQUIRED_ITEMS)[number]) && item.interaction !== 'CONFIRMED_HUMAN',
  );
}

export function hardBlocked(session: PersistedReviewSession): boolean {
  return session.checklistJson.some((item) => item.id === 'NO_PRIVACY_RIGHTS_BLOCKER' && item.interaction === 'FAILED');
}

export function approveButton(
  session: PersistedReviewSession,
  recon?: { status: string; failureCode: string | null; placeholder: boolean; backgroundApprovalEligible: boolean } | null,
): { enabled: boolean; reason: string; reasons: string[] } {
  const reasons: string[] = [];
  if (session.status === 'APPROVED') reasons.push('ALREADY_APPROVED');
  if (session.status === 'REJECTED') reasons.push('SESSION_REJECTED');
  if (session.status === 'CHANGES_REQUESTED') reasons.push('CHANGES_REQUESTED');
  if (session.backgroundTreatment === 'UNRESOLVED') reasons.push('BACKGROUND_UNRESOLVED');
  if (pendingHuman(session)) reasons.push('REQUIRED_HUMAN_CHECKS_INCOMPLETE');
  if (recon?.failureCode === 'PREVIEW_ARTIFACT_MISSING' || recon?.status === 'MISSING_ARTIFACT') {
    reasons.push('PREVIEW_ARTIFACT_MISSING');
  }
  const previewStatus = recon?.status === 'STALE' || recon?.status === 'FAILED' ? recon.status : derivePreviewStatus(session);
  if (previewStatus !== 'READY') reasons.push(previewStatus === 'STALE' ? 'PREVIEW_NOT_READY' : `PREVIEW_${previewStatus}`);
  if (recon?.placeholder) reasons.push('PLACEHOLDER_BACKGROUND_NOT_APPROVABLE');
  if (hardBlocked(session)) reasons.push('HARD_BLOCKER');
  if (session.status === 'PREVIEW_PENDING') reasons.push('PREVIEW_PENDING');
  if (session.invalidationReason === 'PREVIEW_RENDERING') reasons.push('PREVIEW_RENDERING');
  const enabled = reasons.length === 0 && session.status === 'READY_FOR_REVIEW';
  return { enabled, reason: enabled ? 'GATES_PASSED' : reasons[0] ?? 'BLOCKED', reasons };
}

export function buildReviewHttpView(input: {
  session: PersistedReviewSession;
  approval: PersistedHumanApproval | null;
  recon?: {
    status: string;
    failureCode: string | null;
    playable: boolean;
    placeholder: boolean;
    backgroundApprovalEligible: boolean;
  } | null;
}) {
  const { session, approval } = input;
  const previewStatus =
    input.recon?.status === 'MISSING_ARTIFACT' || input.recon?.status === 'STALE' || input.recon?.status === 'FAILED'
      ? input.recon.status === 'MISSING_ARTIFACT'
        ? 'STALE'
        : input.recon.status
      : derivePreviewStatus(session);
  const smokePlaceholder =
    Boolean(input.recon?.placeholder) || (session.backgroundTreatment === 'UNRESOLVED' && previewStatus === 'READY');
  const playable = Boolean(input.recon?.playable) && previewStatus === 'READY';
  return {
    ok: true as const,
    sourceOfTruth: 'POSTGRES' as const,
    session,
    approval,
    candidate: {
      id: session.candidateId,
      version: session.candidateVersion,
      strategy: candidateStrategy(session.candidateId),
    },
    preview: {
      id: session.previewId,
      version: session.previewVersion,
      status: previewStatus,
      mediaUrl: `/production-v2/crop-review/${session.id}/preview-media`,
      abstractRef: abstractPreviewRef(session.id, session.previewVersion),
      width: 720,
      height: 1280,
      previewOnly: true,
      productionUsable: false,
      playable,
      smokePlaceholder,
      smokeMode: smokePlaceholder ? SMOKE_PLACEHOLDER_BACKGROUND : null,
      humanSelectedBackground: session.backgroundTreatment,
      failureCode: input.recon?.failureCode ?? session.invalidationReason,
      backgroundApprovalEligible: input.recon?.backgroundApprovalEligible === true,
    },
    warnings: VISIBLE_WARNINGS.slice(),
    requiredWarnings: session.requiredWarningsJson,
    checklist: displayChecklist(session),
    background: {
      value: session.backgroundTreatment,
      defaultSelected: false,
      options: SELECTABLE_BACKGROUNDS.slice(),
      unavailable: ['AI_GENERATED', 'DUPLICATE_BLUR'],
    },
    metrics: {
      previewTarget: '720×1280',
      previewOnly: true,
      productionUsable: false,
    },
    eligibleAlternatives: ELIGIBLE_ALTERNATIVES,
    ineligibleAlternatives: INELIGIBLE_ALTERNATIVES,
    approveButton: approveButton(session, input.recon),
    humanDecision: session.humanDecision,
    ffmpegSpawned: false,
  };
}

export function displayChecklist(session: PersistedReviewSession) {
  const items = session.checklistJson.length
    ? session.checklistJson.slice()
    : HUMAN_REQUIRED_ITEMS.map((id) => ({ id, interaction: 'PENDING_HUMAN', kind: 'HUMAN_CONFIRM_REQUIRED' }));
  if (!items.some((item) => item.id === 'NO_PRIVACY_RIGHTS_BLOCKER')) {
    items.push({ id: 'NO_PRIVACY_RIGHTS_BLOCKER', interaction: 'PASS_SYSTEM', kind: 'SYSTEM_VERIFIED' });
  }
  return items;
}

export function candidateStrategy(candidateId: string): string {
  return STRATEGY_BY_CANDIDATE[candidateId] ?? candidateId.replace(/^crop:/, '').toUpperCase().replaceAll('-', '_');
}
