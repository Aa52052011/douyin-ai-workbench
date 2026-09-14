import { factSource, hasFact, refsFromFacts, systemRef, visionTypeRefs } from './context-evidence.js';
import { deriveFlags, RULE_IDS, type DerivedFlags } from './context-rules.js';
import type {
  ContextReasonCode,
  EvidenceValueStatus,
  FreshnessStatus,
  MisleadingRiskLevel,
  ProjectContextEvaluationInput,
  ProjectContextEvaluationV1,
} from './context.types.js';
import { VISUAL_CONTEXT_SCHEMA_VERSION } from './context.types.js';
import type { ProjectRelevance } from '../visual-semantic/contracts/context-usage.types.js';

function unique(codes: ContextReasonCode[]): ContextReasonCode[] {
  return [...new Set(codes)];
}

function freshness(flags: DerivedFlags): { status: FreshnessStatus; reasons: ContextReasonCode[]; rules: string[] } {
  const rules = [RULE_IDS.FRESHNESS_HUMAN, RULE_IDS.CHROME_NOT_STALE, RULE_IDS.LOCALHOST_NOT_FAKE];
  if (flags.staleConfirmed) {
    return { status: 'STALE', reasons: ['STALE_HUMAN_CONFIRMED'], rules };
  }
  if (flags.currentConfirmed) {
    return { status: 'CURRENT', reasons: ['CURRENT_PROJECT_ASSET'], rules };
  }
  return { status: 'UNKNOWN', reasons: ['INSUFFICIENT_CONTEXT'], rules };
}

function relevance(flags: DerivedFlags, input: ProjectContextEvaluationInput): {
  status: ProjectRelevance;
  score: number;
  reasons: ContextReasonCode[];
} {
  if (hasFact(input, 'UNRELATED_CONTENT') || (flags.staleConfirmed && flags.mockConfirmed)) {
    return {
      status: flags.staleConfirmed && flags.mockConfirmed ? 'LOW' : 'UNRELATED',
      score: flags.staleConfirmed && flags.mockConfirmed ? 0.2 : 0.05,
      reasons: flags.staleConfirmed ? ['STALE_HUMAN_CONFIRMED', 'MOCK_CONTAMINATION_HUMAN_CONFIRMED'] : ['UNRELATED_CONTENT'],
    };
  }
  if (flags.productUi && flags.currentConfirmed) {
    const reasons: ContextReasonCode[] = ['CURRENT_PRODUCT_UI', 'CURRENT_PROJECT_ASSET'];
    if (flags.navigation || flags.contentPanel) reasons.push('WORKFLOW_SURFACES_VISIBLE');
    if (flags.emptyState || flags.oldEmptyHome) {
      return { status: 'MEDIUM', score: 0.62, reasons: [...reasons, 'EMPTY_STATE_LIMITATION'] };
    }
    return { status: 'HIGH', score: 0.9, reasons };
  }
  if (flags.productUi || flags.publishOps || flags.productInfoChat) {
    return { status: 'MEDIUM', score: 0.55, reasons: ['CURRENT_PRODUCT_UI'] };
  }
  return { status: 'UNKNOWN', score: 0.3, reasons: ['INSUFFICIENT_CONTEXT'] };
}

function evidenceValue(flags: DerivedFlags, rel: ProjectRelevance): {
  status: EvidenceValueStatus;
  reasons: ContextReasonCode[];
} {
  if (flags.staleConfirmed && flags.mockConfirmed) {
    return { status: 'NONE', reasons: ['MOCK_CONTAMINATION_HUMAN_CONFIRMED', 'TRUTH_RISK'] };
  }
  if (rel === 'UNRELATED') {
    return { status: 'NONE', reasons: ['UNRELATED_CONTENT'] };
  }
  if (flags.emptyState || flags.oldEmptyHome) {
    return { status: 'LOW', reasons: flags.oldEmptyHome ? ['OLD_EMPTY_HOME_LIMITATION'] : ['EMPTY_STATE_LIMITATION'] };
  }
  if (flags.publishOps) {
    return { status: 'MEDIUM', reasons: ['CURRENT_PRODUCT_UI', 'PUBLISH_PAGE_UNVALIDATED_CAPABILITY'] };
  }
  if (flags.productInfoChat) {
    return { status: 'MEDIUM', reasons: ['CURRENT_PRODUCT_UI'] };
  }
  if (flags.productUi && flags.currentConfirmed && (flags.navigation || flags.contentPanel)) {
    return { status: 'HIGH', reasons: ['REAL_PRODUCT_EVIDENCE', 'WORKFLOW_SURFACES_VISIBLE'] };
  }
  if (flags.productUi) {
    return { status: 'MEDIUM', reasons: ['CURRENT_PRODUCT_UI'] };
  }
  return { status: 'UNKNOWN', reasons: ['INSUFFICIENT_CONTEXT'] };
}

