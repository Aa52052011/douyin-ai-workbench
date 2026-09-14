import type { NormalizedRect } from '../../visual/geometry/types.js';
import type {
  ProviderSemanticObservation,
  ProviderSemanticRegion,
  VisualObservationEvidence,
  VisualSemanticAnalysisRequest,
  VisualSemanticProviderResult,
} from '../contracts/provider-runtime.types.js';

export const SYNTHETIC_RECT: NormalizedRect = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };
export const TOP_STRIP_RECT: NormalizedRect = { x: 0, y: 0, width: 1, height: 0.08 };

export function fixtureEvidence(frameId = 'f0', signals: string[] = ['synthetic']): VisualObservationEvidence {
  return { frameIds: [frameId], visualSignals: signals };
}

export function fixtureObservation(
  type: ProviderSemanticObservation['type'],
  extras: Partial<ProviderSemanticObservation> = {},
): ProviderSemanticObservation {
  return {
    observationId: extras.observationId ?? 'pending',
    type,
    confidence: extras.confidence ?? 0.9,
    source: extras.source ?? 'MOCK_PROVIDER',
    evidence: extras.evidence ?? fixtureEvidence(),
    uncertainty: extras.uncertainty ?? { level: 'LOW', reasons: ['fixture'] },
    region: extras.region ?? SYNTHETIC_RECT,
    startMs: extras.startMs,
    endMs: extras.endMs,
    observationState: extras.observationState,
  };
}

export function fixtureRegion(type: ProviderSemanticRegion['type'], rect = SYNTHETIC_RECT): ProviderSemanticRegion {
  return {
    regionId: `reg:${type}`,
    type,
    rect,
    confidence: 0.88,
    attributes: {},
    source: 'MOCK_PROVIDER',
  };
}

export function baseResult(overrides: Partial<VisualSemanticProviderResult> = {}): VisualSemanticProviderResult {
  return {
    providerId: 'mock-visual-semantic',
    providerFamily: 'MOCK',
    requestId: 'req-fixture',
    status: 'READY',
    observations: [],
    semanticRegions: [],
    warnings: [],
    schemaVersion: 'visual.semantic.provider-result:v1',
    rawMetadata: { fixtureId: 'synthetic' },
    ...overrides,
  };
}

export function imageRequest(overrides: Partial<VisualSemanticAnalysisRequest> = {}): VisualSemanticAnalysisRequest {
  return {
    requestId: 'req-image',
    assetId: 'asset-synthetic',
    mediaKind: 'IMAGE',
    analysisMode: 'IMAGE_SINGLE',
    frames: [
      {
        frameId: 'f0',
        timestampMs: 0,
        width: 1280,
        height: 720,
        mediaRef: { kind: 'FIXTURE_REF', reference: 'synthetic://product-ui' },
        selectionReason: ['IMAGE_PRIMARY'],
      },
    ],
    taskModules: ['UI_STRUCTURE'],
    schemaVersion: 'visual.semantic.provider-request:v1',
    promptVersion: 'visual.semantic.base:v1',
    ...overrides,
  };
}

export function videoRequest(overrides: Partial<VisualSemanticAnalysisRequest> = {}): VisualSemanticAnalysisRequest {
  return {
    requestId: 'req-video',
    assetId: 'asset-synthetic-video',
    mediaKind: 'VIDEO',
    analysisMode: 'VIDEO_FRAME_SET',
    durationMs: 10_000,
    frames: [
      {
        frameId: 'f0',
        timestampMs: 0,
        width: 1280,
        height: 720,
        mediaRef: { kind: 'FIXTURE_REF', reference: 'synthetic://frame-0' },
        selectionReason: ['UNIFORM'],
      },
      {
        frameId: 'f1',
        timestampMs: 4000,
        width: 1280,
        height: 720,
        mediaRef: { kind: 'FIXTURE_REF', reference: 'synthetic://frame-1' },
        selectionReason: ['SCENE_CANDIDATE'],
      },
    ],
    taskModules: ['UI_STRUCTURE'],
    schemaVersion: 'visual.semantic.provider-request:v1',
    promptVersion: 'visual.semantic.base:v1',
    ...overrides,
  };
}
