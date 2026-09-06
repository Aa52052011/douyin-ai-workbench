import assert from "node:assert/strict";
import {
  confirmSemantics,
  createIdempotencyKey,
  fieldLabel,
  kindLabel,
  marketAnalysisHref,
  missingRequiredFields,
  nextIdempotencyKey,
  originLabel,
  pageHasEvidenceOrInsight,
  qualityLabel,
  selectionLabel,
  sortResearchNewestFirst,
  validateImportFile,
  warningLabel,
} from "./market-research.form";

function run() {
  assert.equal(kindLabel("CONTENT"), "作品数据");
  assert.equal(kindLabel("KEYWORD"), "关键词");
  assert.equal(kindLabel("COMPETITOR"), "竞品账号");
  assert.equal(kindLabel("TREND"), "趋势话题");
  assert.equal(kindLabel("AUDIENCE_SIGNAL"), "用户需求");
  assert.equal(fieldLabel("title"), "作品标题");

  assert.equal(validateImportFile(null), "请选择 CSV 或 XLSX 文件");
  const csv = { name: "a.csv", size: 100 } as File;
  const xlsx = { name: "a.xlsx", size: 100 } as File;
  const big = { name: "a.csv", size: 2 * 1024 * 1024 } as File;
  const json = { name: "a.json", size: 10 } as File;
  assert.equal(validateImportFile(csv), null);
  assert.equal(validateImportFile(xlsx), null);
  assert.equal(validateImportFile(big), "文件大小需 ≤ 1MB");
  assert.equal(validateImportFile(json), "仅支持 CSV / XLSX 文件");

  assert.equal(originLabel("THIRD_PARTY"), "第三方导出");
  assert.equal(originLabel("MANUAL_EXPORT"), "手工导出");
  assert.equal(originLabel("DOUYIN_VISIBLE_PAGE"), "抖音可见页面整理");
  assert.equal(originLabel("UNKNOWN"), "不确定");
  assert.equal(selectionLabel("MANUAL_CURATED"), "手工挑选");
  assert.equal(selectionLabel("SEARCH_RESULT_PAGE"), "搜索结果页");
  assert.equal(selectionLabel("COMPETITOR_ACCOUNT_RECENT_POSTS"), "竞品近期作品");
  assert.equal(selectionLabel("THIRD_PARTY_EXPORT"), "第三方导出");

  assert.deepEqual(missingRequiredFields("KEYWORD", {}), ["keyword"]);
  assert.deepEqual(missingRequiredFields("KEYWORD", { A: "keyword" }), []);
  assert.deepEqual(missingRequiredFields("CONTENT", {}), []);
  assert.deepEqual(missingRequiredFields("AUDIENCE_SIGNAL", { A: "topic" }), ["signalType"]);

  assert.equal(warningLabel("COLLECTED_AT_ASSUMED"), "未找到采集时间，系统将使用本次导入时间");
  assert.equal(warningLabel("WEAK_IDENTITY").includes("标识"), true);
  assert.equal(warningLabel("unknown selection method").includes("筛选"), true);
  assert.equal(qualityLabel("NONE"), "无有效数据");
  assert.equal(qualityLabel("LIMITED"), "样本有限");
  assert.equal(qualityLabel("USABLE"), "可用于分析");

  const sorted = sortResearchNewestFirst([
    { id: "a", version: 1, status: "READY", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "c", version: 3, status: "READY", createdAt: "2026-01-03T00:00:00.000Z" },
    { id: "b", version: 2, status: "READY", createdAt: "2026-01-02T00:00:00.000Z" },
  ]);
  assert.deepEqual(
    sorted.map((item) => item.version),
    [3, 2, 1],
  );

  const key = createIdempotencyKey();
  assert.match(key, /^[A-Za-z0-9._-]{8,128}$/);
  const semantics = confirmSemantics({
    kind: "CONTENT",
    fileName: "a.csv",
    fileSize: 10,
    mapping: { 标题: "title" },
    origin: "UNKNOWN",
    selectionMethod: "UNKNOWN",
    collectedAt: "",
  });
  const first = nextIdempotencyKey(null, semantics);
  const retry = nextIdempotencyKey(first, semantics);
  assert.equal(retry.key, first.key);
  const changed = nextIdempotencyKey(
    first,
    confirmSemantics({
      kind: "KEYWORD",
      fileName: "a.csv",
      fileSize: 10,
      mapping: { 关键词: "keyword" },
      origin: "UNKNOWN",
      selectionMethod: "UNKNOWN",
      collectedAt: "",
    }),
  );
  assert.notEqual(changed.key, first.key);
  assert.equal(marketAnalysisHref("proj-1"), "/dashboard/projects/proj-1/market/analysis");
  assert.equal(pageHasEvidenceOrInsight({ version: 1, snapshot: {} }), false);
  assert.equal(pageHasEvidenceOrInsight({ evidence: [] }), true);

  console.log("market-research selfcheck PASS");
}

run();
