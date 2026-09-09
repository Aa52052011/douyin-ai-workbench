import assert from "node:assert/strict";
import type { MarketEvidenceRecord, MarketInsightRecord } from "./market-analysis.types";
import {
  analysisConfidenceLabel,
  campaignStrategyHref,
  defaultSelectedResearchId,
  evidenceCatalog,
  evidenceHumanizationAvoidsPlatformClaims,
  evidenceKindLabel,
  evidenceSummaryView,
  historyItemViews,
  humanizeMarketAnalysisError,
  humanizeMarketEvidence,
  humanizeLimitationText,
  insightView,
  latestInsight,
  marketStateLabel,
  matchEvidenceRefs,
  noneGenerateNote,
  researchQualityWarning,
  researchSelectorOptions,
  selectedResearchBindings,
  viewModelHasCampaignFields,
  viewModelHasRawContract,
} from "./market-analysis.view";
import type { MarketResearchRecord } from "./market-research.types";

function research(partial: Partial<MarketResearchRecord> & { id: string; version: number }): MarketResearchRecord {
  return {
    status: "READY",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const researches = [
  research({
    id: "r3",
    version: 3,
    createdAt: "2026-03-01T00:00:00.000Z",
    queryContext: { kind: "CONTENT", itemCount: 12, source: "IMPORT" },
    snapshot: { dataQuality: { dataSufficiency: "LIMITED" } },
  }),
  research({
    id: "r1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    queryContext: { kind: "KEYWORD", itemCount: 4, source: "MANUAL" },
    snapshot: { dataQuality: { dataSufficiency: "NONE" } },
  }),
  research({
    id: "r2",
    version: 2,
    createdAt: "2026-02-01T00:00:00.000Z",
    queryContext: { kind: "COMPETITOR", itemCount: 6, source: "IMPORT" },
    snapshot: { dataQuality: { dataSufficiency: "USABLE" } },
  }),
];

const evidence: MarketEvidenceRecord = {
  dataSufficiency: "LIMITED",
  confidence: "MEDIUM",
  sampleSummary: {
    keywordCount: 8,
    contentCount: 12,
    competitorCount: 3,
    trendCount: 0,
    audienceSignalCount: 4,
  },
  keywordEvidence: [{ code: "KEYWORD_SAMPLE_SIZE", evidenceKind: "DATA_BACKED", supportCount: 8, confidence: "MEDIUM" }],
  contentEvidence: [{ code: "CONTENT_SAMPLE_SIZE", evidenceKind: "DATA_BACKED", supportCount: 12, confidence: "MEDIUM" }],
  opportunityEvidence: [
    { code: "PRODUCT_MARKET_KEYWORD_OVERLAP", evidenceKind: "INFERRED", supportCount: 2, confidence: "LOW" },
  ],
};

const insightA: MarketInsightRecord = {
  id: "i1",
  marketResearchId: "r3",
  version: 1,
  createdAt: "2026-03-02T00:00:00.000Z",
  payload: {
    executiveSummary: "当前样本里内容方向比较集中。",
    marketState: "LIMITED_SIGNAL",
    confidence: "MEDIUM",
    keywordInsights: [
      {
        statement: "样本中的关键词覆盖了产品核心卖点。",
        confidence: "MEDIUM",
        evidenceCodes: ["KEYWORD_SAMPLE_SIZE", "PRODUCT_MARKET_KEYWORD_OVERLAP"],
      },
    ],
    contentInsights: [
      {
        statement: "作品样本数量足够看出标题偏好。",
        confidence: "LOW",
        evidenceCodes: ["CONTENT_SAMPLE_SIZE"],
      },
    ],
    strategicImplications: [
      {
        statement: "下一期策略可以先验证这些内容方向。",
        confidence: "LOW",
        evidenceCodes: ["CONTENT_SAMPLE_SIZE"],
      },
    ],
    dataLimitations: ["LIMITED_SAMPLE", "UNKNOWN_SELECTION_METHOD"],
  },
};

const insightB: MarketInsightRecord = {
  id: "i2",
  marketResearchId: "r3",
  version: 2,
  createdAt: "2026-03-03T00:00:00.000Z",
  payload: {
    executiveSummary: "重新分析后，机会信号仍然有限。",
    marketState: "ANALYZABLE_SAMPLE",
    confidence: "HIGH",
    dataLimitations: ["当前数据只代表导入样本"],
  },
};

function run() {
  const options = researchSelectorOptions(researches);
  assert.deepEqual(
    options.map((item) => item.ordinalLabel),
    ["第 1 次调研", "第 2 次调研", "第 3 次调研"],
  );
  assert.equal(defaultSelectedResearchId(researches), "r3");

  assert.equal(marketStateLabel("INSUFFICIENT_DATA"), "数据不足");
  assert.equal(marketStateLabel("LIMITED_SIGNAL"), "样本信号有限");
  assert.equal(marketStateLabel("ANALYZABLE_SAMPLE"), "当前样本可分析");

  assert.equal(analysisConfidenceLabel("LOW"), "可信度较低");
  assert.equal(analysisConfidenceLabel("MEDIUM"), "可信度一般");
  assert.equal(analysisConfidenceLabel("HIGH"), "可信度较高");

  assert.equal(evidenceKindLabel("DATA_BACKED"), "样本直接支持");
  assert.equal(evidenceKindLabel("INFERRED"), "基于样本推断");
  assert.equal(evidenceKindLabel("INSUFFICIENT_DATA"), "数据不足");
  assert.equal(evidenceKindLabel("GENERAL_KNOWLEDGE"), "");

  assert.equal(humanizeMarketEvidence({ code: "KEYWORD_SAMPLE_SIZE" }).title, "关键词样本数量");
  assert.equal(humanizeMarketEvidence({ code: "CONTENT_SAMPLE_SIZE" }).title, "作品样本数量");
  assert.equal(humanizeMarketEvidence({ code: "HIGH_VOLUME_SIGNAL_KEYWORDS" }).title, "样本中高热度信号关键词");
  assert.equal(humanizeMarketEvidence({ code: "PRODUCT_MARKET_KEYWORD_OVERLAP" }).title, "产品关键词与市场样本存在重合");
  assert.equal(humanizeMarketEvidence({ code: "ABOVE_SAMPLE_MEDIAN_VIEWS" }).title, "样本内播放高于中位数的作品");
  assert.equal(humanizeMarketEvidence({ code: "TOP_REPEATED_RELATED_KEYWORDS" }).title, "重复出现的相关关键词");
  const unknown = humanizeMarketEvidence({ code: "SOME_NEW_CODE", supportCount: 2 });
  assert.equal(unknown.title.includes("SOME_NEW_CODE"), false);
  assert.equal(JSON.stringify(unknown).includes("SOME_NEW_CODE"), false);
  assert.equal(evidenceHumanizationAvoidsPlatformClaims(), true);

  assert.equal(
    researchQualityWarning("LIMITED"),
    "目前市场信息较少，本轮分析会更多依赖你的产品信息和已确认的研究方向，结论可信度会相对较低。",
  );
  assert.equal(
    researchQualityWarning("NONE"),
    "目前市场信息较少，本轮分析会更多依赖你的产品信息和已确认的研究方向，结论可信度会相对较低。",
  );
  assert.equal(noneGenerateNote("NONE")?.includes("低数据市场分析"), true);
  assert.equal(researchQualityWarning("USABLE"), null);

  const catalog = evidenceCatalog(evidence);
  const view = insightView(insightA.payload, catalog);
  assert.ok(view);
  assert.deepEqual(
    view.sections.map((section) => section.heading),
    ["关键词观察", "内容观察", "对下一步策略的启示"],
  );
  assert.equal(view.marketStateLabel, "样本信号有限");
  assert.equal(view.dataLimitations.includes("当前市场样本较少"), true);
  assert.equal(view.dataLimitations.includes("样本选择方式未知"), true);

  const history = historyItemViews([insightA, insightB]);
  assert.deepEqual(
    history.map((item) => item.version),
    [2, 1],
  );
  assert.equal(latestInsight([insightA, insightB])?.version, 2);

  const traces = matchEvidenceRefs(["CONTENT_SAMPLE_SIZE", "MISSING_CODE"], catalog);
  assert.equal(traces.length, 1);
  assert.equal(traces[0].title, "作品样本数量");
  assert.equal(JSON.stringify(traces).includes("CONTENT_SAMPLE_SIZE"), false);

  assert.equal(campaignStrategyHref("proj-1"), "/dashboard/projects/proj-1/strategy");

  assert.equal(viewModelHasCampaignFields(view), false);
  assert.equal(viewModelHasRawContract(view), false);
  assert.equal(viewModelHasRawContract(evidenceSummaryView(evidence)), false);

  const switched = selectedResearchBindings({
    selectedId: "r1",
    loadedResearchId: "r3",
    evidence,
    insights: [insightA, insightB],
  });
  assert.equal(switched.evidence, null);
  assert.deepEqual(switched.insights, []);
  const same = selectedResearchBindings({
    selectedId: "r3",
    loadedResearchId: "r3",
    evidence,
    insights: [insightA, insightB],
  });
  assert.equal(same.evidence, evidence);
  assert.equal(same.insights.length, 2);

  assert.equal(humanizeMarketAnalysisError({ code: "AGENT_INVALID_OUTPUT", message: "schema" }), "市场分析生成失败，请稍后重试。");
  assert.equal(JSON.stringify(view).includes("AgentRun"), false);
  assert.equal(JSON.stringify(view).includes("evidenceCodes"), false);

  // 12.12Q-A — raw terminology must not reach user-facing view text
  assert.equal(humanizeLimitationText("LIMITED_SAMPLE"), "当前市场样本较少");
  assert.equal(humanizeLimitationText("NO_MARKET_DATA"), "暂无可分析市场样本");
  assert.equal(humanizeLimitationText("MISSING_METRICS"), "缺少真实表现数据");
  assert.equal(humanizeLimitationText("MANUAL_ONLY"), "当前主要基于人工补充信息");
  assert.equal(humanizeLimitationText("WEIRD_UNKNOWN_ENUM_XYZ"), "当前可用信息仍有限，建议补充更多市场素材或先执行首轮验证。");
  assert.equal(
    humanizeLimitationText("missing metrics under LIMITED_SAMPLE"),
    "当前样本较少，并且缺少真实表现数据。",
  );
  assert.equal(humanizeLimitationText("based on missing evidence categories in LIMITED_SAMPLE").includes("LIMITED_SAMPLE"), false);

  const polluted = insightView(
    {
      ...insightA.payload,
      keywordInsights: [
        {
          statement: "样本不足",
          confidence: "LOW",
          evidenceCodes: [],
          caveat: "missing metrics under LIMITED_SAMPLE",
        },
      ],
      dataLimitations: ["LIMITED_SAMPLE", "MANUAL_ONLY"],
    },
    catalog,
  );
  assert.ok(polluted);
  const userFacing = [
    polluted.executiveSummary,
    ...polluted.dataLimitations,
    ...polluted.sections.flatMap((section) => section.items.flatMap((item) => [item.statement, item.caveat || ""])),
  ].join("\n");
  assert.equal(/\bLIMITED_SAMPLE\b/.test(userFacing), false);
  assert.equal(/\bMANUAL_ONLY\b/.test(userFacing), false);
  assert.equal(/missing metrics/i.test(userFacing), false);
  assert.match(polluted.sections[0].items[0].caveat || "", /样本较少|缺少真实表现/);

  console.log("market-analysis selfcheck PASS");
}

run();
