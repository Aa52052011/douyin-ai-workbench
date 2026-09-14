import {
  containOccupancy,
  coverRetainedAreaRatio,
  RULE_CENTER_COVER_EVIDENCE_LOSS,
  RULE_CONTAIN_READABILITY,
} from './crop-geometry-facts.js';
import { geometryRef } from './hybrid-provenance.js';
import type { CropRiskSignal, GeometryProfile } from './hybrid.types.js';

export function buildCropRisks(profile: GeometryProfile): CropRiskSignal[] {
  const retained = coverRetainedAreaRatio(profile);
  const occupancy = containOccupancy(profile);
  const coverLevel = retained < 0.4 ? 'HIGH' : retained < 0.7 ? 'MEDIUM' : 'LOW';
  const containLevel = occupancy < 0.4 ? 'HIGH' : occupancy < 0.7 ? 'MEDIUM' : 'LOW';
  return [
    {
      code: 'LOW_RETAINED_AREA',
      level: coverLevel,
      appliesTo: 'CENTER/COVER',
      reasons: ['LOW_RETAINED_AREA_RISK', 'PRODUCT_IDENTITY_LOSS_RISK'],
      sourceRefs: [geometryRef('centerCoverRetainedAreaRatio', retained.toFixed(4))],
      ruleIds: [RULE_CENTER_COVER_EVIDENCE_LOSS],
    },
    {
      code: 'EVIDENCE_LOSS',
      level: coverLevel,
      appliesTo: 'CENTER/COVER',
      reasons: ['PRODUCT_IDENTITY_LOSS_RISK'],
      sourceRefs: [geometryRef('centerCoverRetainedAreaRatio', retained.toFixed(4))],
      ruleIds: [RULE_CENTER_COVER_EVIDENCE_LOSS],
    },
    {
      code: 'READABILITY_LOSS',
      level: containLevel,
      appliesTo: 'CONTAIN',
      reasons: ['TEXT_CUTOFF_RISK'],
      sourceRefs: [geometryRef('containOccupancy', occupancy.toFixed(4))],
      ruleIds: [RULE_CONTAIN_READABILITY],
    },
    {
      code: 'BROWSER_CHROME_INCLUDED',
      level: 'LOW',
      appliesTo: 'if-chrome-retained',
      reasons: ['BROWSER_CHROME_PRESENT'],
      sourceRefs: [geometryRef('presentation', 'browser-chrome-not-auto-cropped')],
      ruleIds: [RULE_CENTER_COVER_EVIDENCE_LOSS],
    },
  ];
}

export function riskLevel(risks: readonly CropRiskSignal[], appliesTo: string, code: CropRiskSignal['code']): CropRiskSignal['level'] | 'UNKNOWN' {
  return risks.find((item) => item.appliesTo === appliesTo && item.code === code)?.level ?? 'UNKNOWN';
}
