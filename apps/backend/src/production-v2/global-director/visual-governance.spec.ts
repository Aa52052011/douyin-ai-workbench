import { describe, expect, it } from 'vitest';
import { loadFrozenScriptBeats } from '../editorial-shot-director/narration-units.js';
import { buildContent01DirectorPlan } from './director-v1.js';
import {
  VISUAL_AUTHENTICITY_PRIORITY,
  currentCandidateRejection,
  directorGenerationRule,
  evaluateC6VisualImplicationGate,
  humanAiImageReview,
  humanVisualPolicyDecision,
  section4GenerationRetryDecision,
  visualAuthenticityPriority,
  aiVisualStyleGovernance,
} from './visual-governance.js';

describe('B2-15O2E visual governance', () => {
  it('records human rejection and policy approval', () => {
    expect(humanAiImageReview().decision).toBe('REJECTED');
    expect(humanAiImageReview().productionUsable).toBe(false);
    expect(humanAiImageReview().autoRetry).toBe(false);
    expect(humanVisualPolicyDecision().decision).toBe('APPROVED');
    expect(humanVisualPolicyDecision().artifactApprovalImplied).toBe(false);
    expect(currentCandidateRejection().productUiGate.status).toBe('REJECT');
  });

  it('puts real UI first and generic AI last; transform before generation', () => {
    expect(VISUAL_AUTHENTICITY_PRIORITY[0]).toBe('REAL_PRODUCT_UI');
    expect(VISUAL_AUTHENTICITY_PRIORITY.at(-1)).toBe('GENERIC_AI_IMAGE');
    expect(visualAuthenticityPriority().genericAiImage).toBe('LAST_RESORT');
    expect(directorGenerationRule('SUFFICIENT')).toBe('NO_GENERATION');
    expect(directorGenerationRule('PARTIAL')).toBe('TRANSFORM_FIRST');
    expect(section4GenerationRetryDecision().shouldRetryAiImage).toBe(false);
  });

  it('does not treat prompt C6 as rendered C6', () => {
    const c6 = evaluateC6VisualImplicationGate({
      promptConstraint: 'PASS',
      rendered: 'REJECTED_BY_HUMAN',
      implications: ['WEALTH_SYMBOLISM'],
    });
    expect(c6.promptDoesNotEqualRendered).toBe(true);
    expect(c6.renderedVisual).toBe('REJECTED_BY_HUMAN');
  });

  it('inherits governance to AI video and digital human background; does not mutate script', () => {
    expect(aiVisualStyleGovernance().appliesTo).toContain('AI_VIDEO');
    expect(aiVisualStyleGovernance().appliesTo).toContain('DIGITAL_HUMAN_BACKGROUND');
    const beats = loadFrozenScriptBeats();
    expect(beats[0].narration).toContain('会写文案的AI');
    const plan = buildContent01DirectorPlan();
    expect(plan.routes.find((r) => r.beatId === 'beat:section4')?.generationNeeded).toBe(false);
    expect(plan.shots.find((s) => s.beatId === 'beat:section4')?.generationRequestId).toBeNull();
  });
});
