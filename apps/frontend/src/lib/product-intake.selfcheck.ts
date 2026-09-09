import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCT_BRIEF_FIELD_LABELS,
  PRODUCT_BRIEF_REQUIRED_FIELDS,
} from "./product-brief.types";
import {
  PRODUCT_INTAKE_OPENING_MESSAGE,
  applyProductIntakeSuggestion,
  clearProductIntakeSession,
  createFreshGuidedSession,
  draftFromProductBriefPayload,
  draftHasContent,
  emptyProductIntakeDraft,
  formatMissingFieldsHint,
  getProductIntakeReadiness,
  loadProductIntakeSession,
  mapProductIntakeDraftToCreateDto,
  patchProductIntakeDraft,
  productIntakeSessionKey,
  resolveProductIntakeState,
  saveProductIntakeSession,
} from "./product-intake";

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
  const emptyReady = getProductIntakeReadiness(emptyProductIntakeDraft());
  assert.equal(emptyReady.readyForConfirmation, false);
  assert.ok(emptyReady.missingFields.includes("productName"));
  assert.ok(emptyReady.missingFields.includes("industry"));
  assert.ok(emptyReady.missingFields.includes("businessGoal"));
  assert.ok(emptyReady.missingFields.includes("targetAudience"));
  assert.ok(emptyReady.missingFields.includes("description"));
  assert.equal(formatMissingFieldsHint(emptyReady.missingLabels).includes("targetAudience"), false);
  assert.ok(formatMissingFieldsHint(emptyReady.missingLabels).includes("目标用户"));

  assert.equal(
    getProductIntakeReadiness({
      productName: "A",
      industry: "B",
      businessGoal: "C",
      targetAudience: "D",
    }).readyForConfirmation,
    false,
  );

  assert.equal(
    getProductIntakeReadiness({
      productName: "A",
      industry: "B",
      businessGoal: "C",
      targetAudience: "D",
      description: "简介",
    }).readyForConfirmation,
    true,
  );

  assert.equal(
    getProductIntakeReadiness({
      productName: "A",
      industry: "B",
      businessGoal: "C",
      targetAudience: "D",
      sellingPoints: ["卖点"],
    }).readyForConfirmation,
    true,
  );

  assert.equal(
    getProductIntakeReadiness({
      productName: "A",
      industry: "B",
      businessGoal: "C",
      targetAudience: "D",
      seedKeywords: ["词"],
    }).readyForConfirmation,
    false,
  );

  assert.equal(resolveProductIntakeState({ hasCurrentBrief: false, draft: {}, active: false }), "EMPTY");
  assert.equal(
    resolveProductIntakeState({
      hasCurrentBrief: false,
      draft: { productName: "只填了名称" },
      active: true,
    }),
    "IN_PROGRESS",
  );
  assert.equal(
    resolveProductIntakeState({
      hasCurrentBrief: false,
      draft: {
        productName: "A",
        industry: "B",
        businessGoal: "C",
        targetAudience: "D",
        description: "E",
      },
      active: true,
    }),
    "READY_TO_CONFIRM",
  );
  assert.equal(resolveProductIntakeState({ hasCurrentBrief: true, draft: {}, active: false }), "CONFIRMED");
  assert.equal(
    resolveProductIntakeState({
      hasCurrentBrief: true,
      draft: { productName: "A" },
      active: true,
    }),
    "IN_PROGRESS",
  );

  assert.equal(draftHasContent({}), false);
  assert.equal(draftHasContent({ productName: "  " }), false);
  assert.equal(draftHasContent({ productName: "x" }), true);

  const mapped = mapProductIntakeDraftToCreateDto({
    productName: " 神经酰胺精华 ",
    industry: "美妆",
    businessGoal: "认知",
    targetAudience: "敏感肌",
    description: "修护精华",
    sellingPoints: ["温和"],
    painPoints: ["干燥泛红"],
    differentiation: "医研配方",
    usageScenario: "早晚护肤",
    seedKeywords: ["屏障修护"],
  });
  assert.equal(mapped.productName, "神经酰胺精华");
  assert.ok(mapped.description?.includes("使用场景：早晚护肤"));
  assert.ok(mapped.description?.includes("用户痛点：干燥泛红"));
  assert.deepEqual(mapped.sellingPoints, ["温和", "医研配方"]);
  assert.deepEqual(mapped.seedKeywords, ["屏障修护"]);
  assert.equal("painPoints" in mapped, false);
  assert.equal("differentiation" in mapped, false);
  assert.equal("usageScenario" in mapped, false);
  assert.equal("messages" in mapped, false);
  assert.equal("provenance" in mapped, false);
  assert.deepEqual(
    Object.keys(mapped).sort(),
    ["businessGoal", "description", "industry", "productName", "seedKeywords", "sellingPoints", "targetAudience"].sort(),
  );

  const fromBrief = draftFromProductBriefPayload({
    productName: "P",
    industry: "I",
    businessGoal: "G",
    targetAudience: "T",
    description: "D",
  });
  assert.equal(fromBrief.productName, "P");
  assert.equal(fromBrief.painPoints, undefined);

  assert.equal(productIntakeSessionKey("proj-a"), "acf:intake:proj-a:product");
  assert.notEqual(productIntakeSessionKey("proj-a"), productIntakeSessionKey("proj-b"));

  const store: MemoryStore = new Map();
  installMemorySessionStorage(store);
  saveProductIntakeSession("proj-a", createFreshGuidedSession({ productName: "项目A产品" }));
  saveProductIntakeSession("proj-b", createFreshGuidedSession({ productName: "项目B产品" }));
  const loadedA = loadProductIntakeSession("proj-a");
  const loadedB = loadProductIntakeSession("proj-b");
  assert.equal(loadedA?.draft.productName, "项目A产品");
  assert.equal(loadedB?.draft.productName, "项目B产品");
  assert.equal(loadedA?.messages[0]?.localKind, "LOCAL_GUIDED_PROMPT");
  assert.equal(loadedA?.messages[0]?.content, PRODUCT_INTAKE_OPENING_MESSAGE);

  clearProductIntakeSession("proj-a");
  assert.equal(loadProductIntakeSession("proj-a"), null);
  assert.equal(loadProductIntakeSession("proj-b")?.draft.productName, "项目B产品");

  assert.deepEqual([...PRODUCT_BRIEF_REQUIRED_FIELDS], ["productName", "industry", "businessGoal"]);
  assert.equal(PRODUCT_BRIEF_FIELD_LABELS.productName, "产品名称");
  assert.equal(JSON.stringify(PRODUCT_BRIEF_FIELD_LABELS).includes("ProductBrief"), false);

  const page = readFileSync(join(frontendSrc, "app/dashboard/projects/[projectId]/product/page.tsx"), "utf8");
  const shell = readFileSync(join(frontendSrc, "components/intake/guided-intake-shell.tsx"), "utf8");
  const draftPanel = readFileSync(join(frontendSrc, "components/intake/product-intake-draft-panel.tsx"), "utf8");
  const conversation = readFileSync(join(frontendSrc, "components/intake/intake-conversation.tsx"), "utf8");
  const bubble = readFileSync(join(frontendSrc, "components/intake/intake-message-bubble.tsx"), "utf8");
  const apiClient = readFileSync(join(frontendSrc, "lib/product-intake.api.ts"), "utf8");
  assert.match(page, /GuidedIntakeShell/);
  assert.match(page, /confirmGuided/);
  assert.match(page, /和 AI 继续完善/);
  assert.match(page, /createProductBrief/);
  assert.match(page, /clearProductIntakeSession/);
  assert.match(page, /postProductIntakeTurn/);
  assert.match(page, /USER_CONFIRMED_AI_SUGGESTION|applyProductIntakeSuggestion/);
  assert.match(page, /turnPending/);
  assert.match(page, /这次没有整理成功/);
  assert.equal(page.includes("MODEL_API_KEY"), false);
  assert.equal(page.includes("createLocalPlaceholderReply"), false);
  assert.match(apiClient, /intake\/product\/turn/);
  assert.match(conversation, /onAdoptSuggestion/);
  assert.match(conversation, /重试/);
  assert.match(bubble, /采用/);
  assert.match(bubble, /忽略/);
  assert.match(shell, /lg:grid-cols/);
  assert.match(shell, /min-w-0/);
  assert.match(draftPanel, /formatMissingFieldsHint/);
  assert.match(draftPanel, /确认产品信息/);
  assert.match(draftPanel, /missingHint|完整度|和 AI 补充/);
  assert.equal(draftPanel.includes("missingFields=["), false);
  assert.ok(formatMissingFieldsHint(["目标用户", "业务目标"]).includes("和 AI 补充"));
  assert.ok(formatMissingFieldsHint(["业务目标"]).includes("业务目标"));

  const adopted = applyProductIntakeSuggestion({}, {}, {
    field: "seedKeywords",
    value: ["短视频获客"],
  });
  assert.deepEqual(adopted.draft.seedKeywords, ["短视频获客"]);
  assert.equal(adopted.provenance.seedKeywords, "USER_CONFIRMED_AI_SUGGESTION");

  const manual = patchProductIntakeDraft({}, { industry: "美业" }, {});
  assert.equal(manual.provenance.industry, "USER_PROVIDED");

  console.log("product-intake selfcheck PASS");
}

run();
