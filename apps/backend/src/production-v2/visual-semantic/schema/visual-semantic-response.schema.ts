import { validateNormalizedRect } from '../../visual/geometry/normalized-rect.js';
import type { NormalizedRect } from '../../visual/geometry/types.js';
import { VISUAL_SEMANTIC_OBSERVATION_TYPES } from '../contracts/observation.types.js';
import { SUBJECT_TYPES, UI_FOCUS_ROLES } from '../contracts/focus-subject.types.js';
import { PRIVACY_CATEGORIES, WATERMARK_TYPES } from '../contracts/authenticity-privacy.types.js';
import {
  BROWSER_CHROME_SIGNALS,
  FORBIDDEN_PROVIDER_TASK_MODULES,
  FRAME_SELECTION_REASONS,
  MEDIA_REF_KINDS,
  MODULE_RESULT_STATUSES,
  OBSERVATION_STATES,
  PROVIDER_ANALYSIS_MODES,
  PROVIDER_AUTHENTICITY_TYPES,
  PROVIDER_DEVELOPER_ARTIFACT_TYPES,
  PROVIDER_FAMILIES,
  PROVIDER_MEDIA_KINDS,
  PROVIDER_OBSERVATION_SOURCES,
  PROVIDER_RESULT_STATUSES,
  PROVIDER_TASK_MODULES,
  PRIVACY_SEVERITIES,
  TEXT_EVIDENCE_SOURCES,
  UNCERTAINTY_LEVELS,
  type ProviderSemanticObservation,
  type SemanticFrameInput,
  type SemanticMediaRef,
  type TextEvidenceFragment,
  type VisualObservationEvidence,
  type VisualSemanticAnalysisRequest,
  type VisualSemanticProviderResult,
} from '../contracts/provider-runtime.types.js';
import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import {
  asEnum,
  asFiniteNumber,
  asString,
  assertAllowedKeys,
  assertNoForbiddenKeys,
  isPlainObject,
} from './unknown-keys.js';

function failSchema(detail: string): never {
  throw new VisualSemanticProviderError('SCHEMA_VALIDATION_FAILED', detail);
}

function failInput(detail: string): never {
  throw new VisualSemanticProviderError('INPUT_INVALID', detail);
}

function parseRect(value: unknown, label: string): NormalizedRect {
  if (!isPlainObject(value)) {
    failSchema(`${label}:rect`);
  }
  assertAllowedKeys(value, ['x', 'y', 'width', 'height'], label);
  const rect: NormalizedRect = {
    x: asFiniteNumber(value.x, `${label}.x`),
    y: asFiniteNumber(value.y, `${label}.y`),
    width: asFiniteNumber(value.width, `${label}.width`),
    height: asFiniteNumber(value.height, `${label}.height`),
  };
  const check = validateNormalizedRect(rect);
  if (!check.ok) {
    failSchema(`${label}:bounds`);
  }
  return rect;
}

function parseConfidence(value: unknown, label: string): number {
  const n = asFiniteNumber(value, label);
  if (n < 0 || n > 1) {
    failSchema(`${label}:range`);
  }
  return n;
}

function parseTemporal(startMs: unknown, endMs: unknown, durationMs: number | undefined, label: string): { startMs?: number; endMs?: number } {
  if (startMs === undefined && endMs === undefined) {
    return {};
  }
  if (startMs === undefined || endMs === undefined) {
    failSchema(`${label}:temporal-pair`);
  }
  const start = asFiniteNumber(startMs, `${label}.startMs`);
  const end = asFiniteNumber(endMs, `${label}.endMs`);
  if (start < 0 || end < 0 || end < start) {
    failSchema(`${label}:temporal-order`);
  }
  if (durationMs !== undefined && end > durationMs + 50) {
    failSchema(`${label}:temporal-duration`);
  }
  return { startMs: start, endMs: end };
}

