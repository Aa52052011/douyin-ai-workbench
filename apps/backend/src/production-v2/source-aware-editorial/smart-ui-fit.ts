import { SMART_UI_FIT_VERSION } from './constants.js';
import { CONTENT_01_CONTAINERS } from './containers.js';
import type { NormalizedRect } from '../visual/geometry/types.js';

export type SmartUiFitV1 = {
  schemaVersion: typeof SMART_UI_FIT_VERSION;
  crop: NormalizedRect;
  fitMode: 'CONTAIN';
  containerRef: string;
  occupancy: number;
  reducedMeaninglessMargin: boolean;
};

export function smartUiFit(page: NormalizedRect = CONTENT_01_CONTAINERS[0].rect): SmartUiFitV1 {
  const sourceAspect = 1920 / 1040;
  const targetAspect = 720 / 1280;
  const cropAspect = (page.width * 1920) / (page.height * 1040);
  const fitted = cropAspect > targetAspect ? targetAspect / cropAspect : cropAspect / targetAspect;
  const containOccupancy = sourceAspect > targetAspect ? targetAspect / sourceAspect : sourceAspect / targetAspect;
  return {
    schemaVersion: SMART_UI_FIT_VERSION,
    crop: page,
    fitMode: 'CONTAIN',
    containerRef: 'container:PAGE',
    occupancy: Math.max(fitted, containOccupancy * 0.9),
    reducedMeaninglessMargin: page.x > 0.04 || page.y > 0.04,
  };
}
