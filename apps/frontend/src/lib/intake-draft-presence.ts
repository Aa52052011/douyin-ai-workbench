import {
  draftHasContent,
  loadProductIntakeSession,
} from "./product-intake";
import {
  draftHasResearchMaterial,
  loadMarketIntakeSession,
} from "./market-intake";

/**
 * Minimal client-side presence of Intake drafts in sessionStorage.
 * Does not load full message content into Overview callers beyond boolean flags.
 */
export type IntakeDraftPresence = {
  /** Session exists and is WIP (active or non-empty draft). */
  productWorkInProgress: boolean;
  marketWorkInProgress: boolean;
  /** Active refine/continue session (may coexist with confirmed formal objects). */
  productImproveActive: boolean;
  marketImproveActive: boolean;
};

export function hasProductIntakeDraft(projectId: string): boolean {
  return getIntakeDraftPresence(projectId).productWorkInProgress;
}

export function hasMarketIntakeDraft(projectId: string): boolean {
  return getIntakeDraftPresence(projectId).marketWorkInProgress;
}

export function getIntakeDraftPresence(projectId: string): IntakeDraftPresence {
  if (!projectId || typeof window === "undefined") {
    return {
      productWorkInProgress: false,
      marketWorkInProgress: false,
      productImproveActive: false,
      marketImproveActive: false,
    };
  }

  const product = loadProductIntakeSession(projectId);
  const market = loadMarketIntakeSession(projectId);

  const productWorkInProgress = Boolean(
    product && (product.active || draftHasContent(product.draft)),
  );
  const marketWorkInProgress = Boolean(
    market && (market.active || draftHasResearchMaterial(market.draft)),
  );

  return {
    productWorkInProgress,
    marketWorkInProgress,
    productImproveActive: Boolean(product?.active),
    marketImproveActive: Boolean(market?.active),
  };
}