function hasEvidence(evidence: VisualObservationEvidence): boolean {
  return (
    evidence.frameIds.length > 0 ||
    (evidence.regions?.length ?? 0) > 0 ||
    (evidence.textFragments?.length ?? 0) > 0 ||
    (evidence.visualSignals?.length ?? 0) > 0
  );
}

function parseTextFragment(value: unknown, label: string): TextEvidenceFragment {
  if (!isPlainObject(value)) {
    failSchema(label);
  }
  assertAllowedKeys(value, ['text', 'confidence', 'region', 'frameId', 'source'], label);
  const fragment: TextEvidenceFragment = {
    text: asString(value.text, `${label}.text`),
    confidence: parseConfidence(value.confidence, `${label}.confidence`),
    frameId: asString(value.frameId, `${label}.frameId`),
    source: asEnum(value.source, TEXT_EVIDENCE_SOURCES, `${label}.source`),
  };
  if (value.region !== undefined) {
    fragment.region = parseRect(value.region, `${label}.region`);
  }
  return fragment;
}

export function parseEvidence(value: unknown, label: string): VisualObservationEvidence {
  if (!isPlainObject(value)) {
    failSchema(label);
  }
  assertAllowedKeys(value, ['frameIds', 'regions', 'textFragments', 'visualSignals'], label);
  if (!Array.isArray(value.frameIds)) {
    failSchema(`${label}.frameIds`);
  }
  const evidence: VisualObservationEvidence = {
    frameIds: value.frameIds.map((id, i) => asString(id, `${label}.frameIds[${i}]`)),
  };
  if (value.regions !== undefined) {
    if (!Array.isArray(value.regions)) {
      failSchema(`${label}.regions`);
    }
    evidence.regions = value.regions.map((r, i) => parseRect(r, `${label}.regions[${i}]`));
  }
  if (value.textFragments !== undefined) {
    if (!Array.isArray(value.textFragments)) {
      failSchema(`${label}.textFragments`);
    }
    evidence.textFragments = value.textFragments.map((t, i) => parseTextFragment(t, `${label}.textFragments[${i}]`));
  }
  if (value.visualSignals !== undefined) {
    if (!Array.isArray(value.visualSignals)) {
      failSchema(`${label}.visualSignals`);
    }
    evidence.visualSignals = value.visualSignals.map((s, i) => asString(s, `${label}.visualSignals[${i}]`));
  }
  if (!hasEvidence(evidence)) {
    failSchema(`${label}:empty`);
  }
  return evidence;
}

function parseMediaRef(value: unknown, label: string): SemanticMediaRef {
  if (!isPlainObject(value)) {
    failInput(label);
  }
  assertAllowedKeys(value, ['kind', 'reference'], label);
  return {
    kind: asEnum(value.kind, MEDIA_REF_KINDS, `${label}.kind`),
    reference: asString(value.reference, `${label}.reference`),
  };
}

function parseFrame(value: unknown, label: string): SemanticFrameInput {
  if (!isPlainObject(value)) {
    failInput(label);
  }
  assertAllowedKeys(value, ['frameId', 'timestampMs', 'width', 'height', 'mediaRef', 'selectionReason'], label);
  if (!Array.isArray(value.selectionReason) || value.selectionReason.length === 0) {
    failInput(`${label}.selectionReason`);
  }
  const frame: SemanticFrameInput = {
    frameId: asString(value.frameId, `${label}.frameId`),
    width: asFiniteNumber(value.width, `${label}.width`),
    height: asFiniteNumber(value.height, `${label}.height`),
    mediaRef: parseMediaRef(value.mediaRef, `${label}.mediaRef`),
    selectionReason: value.selectionReason.map((r, i) => asEnum(r, FRAME_SELECTION_REASONS, `${label}.selectionReason[${i}]`)),
  };
  if (frame.width <= 0 || frame.height <= 0) {
    failInput(`${label}.size`);
  }
  if (value.timestampMs !== undefined) {
    frame.timestampMs = asFiniteNumber(value.timestampMs, `${label}.timestampMs`);
    if (frame.timestampMs < 0) {
      failInput(`${label}.timestampMs`);
    }
  }
  return frame;
}

