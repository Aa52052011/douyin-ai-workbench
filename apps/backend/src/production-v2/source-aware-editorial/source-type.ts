import { CONTENT_01_NEW_ASSET_ID } from '../visual-semantic/runtime/b2-6-guards.js';
import { SOURCE_VISUAL_TYPE_VERSION, type SourceVisualTypeV1 } from './constants.js';

export function resolveSourceVisualType(input: { assetId: string; humanSourceHint?: 'SOFTWARE_OR_WEB_RECORDING' }): {
  schemaVersion: typeof SOURCE_VISUAL_TYPE_VERSION;
  sourceVisualType: SourceVisualTypeV1;
  basis: string[];
  visionCalls: 0;
} {
  const basis: string[] = [];
  if (input.assetId === CONTENT_01_NEW_ASSET_ID) {
    basis.push('FROZEN_CONTENT_01_PRODUCT_WORKBENCH_RECORDING');
  }
  if (input.humanSourceHint === 'SOFTWARE_OR_WEB_RECORDING') {
    basis.push('HUMAN_UAT_SOFTWARE_OR_WEB_SCREEN_RECORDING');
  }
  if (basis.length) {
    return {
      schemaVersion: SOURCE_VISUAL_TYPE_VERSION,
      sourceVisualType: 'SCREEN_RECORDING_UI_DEMO',
      basis,
      visionCalls: 0,
    };
  }
  return {
    schemaVersion: SOURCE_VISUAL_TYPE_VERSION,
    sourceVisualType: 'UNKNOWN',
    basis: ['NO_FROZEN_SOURCE_HINT'],
    visionCalls: 0,
  };
}