function misleading(flags: DerivedFlags): { level: MisleadingRiskLevel; reasons: ContextReasonCode[] } {
  if (flags.staleConfirmed && flags.mockConfirmed) {
    return { level: 'CRITICAL', reasons: ['MOCK_CONTAMINATION_HUMAN_CONFIRMED', 'STALE_HUMAN_CONFIRMED', 'TRUTH_RISK'] };
  }
  if (flags.publishOps) {
    return { level: 'MEDIUM', reasons: ['PUBLISH_PAGE_UNVALIDATED_CAPABILITY', 'CLAIM_NOT_VALIDATED'] };
  }
  if (flags.browserChrome || flags.localhost) {
    return { level: 'LOW', reasons: flags.browserChrome ? ['BROWSER_CHROME_PRESENT', 'PRESENTATION_LIMITATION_ONLY'] : ['LOCALHOST_PRESENT'] };
  }
  if (flags.currentConfirmed && flags.productUi) {
    return { level: 'NONE', reasons: ['REAL_PRODUCT_EVIDENCE'] };
  }
  return { level: 'LOW', reasons: ['INSUFFICIENT_CONTEXT'] };
}

function confidence(input: ProjectContextEvaluationInput, flags: DerivedFlags): ProjectContextEvaluationV1['confidence'] {
  const humanCurrent = flags.currentConfirmed && factSource(input, 'CURRENT_RECORDING') === 'HUMAN_CONFIRMED';
  const vision = input.visualSemanticSummary.observationTypes.length > 0;
  if ((humanCurrent || flags.staleConfirmed) && (vision || flags.mockConfirmed || flags.noKnownMock)) return 'HIGH';
  if (flags.currentConfirmed || flags.productUi) return 'MEDIUM';
  return 'LOW';
}

export function evaluateProjectContext(input: ProjectContextEvaluationInput): ProjectContextEvaluationV1 {
  const flags = deriveFlags(input);
  const fresh = freshness(flags);
  const rel = relevance(flags, input);
  const evidence = evidenceValue(flags, rel.status);
  const risk = misleading(flags);
  const conflicts: ProjectContextEvaluationV1['conflicts'] = [];
  if (flags.productUi && flags.mockConfirmed) {
    conflicts.push({
      type: 'HUMAN_VISION_CONFLICT',
      summary: 'Vision observes PRODUCT_UI while human-confirmed stale/mock contamination applies to current-content truth.',
    });
  }
  const triggeredRules = [...fresh.rules, RULE_IDS.RELEVANCE_PRODUCT_UI];
  if (flags.emptyState || flags.oldEmptyHome) triggeredRules.push(RULE_IDS.EMPTY_STATE);
  if (flags.publishOps) triggeredRules.push(RULE_IDS.PUBLISH_CLAIM);
  if (flags.privacyBlocker) triggeredRules.push(RULE_IDS.PRIVACY);
  if (flags.rightsBlocker) triggeredRules.push(RULE_IDS.RIGHTS);
  if (flags.truthHardBlock) triggeredRules.push(RULE_IDS.TRUTH_STALE_MOCK);
  if (flags.forcePreferred && (flags.truthHardBlock || flags.privacyBlocker || flags.rightsBlocker)) {
    triggeredRules.push(RULE_IDS.OVERRIDE_CANNOT_BYPASS);
  }

  return {
    schemaVersion: VISUAL_CONTEXT_SCHEMA_VERSION,
    assetId: input.assetFacts.assetId,
    projectId: input.projectContext.projectId,
    topicId: input.contentContext.topicId,
    scriptId: input.scriptContext.scriptId,
    contextVersion: VISUAL_CONTEXT_SCHEMA_VERSION,
    relevance: { status: rel.status, score: rel.score, reasons: unique(rel.reasons) },
    freshness: { status: fresh.status, reasons: unique(fresh.reasons) },
    evidenceValue: { status: evidence.status, reasons: unique(evidence.reasons) },
    misleadingRisk: { level: risk.level, reasons: unique(risk.reasons) },
    truthSupport: unique([
      ...(flags.currentConfirmed && flags.productUi ? (['REAL_PRODUCT_EVIDENCE'] as ContextReasonCode[]) : []),
      ...(flags.truthHardBlock ? (['TRUTH_RISK'] as ContextReasonCode[]) : []),
    ]),
    conflicts,
    confidence: confidence(input, flags),
    sourceRefs: [
      ...refsFromFacts(input.humanFacts),
      ...visionTypeRefs(input.visualSemanticSummary.observationTypes),
      systemRef('projectId', input.projectContext.projectId),
      systemRef('mustUseRealProductEvidence', String(input.truthConstraints.mustUseRealProductEvidence)),
    ],
    triggeredRules: [...new Set(triggeredRules)],
  };
}