export function parseVisualSemanticAnalysisRequest(raw: unknown): VisualSemanticAnalysisRequest {
  try {
    return parseVisualSemanticAnalysisRequestInner(raw);
  } catch (error) {
    if (error instanceof VisualSemanticProviderError) {
      throw error;
    }
    throw new VisualSemanticProviderError('INPUT_INVALID');
  }
}

function parseVisualSemanticAnalysisRequestInner(raw: unknown): VisualSemanticAnalysisRequest {
  try {
    assertNoForbiddenKeys(raw);
  } catch {
    failInput('forbidden-keys');
  }
  if (!isPlainObject(raw)) {
    failInput('request');
  }
  assertAllowedKeys(
    raw,
    [
      'requestId',
      'assetId',
      'contentHash',
      'mediaKind',
      'analysisMode',
      'frames',
      'taskModules',
      'projectContext',
      'platformContext',
      'schemaVersion',
      'promptVersion',
      'timeoutMs',
      'durationMs',
    ],
    'request',
  );
  if (!Array.isArray(raw.frames) || !Array.isArray(raw.taskModules)) {
    failInput('request.arrays');
  }
  if (raw.taskModules.some((m) => typeof m === 'string' && (FORBIDDEN_PROVIDER_TASK_MODULES as readonly string[]).includes(m))) {
    failInput('request.taskModules.final-relevance');
  }
  const request: VisualSemanticAnalysisRequest = {
    requestId: asString(raw.requestId, 'requestId'),
    assetId: asString(raw.assetId, 'assetId'),
    mediaKind: asEnum(raw.mediaKind, PROVIDER_MEDIA_KINDS, 'mediaKind'),
    analysisMode: asEnum(raw.analysisMode, PROVIDER_ANALYSIS_MODES, 'analysisMode'),
    frames: raw.frames.map((f, i) => parseFrame(f, `frames[${i}]`)),
    taskModules: raw.taskModules.map((m, i) => asEnum(m, PROVIDER_TASK_MODULES, `taskModules[${i}]`)),
    schemaVersion: asEnum(raw.schemaVersion, ['visual.semantic.provider-request:v1'] as const, 'schemaVersion'),
    promptVersion: asEnum(raw.promptVersion, ['visual.semantic.base:v1'] as const, 'promptVersion'),
  };
  if (raw.contentHash !== undefined) {
    request.contentHash = asString(raw.contentHash, 'contentHash');
  }
  if (raw.timeoutMs !== undefined) {
    request.timeoutMs = asFiniteNumber(raw.timeoutMs, 'timeoutMs');
    if (request.timeoutMs <= 0) {
      failInput('timeoutMs');
    }
  }
  if (raw.durationMs !== undefined) {
    request.durationMs = asFiniteNumber(raw.durationMs, 'durationMs');
    if (request.durationMs < 0) {
      failInput('durationMs');
    }
  }
  if (raw.projectContext !== undefined) {
    if (!isPlainObject(raw.projectContext)) {
      failInput('projectContext');
    }
    assertAllowedKeys(raw.projectContext, ['projectId'], 'projectContext');
    request.projectContext = raw.projectContext.projectId === undefined ? {} : { projectId: asString(raw.projectContext.projectId, 'projectContext.projectId') };
  }
  if (raw.platformContext !== undefined) {
    if (!isPlainObject(raw.platformContext)) {
      failInput('platformContext');
    }
    assertAllowedKeys(raw.platformContext, ['platformId'], 'platformContext');
    request.platformContext =
      raw.platformContext.platformId === undefined ? {} : { platformId: asString(raw.platformContext.platformId, 'platformContext.platformId') };
  }
  return request;
}

