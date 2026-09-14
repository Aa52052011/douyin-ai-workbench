import { VisualSemanticProviderError } from '../errors/visual-semantic-error.js';
import type { ProviderTaskModule, VisualSemanticProviderResult } from '../contracts/provider-runtime.types.js';
import type { VisualSemanticModelOutputV1 } from './model-output.types.js';

export type ModelOutputMappingContext = {
  requestId: string;
  providerId: string;
  allowedFrameIds: readonly string[];
  taskModules?: readonly string[];
};

export function mapModelOutputToProviderResult(
  model: VisualSemanticModelOutputV1,
  context: ModelOutputMappingContext,
): VisualSemanticProviderResult {
  const observations = model.observations.map((item, index) => {
    if (!context.allowedFrameIds.includes(item.frameId)) {
      throw new VisualSemanticProviderError('SCHEMA_VALIDATION_FAILED', `adapter:frameId:${item.frameId}`);
    }
    const textFragments = item.text
      ? [{ text: item.text, confidence: item.confidence, frameId: item.frameId, source: 'VISION_TEXT' as const }]
      : undefined;
    return {
      observationId: `pending:${index}`,
      type: item.type,
      confidence: item.confidence,
      source: 'VISION_PROVIDER' as const,
      evidence: {
        frameIds: [item.frameId],
        visualSignals: [...item.visualSignals],
        ...(textFragments ? { textFragments } : {}),
      },
      uncertainty: {
        level: item.uncertainty.level,
        reasons: [...item.uncertainty.reasons],
      },
      ...(item.region ? { region: item.region } : {}),
    };
  });

  const semanticRegions = model.observations.flatMap((item, index) => {
    if (!item.region) {
      return [];
    }
    return [
      {
        regionId: `pending-region:${index}`,
        type: item.type,
        rect: item.region,
        confidence: item.confidence,
        attributes: {},
        source: 'VISION_PROVIDER' as const,
      },
    ];
  });

  return {
    providerId: context.providerId,
    providerFamily: 'OPENAI_COMPATIBLE',
    requestId: context.requestId,
    status: observations.length > 0 ? 'READY' : 'PARTIAL',
    observations,
    semanticRegions,
    warnings: [],
    moduleResults: (context.taskModules ?? ['UI_STRUCTURE']).map((module) => ({
      module: module as ProviderTaskModule,
      status: observations.length > 0 ? ('READY' as const) : ('FAILED' as const),
      warnings: [],
    })),
    schemaVersion: 'visual.semantic.provider-result:v1',
  };
}
