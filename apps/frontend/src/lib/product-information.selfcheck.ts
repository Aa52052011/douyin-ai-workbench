import assert from "node:assert/strict";
import {
  emptyProductBriefForm,
  formFromPayload,
  historyBriefs,
  humanizeProductBriefSaveError,
  isMissingCurrent,
  normalizeListItems,
  payloadFromForm,
  positioningHref,
  sortBriefsByVersionDesc,
  validateProductBriefForm,
} from "./product-brief.form";
import { PRODUCT_BRIEF_FIELD_LABELS, PRODUCT_BRIEF_REQUIRED_FIELDS } from "./product-brief.types";

function run() {
  assert.deepEqual([...PRODUCT_BRIEF_REQUIRED_FIELDS], ["productName", "industry", "businessGoal"]);
  assert.equal(PRODUCT_BRIEF_FIELD_LABELS.productName, "产品名称");
  assert.equal(PRODUCT_BRIEF_FIELD_LABELS.businessGoal, "推广目标");
  assert.equal(JSON.stringify(PRODUCT_BRIEF_FIELD_LABELS).includes("ProductBrief"), false);
  assert.equal(JSON.stringify(PRODUCT_BRIEF_FIELD_LABELS).includes("payload"), false);

  assert.equal(isMissingCurrent(null), true);
  assert.equal(isMissingCurrent(undefined), true);
  assert.equal(isMissingCurrent({ version: 1 }), false);

  const emptyErrors = validateProductBriefForm(emptyProductBriefForm());
  assert.equal(emptyErrors.productName, "请填写产品名称");
  assert.equal(emptyErrors.industry, "请填写行业");
  assert.equal(emptyErrors.businessGoal, "请填写推广目标");

  const valid = validateProductBriefForm({
    ...emptyProductBriefForm(),
    productName: "神经酰胺精华",
    industry: "美妆护肤",
    businessGoal: "提升品牌认知",
  });
  assert.deepEqual(valid, {});

  const tooLong = validateProductBriefForm({
    ...emptyProductBriefForm(),
    productName: "神经酰胺精华",
    industry: "美妆护肤",
    businessGoal: "提升品牌认知",
    brand: "x".repeat(81),
  });
  assert.equal(tooLong.brand, "品牌不能超过 80 个字");

  assert.deepEqual(normalizeListItems([" 温和修护 ", "", "温和修护", "敏感肌友好"], 12, 200), [
    "温和修护",
    "敏感肌友好",
  ]);
  assert.equal(normalizeListItems(["a", "b", "c"], 2, 200).length, 2);
  assert.deepEqual(normalizeListItems(["toolongitem"], 12, 3), []);

  const payload = payloadFromForm({
    ...emptyProductBriefForm(),
    productName: "  测试产品  ",
    industry: "教育",
    businessGoal: "获客",
    brand: "  ",
    sellingPoints: [" 卖点A ", "", "卖点B"],
    seedKeywords: [" 词A "],
  });
  assert.equal(payload.productName, "测试产品");
  assert.equal(payload.brand, undefined);
  assert.deepEqual(payload.sellingPoints, ["卖点A", "卖点B"]);
  assert.deepEqual(payload.seedKeywords, ["词A"]);
  assert.equal("category" in payload, false);

  const back = formFromPayload(payload);
  assert.equal(back.productName, "测试产品");
  assert.deepEqual(back.sellingPoints, ["卖点A", "卖点B"]);
  assert.equal(back.brand, "");

  const versions = sortBriefsByVersionDesc([
    { id: "a", version: 1 },
    { id: "c", version: 3 },
    { id: "b", version: 2 },
  ]);
  assert.deepEqual(
    versions.map((item) => item.version),
    [3, 2, 1],
  );
  assert.deepEqual(
    historyBriefs(versions, versions[0]).map((item) => item.version),
    [2, 1],
  );

  assert.equal(humanizeProductBriefSaveError(new Error("productName is required")), "请填写产品名称");
  assert.equal(humanizeProductBriefSaveError(new Error("stack overflow prisma")), "保存失败，请检查填写内容后重试。");
  assert.equal(positioningHref("proj-1"), "/dashboard/projects/proj-1/positioning");

  console.log("product-information selfcheck PASS");
}

run();
