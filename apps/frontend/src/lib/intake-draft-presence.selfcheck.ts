import assert from "node:assert/strict";
import {
  getIntakeDraftPresence,
  hasMarketIntakeDraft,
  hasProductIntakeDraft,
} from "./intake-draft-presence";
import {
  clearMarketIntakeSession,
  createFreshGuidedMarketSession,
  saveMarketIntakeSession,
} from "./market-intake";
import {
  clearProductIntakeSession,
  createFreshGuidedSession,
  saveProductIntakeSession,
} from "./product-intake";

const store = new Map<string, string>();
const memory = {
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string) {
    store.set(key, String(value));
  },
  removeItem(key: string) {
    store.delete(key);
  },
};
(globalThis as { window?: { sessionStorage: typeof memory } }).window = {
  sessionStorage: memory,
};

function run() {
  store.clear();
  const projectA = "proj-a";
  const projectB = "proj-b";

  assert.equal(hasProductIntakeDraft(projectA), false);
  assert.equal(hasMarketIntakeDraft(projectA), false);

  saveProductIntakeSession(projectA, createFreshGuidedSession({ productName: "美拍助手" }));
  assert.equal(hasProductIntakeDraft(projectA), true);
  assert.equal(hasProductIntakeDraft(projectB), false);
  assert.equal(getIntakeDraftPresence(projectA).productWorkInProgress, true);
  assert.equal(getIntakeDraftPresence(projectB).productWorkInProgress, false);

  saveMarketIntakeSession(projectA, createFreshGuidedMarketSession());
  assert.equal(hasMarketIntakeDraft(projectA), true);
  assert.equal(hasMarketIntakeDraft(projectB), false);

  clearProductIntakeSession(projectA);
  clearMarketIntakeSession(projectA);
  assert.equal(hasProductIntakeDraft(projectA), false);
  assert.equal(hasMarketIntakeDraft(projectA), false);

  // Server-safe empty when no window
  const win = (globalThis as { window?: unknown }).window;
  delete (globalThis as { window?: unknown }).window;
  assert.deepEqual(getIntakeDraftPresence(projectA), {
    productWorkInProgress: false,
    marketWorkInProgress: false,
    productImproveActive: false,
    marketImproveActive: false,
  });
  (globalThis as { window?: unknown }).window = win;

  console.log("intake-draft-presence selfcheck PASS");
}

run();