function parseObservation(value: unknown, durationMs: number | undefined, label: string): ProviderSemanticObservation {
  if (!isPlainObject(value)) {
    failSchema(label);
  }
  assertAllowedKeys(
    value,
    ['observationId', 'type', 'confidence', 'source', 'evidence', 'uncertainty', 'region', 'startMs', 'endMs', 'observationState'],
    label,
  );
  if (!isPlainObject(value.uncertainty)) {
    failSchema(`${label}.uncertainty`);
  }
  assertAllowedKeys(value.uncertainty, ['level', 'reasons'], `${label}.uncertainty`);
  if (!Array.isArray(value.uncertainty.reasons)) {
    failSchema(`${label}.uncertainty.reasons`);
  }
  const temporal = parseTemporal(value.startMs, value.endMs, durationMs, label);
  const observation: ProviderSemanticObservation = {
    observationId: asString(value.observationId, `${label}.observationId`),
    type: asEnum(value.type, VISUAL_SEMANTIC_OBSERVATION_TYPES, `${label}.type`),
    confidence: parseConfidence(value.confidence, `${label}.confidence`),
    source: asEnum(value.source, PROVIDER_OBSERVATION_SOURCES, `${label}.source`),
    evidence: parseEvidence(value.evidence, `${label}.evidence`),
    uncertainty: {
      level: asEnum(value.uncertainty.level, UNCERTAINTY_LEVELS, `${label}.uncertainty.level`),
      reasons: value.uncertainty.reasons.map((r, i) => asString(r, `${label}.uncertainty.reasons[${i}]`)),
    },
    ...temporal,
  };
  if (value.region !== undefined) {
    observation.region = parseRect(value.region, `${label}.region`);
  }
  if (value.observationState !== undefined) {
    observation.observationState = asEnum(value.observationState, OBSERVATION_STATES, `${label}.observationState`);
  }
  return observation;
}

export function parseVisualSemanticProviderResult(raw: unknown, durationMs?: number): VisualSemanticProviderResult {
  try {
    return parseVisualSemanticProviderResultInner(raw, durationMs);
  } catch (error) {
    if (error instanceof VisualSemanticProviderError) {
      throw error;
    }
    throw new VisualSemanticProviderError('SCHEMA_VALIDATION_FAILED');
  }
}

