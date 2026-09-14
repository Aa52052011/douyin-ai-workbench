import type { PlatformCanvasFixture } from './crop.types.js';

/**
 * Test/MVP canvas fixture copied from production.platform-profile:v1 geometry.
 * Not bound to a live platform enum or database row.
 */
export const VERTICAL_SHORT_CANVAS_V1: PlatformCanvasFixture = {
  profileId: 'VERTICAL_SHORT_CANVAS_V1',
  targetWidth: 1080,
  targetHeight: 1920,
  avoidRegions: [
    { regionType: 'TOP_RISK', rect: { x: 0, y: 0, width: 1, height: 0.08 } },
    { regionType: 'BOTTOM_CAPTION_RISK', rect: { x: 0, y: 0.88, width: 1, height: 0.12 } },
    { regionType: 'RIGHT_INTERACTION_RISK', rect: { x: 0.82, y: 0.42, width: 0.16, height: 0.4 } },
  ],
};
