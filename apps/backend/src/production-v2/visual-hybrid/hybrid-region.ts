import { visionRef } from './hybrid-provenance.js';
import type { HybridRegionFlags, HybridVisualRegion, SemanticObservationLite } from './hybrid.types.js';

const NOISE_TYPES = new Set(['BROWSER_CHROME', 'OS_CHROME', 'APP_WINDOW_CHROME']);

function flagsFor(type: string, chromeY: boolean): HybridRegionFlags {
  const flags: HybridRegionFlags = {};
  if (type === 'BROWSER_CHROME' || type === 'OS_CHROME' || type === 'LOCALHOST_REFERENCE') {
    flags.presentationNoise = true;
  }
  if (type === 'LOCALHOST_REFERENCE') {
    flags.developerContext = true;
  }
  if (type === 'PRODUCT_UI' || type === 'NAVIGATION' || type === 'CONTENT_PANEL') {
    flags.evidenceBearing = true;
  }
  if (type === 'TEXT_REGION' && !chromeY) {
    flags.evidenceBearing = true;
  }
  if (type === 'TEXT_REGION' && chromeY) {
    flags.presentationNoise = true;
  }
  if (type === 'PRIVACY_SENSITIVE') {
    flags.privacySensitive = true;
  }
  return flags;
}

export function buildHybridRegions(observations: readonly SemanticObservationLite[]): HybridVisualRegion[] {
  return observations.map((item, index) => {
    const chromeBand = Boolean(item.region && item.region.y + item.region.height <= 0.14 && item.region.y <= 0.02);
    const inChromeBand = item.type === 'TEXT_REGION' && (chromeBand || Boolean(item.region && item.region.y < 0.12));
    return {
      id: `region:${index}:${item.type}:${item.frameId}`,
      semanticType: item.type,
      rect: item.region,
      frameIds: [item.frameId],
      sourceRefs: [visionRef(item.type, item.frameId)],
      confidence: item.confidence,
      uncertainty: item.uncertaintyLevel,
      persistence: 'sampled',
      role: NOISE_TYPES.has(item.type) ? 'presentation-noise' : 'semantic-observation',
      flags: flagsFor(item.type, inChromeBand),
    };
  });
}
