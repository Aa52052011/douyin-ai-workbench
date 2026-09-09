import type { MarketIntakeDraft } from './market-intake.types.js';
import { getMarketIntakeReadinessFromDraft } from './market-intake.patch.js';

export const MARKET_MATERIAL_FIELDS = [
  'keywords',
  'competitorAccounts',
  'competitorVideos',
  'publicLinks',
  'userObservations',
  'customerQuestions',
  'commonPainPoints',
  'commonSellingPoints',
  'marketHypotheses',
] as const;

export type MarketIntakeQuestionPlan = {
  hasMarketMaterial: boolean;
  userAcknowledgedLimitedData: boolean;
  readyForConfirmation: boolean;
  nextPriorityFields: string[];
  alreadyFilledFields: string[];
  allowLowDataContinue: boolean;
};

export function getMarketIntakeQuestionPlan(
  draft: MarketIntakeDraft,
  options?: { userAcknowledgedLimitedData?: boolean },
): MarketIntakeQuestionPlan {
  const acknowledged = Boolean(options?.userAcknowledgedLimitedData);
  const readiness = getMarketIntakeReadinessFromDraft(draft, {
    userAcknowledgedLimitedData: acknowledged,
  });
  const alreadyFilledFields = MARKET_MATERIAL_FIELDS.filter((key) => {
    const value = draft[key];
    return Array.isArray(value) && value.length > 0;
  });
  const nextPriorityFields = readiness.readyForConfirmation
    ? []
    : MARKET_MATERIAL_FIELDS.filter((key) => !alreadyFilledFields.includes(key)).slice(0, 2);

  return {
    hasMarketMaterial: readiness.itemCount > 0,
    userAcknowledgedLimitedData: acknowledged,
    readyForConfirmation: readiness.readyForConfirmation,
    nextPriorityFields,
    alreadyFilledFields: [...alreadyFilledFields],
    allowLowDataContinue: true,
  };
}

export function compactMarketIntakeDraft(draft: MarketIntakeDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of MARKET_MATERIAL_FIELDS) {
    const value = draft[key];
    if (Array.isArray(value) && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}
