import {
  LANDSCAPE_PROFILE_ID,
  VERTICAL_PROFILE_ID,
  buildDualOutputProductionPlan,
  evaluateProductionProfileGate,
  recommendSourceTypeOutput,
  type OutputSelectionPersistenceV1,
} from './dual-output.js';
import { SOURCE_AWARE_PREVIEW_RENDER_CONFIG } from '../source-aware-preview/render-config.js';

export function buildOutputSelectionHttpView(input: {
  session: { tenantId: string; id: string; assetId: string };
  selection: OutputSelectionPersistenceV1 | null;
  sourceVisualType: string;
  humanApproved: boolean;
  productionAuthorized: boolean;
}) {
  const uiDemo = input.sourceVisualType === 'SCREEN_RECORDING_UI_DEMO';
  const recommendation = recommendSourceTypeOutput({
    sourceVisualType: input.sourceVisualType,
    sourceAspectRatio: 1920 / 1040,
    uiDensity: uiDemo ? 'HIGH' : 'MEDIUM',
    textDensity: uiDemo ? 'HIGH' : 'MEDIUM',
    verticalReadability: uiDemo ? 'REDUCED_BY_WHOLE_PAGE_FIT' : 'ACCEPTABLE',
    landscapeReadability: uiDemo ? 'NEAR_NATIVE_PIXELS' : 'UNKNOWN',
    fullscreenRequirement: uiDemo ? 'LIKELY' : 'OPTIONAL',
    humanPreferenceHistory: input.selection
      ? [{ strategy: input.selection.selectedStrategy, source: input.selection.selectionSource }]
      : [],
  });
  const strategy = input.selection?.selectedStrategy ?? 'HUMAN_DECISION_REQUIRED';
  const plan = buildDualOutputProductionPlan({
    strategy,
    sourceAssetId: input.session.assetId,
    sourceAwarePlanRef: SOURCE_AWARE_PREVIEW_RENDER_CONFIG.planVersion,
  });
  const selectedDual = input.selection?.selectedStrategy === 'DUAL_VERTICAL_AND_LANDSCAPE';
  const gate = evaluateProductionProfileGate({
    strategySelected: Boolean(
      input.selection?.selectedStrategy && input.selection.selectedStrategy !== 'HUMAN_DECISION_REQUIRED',
    ),
    profileConfigValid: true,
    sourceOriginalAvailable: true,
    visualReviewApproved: input.humanApproved,
    truthGate: 'EXISTING',
    productionAuthorized: input.productionAuthorized,
  });
  const vertical = plan.profiles.find((item) => item.profileId === VERTICAL_PROFILE_ID)!;
  const landscape = plan.profiles.find((item) => item.profileId === LANDSCAPE_PROFILE_ID)!;
  return {
    schemaVersion: 'output-selection:v1' as const,
    outputStrategy: strategy,
    selectedBy: input.selection?.selectionSource === 'EXPLICIT_USER_MESSAGE' ? 'Human' : input.selection ? input.selection.selectionSource : 'NONE',
    selectionSource: input.selection?.selectionSource ?? null,
    selectedStrategy: input.selection?.selectedStrategy ?? null,
    selectedProfileIds: input.selection?.selectedProfileIds ?? [],
    vertical: {
      profileId: VERTICAL_PROFILE_ID,
      resolution: '1080x1920',
      status: selectedDual || input.selection?.selectedStrategy === 'VERTICAL_ONLY' ? 'SELECTED' : 'NOT_SELECTED',
      compositionPolicy: vertical.compositionPolicy,
    },
    landscape: {
      profileId: LANDSCAPE_PROFILE_ID,
      resolution: '1920x1080',
      status: selectedDual || input.selection?.selectedStrategy === 'LANDSCAPE_ONLY' ? 'SELECTED' : 'NOT_SELECTED',
      compositionPolicy: landscape.compositionPolicy,
    },
    recommendation: {
      strategy: recommendation.recommendedStrategy,
      forced: recommendation.forced,
      kind: recommendation.kind,
      match: input.selection?.selectedStrategy === recommendation.recommendedStrategy,
    },
    productionAuthorized: false,
    humanApproved: false,
    approvalObject: null,
    universalFinalResolution: false,
    gate,
    plan: {
      schemaVersion: plan.schemaVersion,
      estimatedRenderMultiplier: selectedDual ? 2 : plan.estimatedRenderMultiplier,
      approvalRequired: true,
      authorizationRequired: true,
      productionUsableAfterRender: false,
    },
  };
}