function parseVisualSemanticProviderResultInner(raw: unknown, durationMs?: number): VisualSemanticProviderResult {
  try {
    assertNoForbiddenKeys(raw);
  } catch {
    failSchema('forbidden-keys');
  }
  if (!isPlainObject(raw)) {
    failSchema('result');
  }
  assertAllowedKeys(
    raw,
    [
      'providerId',
      'providerFamily',
      'requestId',
      'status',
      'observations',
      'semanticRegions',
      'uiFocusCandidates',
      'subjectCandidates',
      'browserChromeObservations',
      'developerArtifactObservations',
      'authenticityObservations',
      'watermarkObservations',
      'privacyObservations',
      'textEvidence',
      'moduleResults',
      'warnings',
      'usage',
      'rawMetadata',
      'schemaVersion',
    ],
    'result',
  );
  if (!Array.isArray(raw.observations) || !Array.isArray(raw.semanticRegions) || !Array.isArray(raw.warnings)) {
    failSchema('result.arrays');
  }
  const result: VisualSemanticProviderResult = {
    providerId: asString(raw.providerId, 'providerId'),
    providerFamily: asEnum(raw.providerFamily, PROVIDER_FAMILIES, 'providerFamily'),
    requestId: asString(raw.requestId, 'requestId'),
    status: asEnum(raw.status, PROVIDER_RESULT_STATUSES, 'status'),
    observations: raw.observations.map((o, i) => parseObservation(o, durationMs, `observations[${i}]`)),
    semanticRegions: raw.semanticRegions.map((r, i) => {
      if (!isPlainObject(r)) {
        failSchema(`semanticRegions[${i}]`);
      }
      assertAllowedKeys(r, ['regionId', 'type', 'rect', 'confidence', 'temporalRange', 'attributes', 'source'], `semanticRegions[${i}]`);
      const region: VisualSemanticProviderResult['semanticRegions'][number] = {
        regionId: asString(r.regionId, `semanticRegions[${i}].regionId`),
        type: asEnum(r.type, VISUAL_SEMANTIC_OBSERVATION_TYPES, `semanticRegions[${i}].type`),
        rect: parseRect(r.rect, `semanticRegions[${i}].rect`),
        confidence: parseConfidence(r.confidence, `semanticRegions[${i}].confidence`),
        attributes: {},
        source: asEnum(r.source, PROVIDER_OBSERVATION_SOURCES, `semanticRegions[${i}].source`),
      };
      if (r.attributes !== undefined) {
        if (!isPlainObject(r.attributes)) {
          failSchema(`semanticRegions[${i}].attributes`);
        }
        assertAllowedKeys(r.attributes, ['state'], `semanticRegions[${i}].attributes`);
        const attrs: Record<string, string | number | boolean | undefined> = {};
        if (r.attributes.state !== undefined) {
          attrs.state = asEnum(r.attributes.state, OBSERVATION_STATES, `semanticRegions[${i}].attributes.state`);
        }
        region.attributes = attrs;
      }
      if (r.temporalRange !== undefined) {
        if (!isPlainObject(r.temporalRange)) {
          failSchema(`semanticRegions[${i}].temporalRange`);
        }
        const t = parseTemporal(r.temporalRange.startMs, r.temporalRange.endMs, durationMs, `semanticRegions[${i}].temporalRange`);
        if (t.startMs === undefined || t.endMs === undefined) {
          failSchema(`semanticRegions[${i}].temporalRange`);
        }
        region.temporalRange = { startMs: t.startMs, endMs: t.endMs };
      }
      return region;
    }),
    warnings: raw.warnings.map((w, i) => asString(w, `warnings[${i}]`)),
    schemaVersion: asEnum(raw.schemaVersion, ['visual.semantic.provider-result:v1'] as const, 'schemaVersion'),
  };

  if (raw.uiFocusCandidates !== undefined) {
    if (!Array.isArray(raw.uiFocusCandidates)) {
      failSchema('uiFocusCandidates');
    }
    result.uiFocusCandidates = raw.uiFocusCandidates.map((c, i) => {
      if (!isPlainObject(c)) {
        failSchema(`uiFocusCandidates[${i}]`);
      }
      assertAllowedKeys(c, ['region', 'confidence', 'role', 'importanceSignals'], `uiFocusCandidates[${i}]`);
      if (!Array.isArray(c.importanceSignals)) {
        failSchema(`uiFocusCandidates[${i}].importanceSignals`);
      }
      return {
        region: parseRect(c.region, `uiFocusCandidates[${i}].region`),
        confidence: parseConfidence(c.confidence, `uiFocusCandidates[${i}].confidence`),
        role: asEnum(c.role, UI_FOCUS_ROLES, `uiFocusCandidates[${i}].role`),
        importanceSignals: c.importanceSignals.map((s, j) => asString(s, `uiFocusCandidates[${i}].importanceSignals[${j}]`)),
      };
    });
  }

  if (raw.subjectCandidates !== undefined) {
    if (!Array.isArray(raw.subjectCandidates)) {
      failSchema('subjectCandidates');
    }
    result.subjectCandidates = raw.subjectCandidates.map((c, i) => {
      if (!isPlainObject(c)) {
        failSchema(`subjectCandidates[${i}]`);
      }
      assertAllowedKeys(c, ['type', 'region', 'confidence', 'prominence'], `subjectCandidates[${i}]`);
      return {
        type: asEnum(c.type, SUBJECT_TYPES, `subjectCandidates[${i}].type`),
        region: parseRect(c.region, `subjectCandidates[${i}].region`),
        confidence: parseConfidence(c.confidence, `subjectCandidates[${i}].confidence`),
        prominence: parseConfidence(c.prominence, `subjectCandidates[${i}].prominence`),
      };
    });
  }

  if (raw.browserChromeObservations !== undefined) {
    if (!Array.isArray(raw.browserChromeObservations)) {
      failSchema('browserChromeObservations');
    }
    result.browserChromeObservations = raw.browserChromeObservations.map((c, i) => {
      if (!isPlainObject(c)) {
        failSchema(`browserChromeObservations[${i}]`);
      }
      assertAllowedKeys(c, ['region', 'confidence', 'signals', 'evidenceFrameIds'], `browserChromeObservations[${i}]`);
      if (!Array.isArray(c.signals) || !Array.isArray(c.evidenceFrameIds)) {
        failSchema(`browserChromeObservations[${i}].arrays`);
      }
      return {
        region: parseRect(c.region, `browserChromeObservations[${i}].region`),
        confidence: parseConfidence(c.confidence, `browserChromeObservations[${i}].confidence`),
        signals: c.signals.map((s, j) => asEnum(s, BROWSER_CHROME_SIGNALS, `browserChromeObservations[${i}].signals[${j}]`)),
        evidenceFrameIds: c.evidenceFrameIds.map((id, j) => asString(id, `browserChromeObservations[${i}].evidenceFrameIds[${j}]`)),
      };
    });
  }

  if (raw.developerArtifactObservations !== undefined) {
    if (!Array.isArray(raw.developerArtifactObservations)) {
      failSchema('developerArtifactObservations');
    }
    result.developerArtifactObservations = raw.developerArtifactObservations.map((c, i) => {
      if (!isPlainObject(c)) {
        failSchema(`developerArtifactObservations[${i}]`);
      }
      assertAllowedKeys(c, ['type', 'region', 'confidence', 'evidence'], `developerArtifactObservations[${i}]`);
      const item: NonNullable<VisualSemanticProviderResult['developerArtifactObservations']>[number] = {
        type: asEnum(c.type, PROVIDER_DEVELOPER_ARTIFACT_TYPES, `developerArtifactObservations[${i}].type`),
        confidence: parseConfidence(c.confidence, `developerArtifactObservations[${i}].confidence`),
        evidence: parseEvidence(c.evidence, `developerArtifactObservations[${i}].evidence`),
      };
      if (c.region !== undefined) {
        item.region = parseRect(c.region, `developerArtifactObservations[${i}].region`);
      }
      return item;
    });
  }

  if (raw.authenticityObservations !== undefined) {
    if (!Array.isArray(raw.authenticityObservations)) {
      failSchema('authenticityObservations');
    }
    result.authenticityObservations = raw.authenticityObservations.map((c, i) => {
      if (!isPlainObject(c)) {
        failSchema(`authenticityObservations[${i}]`);
      }
      assertAllowedKeys(c, ['type', 'confidence', 'evidence'], `authenticityObservations[${i}]`);
      return {
        type: asEnum(c.type, PROVIDER_AUTHENTICITY_TYPES, `authenticityObservations[${i}].type`),
        confidence: parseConfidence(c.confidence, `authenticityObservations[${i}].confidence`),
        evidence: parseEvidence(c.evidence, `authenticityObservations[${i}].evidence`),
      };
    });
  }

  if (raw.watermarkObservations !== undefined) {
    if (!Array.isArray(raw.watermarkObservations)) {
      failSchema('watermarkObservations');
    }
    result.watermarkObservations = raw.watermarkObservations.map((c, i) => {
      if (!isPlainObject(c)) {
        failSchema(`watermarkObservations[${i}]`);
      }
      assertAllowedKeys(c, ['type', 'region', 'confidence', 'text', 'brand'], `watermarkObservations[${i}]`);
      const item: NonNullable<VisualSemanticProviderResult['watermarkObservations']>[number] = {
        type: asEnum(c.type, WATERMARK_TYPES, `watermarkObservations[${i}].type`),
        region: parseRect(c.region, `watermarkObservations[${i}].region`),
        confidence: parseConfidence(c.confidence, `watermarkObservations[${i}].confidence`),
      };
      if (c.text !== undefined) {
        item.text = asString(c.text, `watermarkObservations[${i}].text`);
      }
      if (c.brand !== undefined) {
        item.brand = asString(c.brand, `watermarkObservations[${i}].brand`);
      }
      return item;
    });
  }

  if (raw.privacyObservations !== undefined) {
    if (!Array.isArray(raw.privacyObservations)) {
      failSchema('privacyObservations');
    }
    result.privacyObservations = raw.privacyObservations.map((c, i) => {
      if (!isPlainObject(c)) {
        failSchema(`privacyObservations[${i}]`);
      }
      assertAllowedKeys(c, ['category', 'region', 'confidence', 'severity'], `privacyObservations[${i}]`);
      return {
        category: asEnum(c.category, PRIVACY_CATEGORIES, `privacyObservations[${i}].category`),
        region: parseRect(c.region, `privacyObservations[${i}].region`),
        confidence: parseConfidence(c.confidence, `privacyObservations[${i}].confidence`),
        severity: asEnum(c.severity, PRIVACY_SEVERITIES, `privacyObservations[${i}].severity`),
      };
    });
  }

  if (raw.textEvidence !== undefined) {
    if (!Array.isArray(raw.textEvidence)) {
      failSchema('textEvidence');
    }
    result.textEvidence = raw.textEvidence.map((t, i) => parseTextFragment(t, `textEvidence[${i}]`));
  }

  if (raw.moduleResults !== undefined) {
    if (!Array.isArray(raw.moduleResults)) {
      failSchema('moduleResults');
    }
    result.moduleResults = raw.moduleResults.map((m, i) => {
      if (!isPlainObject(m)) {
        failSchema(`moduleResults[${i}]`);
      }
      assertAllowedKeys(m, ['module', 'status', 'warnings'], `moduleResults[${i}]`);
      if (!Array.isArray(m.warnings)) {
        failSchema(`moduleResults[${i}].warnings`);
      }
      return {
        module: asEnum(m.module, PROVIDER_TASK_MODULES, `moduleResults[${i}].module`),
        status: asEnum(m.status, MODULE_RESULT_STATUSES, `moduleResults[${i}].status`),
        warnings: m.warnings.map((w, j) => asString(w, `moduleResults[${i}].warnings[${j}]`)),
      };
    });
  }

  if (raw.usage !== undefined) {
    if (!isPlainObject(raw.usage)) {
      failSchema('usage');
    }
    assertAllowedKeys(raw.usage, ['latencyMs', 'inputUnits', 'outputUnits', 'cost'], 'usage');
    result.usage = {};
    if (raw.usage.latencyMs !== undefined) {
      result.usage.latencyMs = asFiniteNumber(raw.usage.latencyMs, 'usage.latencyMs');
    }
    if (raw.usage.inputUnits !== undefined) {
      result.usage.inputUnits = asFiniteNumber(raw.usage.inputUnits, 'usage.inputUnits');
    }
    if (raw.usage.outputUnits !== undefined) {
      result.usage.outputUnits = asFiniteNumber(raw.usage.outputUnits, 'usage.outputUnits');
    }
    if (raw.usage.cost !== undefined) {
      result.usage.cost = asFiniteNumber(raw.usage.cost, 'usage.cost');
    }
  }

  if (raw.rawMetadata !== undefined) {
    if (!isPlainObject(raw.rawMetadata)) {
      failSchema('rawMetadata');
    }
    assertAllowedKeys(raw.rawMetadata, ['fixtureId'], 'rawMetadata');
    result.rawMetadata = raw.rawMetadata.fixtureId === undefined ? {} : { fixtureId: asString(raw.rawMetadata.fixtureId, 'rawMetadata.fixtureId') };
  }

  return result;
}

export function parseProviderRawPayload(raw: unknown, durationMs?: number): VisualSemanticProviderResult {
  return parseVisualSemanticProviderResult(raw, durationMs);
}
