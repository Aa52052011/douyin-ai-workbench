import { assessAssetUsage } from '../../visual-context/asset-usage-assessor.js';
import { evaluateClaimMatrix } from '../../visual-context/claim-evidence-assessor.js';
import {
  content01CleanRecordingInput,
  content01OldContaminatedInput,
  content01OldHomeImageInput,
  content01ProductInfoImageInput,
  content01ProductionCenterImageInput,
  content01PublishOpsImageInput,
} from '../../visual-context/fixtures/content01-context.fixture.js';
import { evaluateProjectContext } from '../../visual-context/project-context-evaluator.js';
import { assembleHybridPackage } from '../hybrid-assembler.js';
import type { GeometryProfile, HybridAssemblyInput, SemanticObservationLite } from '../hybrid.types.js';
import type { ProjectContextEvaluationInput } from '../../visual-context/context.types.js';

export const CONTENT_01_GEOMETRY: GeometryProfile = {
  sourceWidth: 1920,
  sourceHeight: 1040,
  targetWidth: 1080,
  targetHeight: 1920,
};

export const CLEAN_RECORDING_OBSERVATIONS: SemanticObservationLite[] = [
  { type: 'BROWSER_CHROME', frameId: 'semantic-frame:0', confidence: 0.95, region: { x: 0, y: 0, width: 1, height: 0.106 } },
  { type: 'PRODUCT_UI', frameId: 'semantic-frame:0', confidence: 0.98, region: { x: 0.085, y: 0.106, width: 0.82, height: 0.894 } },
  { type: 'NAVIGATION', frameId: 'semantic-frame:0', confidence: 0.9, region: { x: 0.085, y: 0.106, width: 0.14, height: 0.72 } },
  { type: 'CONTENT_PANEL', frameId: 'semantic-frame:0', confidence: 0.9, region: { x: 0.24, y: 0.28, width: 0.66, height: 0.7 } },
  { type: 'TEXT_REGION', frameId: 'semantic-frame:0', confidence: 0.8, region: { x: 0.22, y: 0.12, width: 0.4, height: 0.06 } },
  { type: 'BROWSER_CHROME', frameId: 'semantic-frame:20015', confidence: 0.95, region: { x: 0, y: 0, width: 1, height: 0.106 } },
  { type: 'PRODUCT_UI', frameId: 'semantic-frame:20015', confidence: 0.98, region: { x: 0.085, y: 0.106, width: 0.82, height: 0.894 } },
  { type: 'NAVIGATION', frameId: 'semantic-frame:20015', confidence: 0.9, region: { x: 0.085, y: 0.106, width: 0.14, height: 0.72 } },
  { type: 'BROWSER_CHROME', frameId: 'semantic-frame:35027', confidence: 0.95, region: { x: 0, y: 0, width: 1, height: 0.106 } },
  { type: 'PRODUCT_UI', frameId: 'semantic-frame:35027', confidence: 0.98, region: { x: 0.085, y: 0.106, width: 0.82, height: 0.894 } },
];

export function assemblyInputFromContext(
  contextInput: ProjectContextEvaluationInput,
  observations: SemanticObservationLite[],
  geometry: GeometryProfile = CONTENT_01_GEOMETRY,
): HybridAssemblyInput {
  const evaluation = evaluateProjectContext(contextInput);
  const usage = assessAssetUsage(contextInput, evaluation);
  const claims = evaluateClaimMatrix(contextInput, evaluation);
  return { geometry, observations, contextEvaluation: evaluation, usageAssessment: usage, claims };
}

export function content01CleanHybridInput(): HybridAssemblyInput {
  return assemblyInputFromContext(content01CleanRecordingInput(), CLEAN_RECORDING_OBSERVATIONS);
}

export function content01OldHybridInput(): HybridAssemblyInput {
  return assemblyInputFromContext(content01OldContaminatedInput(), [
    { type: 'PRODUCT_UI', frameId: 'old-frame:0', confidence: 0.7 },
    { type: 'LOCALHOST_REFERENCE', frameId: 'old-frame:0', confidence: 0.8 },
    { type: 'BROWSER_CHROME', frameId: 'old-frame:0', confidence: 0.8 },
  ]);
}

export function content01PublishHybridInput(): HybridAssemblyInput {
  return assemblyInputFromContext(content01PublishOpsImageInput(), [
    { type: 'PRODUCT_UI', frameId: 'image:publish', confidence: 0.8 },
    { type: 'BUTTON_LIKE_REGION', frameId: 'image:publish', confidence: 0.7 },
    { type: 'TEXT_REGION', frameId: 'image:publish', confidence: 0.7, region: { x: 0.3, y: 0.4, width: 0.4, height: 0.1 } },
  ]);
}

export function content01ProductInfoHybridInput(): HybridAssemblyInput {
  return assemblyInputFromContext(content01ProductInfoImageInput(), [
    { type: 'PRODUCT_UI', frameId: 'image:info', confidence: 0.8 },
    { type: 'TEXT_REGION', frameId: 'image:info', confidence: 0.8, region: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 } },
  ]);
}

export function content01ProductionCenterHybridInput(): HybridAssemblyInput {
  return assemblyInputFromContext(content01ProductionCenterImageInput(), [
    { type: 'PRODUCT_UI', frameId: 'image:center', confidence: 0.7 },
    { type: 'CONTENT_PANEL', frameId: 'image:center', confidence: 0.7 },
  ]);
}

export function content01OldHomeHybridInput(): HybridAssemblyInput {
  return assemblyInputFromContext(content01OldHomeImageInput(), [{ type: 'PRODUCT_UI', frameId: 'image:home', confidence: 0.6 }]);
}

export function assembleContent01Clean() {
  return assembleHybridPackage(content01CleanHybridInput());
}
