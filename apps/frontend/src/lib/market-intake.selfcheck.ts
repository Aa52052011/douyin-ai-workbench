import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKET_INTAKE_OPENING_MESSAGE,
  acknowledgeLimitedData,
  adoptProductSeedKeywords,
  clearMarketIntakeSession,
  createFreshGuidedMarketSession,
  emptyMarketIntakeDraft,
  getMarketIntakeReadiness,
  loadMarketIntakeSession,
  mapMarketIntakeDraftToManualPreview,
  marketIntakeSessionKey,
  patchMarketIntakeDraft,
  resolveMarketIntakeState,
  saveMarketIntakeSession,
  sanitizeMarketIntakeDraft,
} from "./market-intake";

const here = dirname(fileURLToPath(import.meta.url));
const frontendSrc = join(here, "..");

type MemoryStore = Map<string, string>;

function installMemorySessionStorage(store: MemoryStore) {
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
}

function run() {
  const empty = emptyMarketIntakeDraft();
  const emptyReady = getMarketIntakeReadiness(empty);
  assert.equal(emptyReady.readyForConfirmation, false);
  assert.equal(emptyReady.hasResearchMaterial, false);
  assert.ok(emptyReady.hint.includes("我暂时没有市场数据") || emptyReady.hint.includes("补充"));

  assert.equal(getMarketIntakeReadiness({ ...empty, keywords: ["美甲"] }).readyForConfirmation, true);
  assert.equal(
    getMarketIntakeReadiness({
      ...empty,
      competitorAccounts: [{ displayName: "竞品A" }],
    }).readyForConfirmation,
    true,
  );
  assert.equal(
    getMarketIntakeReadiness({
      ...empty,
      userObservations: ["本地店更看重到店咨询"],
    }).readyForConfirmation,
    true,
  );

  // Sequential append: AI patch with only new keyword must not drop old ones
  const mergedAppend = patchMarketIntakeDraft(
    { ...empty, keywords: ["美甲店获客", "美甲店短视频"] },
    { keywords: ["美甲店活动推广"] },
    {},
    "USER_PROVIDED",
  );
  assert.deepEqual(mergedAppend.draft.keywords.sort(), ["美甲店活动推广", "美甲店获客", "美甲店短视频"].sort());

  const ack = acknowledgeLimitedData(empty, {});
  assert.equal(ack.draft.userAcknowledgedLimitedData, true);
  assert.equal(getMarketIntakeReadiness(ack.draft).readyForConfirmation, true);
  assert.equal(getMarketIntakeReadiness(ack.draft).hasResearchMaterial, false);

  const mappedEmpty = mapMarketIntakeDraftToManualPreview(ack.draft, {
    productBriefId: "00000000-0000-4000-8000-000000000001",
    collectedAt: "2026-09-08T00:00:00.000Z",
  });
  assert.equal(mappedEmpty.items.length, 0);
  assert.equal(mappedEmpty.productBriefId, "00000000-0000-4000-8000-000000000001");

  const rich = sanitizeMarketIntakeDraft({
    keywords: [" 美甲获客 ", "美甲获客", ""],
    competitorAccounts: [{ displayName: "店A", profileUrl: "https://example.com/a", note: "本地" }],
    competitorVideos: [{ url: "https://www.douyin.com/video/1", label: "样例" }],
    publicLinks: [{ url: "https://example.com/doc" }],
    userObservations: ["观察1"],
    customerQuestions: ["怎么收费？"],
    commonPainPoints: ["没时间拍"],
    commonSellingPoints: ["自动剪辑"],
    marketHypotheses: ["短视频能带来到店"],
    userAcknowledgedLimitedData: false,
  });
  const mapped = mapMarketIntakeDraftToManualPreview(rich, { collectedAt: "2026-09-08T00:00:00.000Z" });
  assert.ok(mapped.items.some((item) => item.kind === "KEYWORD" && item.keyword === "美甲获客"));
  assert.ok(mapped.items.some((item) => item.kind === "COMPETITOR" && item.displayName === "店A"));
  assert.ok(mapped.items.some((item) => item.kind === "CONTENT" && item.externalUrl));
  assert.ok(mapped.items.some((item) => item.kind === "AUDIENCE_SIGNAL" && item.signalType === "observation"));
  assert.ok(mapped.items.some((item) => item.kind === "AUDIENCE_SIGNAL" && item.signalType === "pain"));
  assert.equal(
    JSON.stringify(mapped).includes("views") || JSON.stringify(mapped).includes("likes"),
    false,
  );
  assert.equal(JSON.stringify(mapped).includes("executiveSummary"), false);
  assert.equal(JSON.stringify(mapped).includes("MarketInsight"), false);

  const adopted = adoptProductSeedKeywords(empty, ["产品词"], {});
  assert.deepEqual(adopted.draft.keywords, ["产品词"]);
  assert.equal(adopted.provenance.keywords, "USER_CONFIRMED_AI_SUGGESTION");

  assert.equal(marketIntakeSessionKey("proj-a"), "acf:intake:proj-a:market");
  assert.notEqual(marketIntakeSessionKey("proj-a"), marketIntakeSessionKey("proj-b"));

  const store: MemoryStore = new Map();
  installMemorySessionStorage(store);
  const sessionA = createFreshGuidedMarketSession();
  sessionA.draft.keywords = ["A词"];
  saveMarketIntakeSession("proj-a", sessionA);
  const sessionB = createFreshGuidedMarketSession();
  sessionB.draft.keywords = ["B词"];
  saveMarketIntakeSession("proj-b", sessionB);
  assert.deepEqual(loadMarketIntakeSession("proj-a")?.draft.keywords, ["A词"]);
  assert.deepEqual(loadMarketIntakeSession("proj-b")?.draft.keywords, ["B词"]);
  assert.equal(loadMarketIntakeSession("proj-a")?.messages[0]?.content, MARKET_INTAKE_OPENING_MESSAGE);
  clearMarketIntakeSession("proj-a");
  assert.equal(loadMarketIntakeSession("proj-a"), null);
  assert.deepEqual(loadMarketIntakeSession("proj-b")?.draft.keywords, ["B词"]);

  assert.equal(
    resolveMarketIntakeState({ hasResearch: true, draft: empty, active: false }),
    "CONFIRMED",
  );
  assert.equal(
    resolveMarketIntakeState({ hasResearch: false, draft: empty, active: true }),
    "EMPTY",
  );
  assert.equal(
    resolveMarketIntakeState({ hasResearch: true, draft: empty, active: true }),
    "IN_PROGRESS",
  );
  assert.equal(
    resolveMarketIntakeState({ hasResearch: false, draft: ack.draft, active: true }),
    "READY_TO_CONFIRM",
  );
  assert.equal(
    resolveMarketIntakeState({
      hasResearch: false,
      draft: { ...empty, keywords: ["x"] },
      active: true,
    }),
    "READY_TO_CONFIRM",
  );
  assert.equal(
    resolveMarketIntakeState({
      hasResearch: false,
      draft: { ...empty, userObservations: ["观"] },
      active: false,
    }),
    "READY_TO_CONFIRM",
  );

  const page = readFileSync(join(frontendSrc, "app/dashboard/projects/[projectId]/market/research/page.tsx"), "utf8");
  const conversation = readFileSync(join(frontendSrc, "components/intake/market-intake-conversation.tsx"), "utf8");
  const draftPanel = readFileSync(join(frontendSrc, "components/intake/market-intake-draft-panel.tsx"), "utf8");
  const apiClient = readFileSync(join(frontendSrc, "lib/market-intake.api.ts"), "utf8");
  assert.match(page, /GuidedIntakeShell/);
  assert.match(page, /confirmManualMarketResearch/);
  assert.match(page, /previewManualMarketResearch/);
  assert.match(page, /我暂时没有市场数据|onAcknowledgeNoData/);
  assert.match(page, /导入已有市场数据/);
  assert.match(page, /不需要拥有竞品后台数据/);
  assert.match(page, /去完善产品信息/);
  assert.match(page, /开始市场分析/);
  assert.match(page, /MarketImportWizard/);
  assert.match(page, /和 AI 继续补充调研/);
  assert.match(page, /postMarketIntakeTurn/);
  assert.match(page, /applyMarketIntakeSuggestion|onAdoptSuggestion/);
  assert.match(apiClient, /intake\/market\/turn/);
  assert.match(apiClient, /market-research\/preview/);
  assert.match(apiClient, /market-research\/confirm/);
  assert.equal(page.includes("MODEL_API_KEY"), false);
  assert.match(page, /这次没有整理成功/);
  assert.equal(page.includes("createLocalPlaceholderReply"), false);
  assert.match(conversation, /导入已有市场数据（可选）/);
  assert.match(draftPanel, /确认并开始市场分析/);
  assert.match(draftPanel, /尚未自动抓取/);

  console.log("market-intake selfcheck PASS");
}

run();
