/**
 * Step 12.12N — confidence action mapping selfcheck (no provider).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildConfidenceActionView,
  reasonFromLimitationCodes,
  textExposesRawLimitationCode,
} from "./confidence-action";

const here = dirname(fileURLToPath(import.meta.url));
const frontendSrc = join(here, "..");

function run() {
  const lowNoData = buildConfidenceActionView({
    confidence: "LOW",
    limitationCodes: ["NO_MARKET_DATA"],
    projectId: "p1",
    context: "market",
  });
  assert.ok(lowNoData);
  assert.equal(lowNoData.level, "low");
  assert.equal(lowNoData.label, "可信度较低");
  assert.match(lowNoData.reasonSummary ?? "", /没有可分析的市场样本/);
  assert.ok(lowNoData.recommendedActions.some((a) => a.id === "add-keywords"));
  assert.equal(textExposesRawLimitationCode(JSON.stringify(lowNoData)), false);

  const limited = buildConfidenceActionView({
    confidence: "LOW",
    limitationCodes: ["LIMITED_SAMPLE"],
    projectId: "p1",
    context: "market",
  });
  assert.match(limited?.reasonSummary ?? "", /样本较少|验证/);
  assert.ok((limited?.recommendedActions.length ?? 0) >= 1);

  const missingMetrics = buildConfidenceActionView({
    confidence: "LOW",
    limitationCodes: ["MISSING_METRICS"],
    projectId: "p1",
    context: "market",
  });
  assert.ok(missingMetrics?.recommendedActions.some((a) => a.id === "publish-first" || a.id === "backfill-metrics"));

  const unknown = reasonFromLimitationCodes(["TOTALLY_UNKNOWN_CODE_XYZ"]);
  assert.equal(unknown.reasonSummary.includes("TOTALLY_UNKNOWN_CODE_XYZ"), false);
  assert.match(unknown.reasonSummary, /有限|验证|补充/);

  const unknownView = buildConfidenceActionView({
    confidence: "LOW",
    limitationCodes: ["TOTALLY_UNKNOWN_CODE_XYZ"],
    projectId: "p1",
    context: "strategy",
  });
  assert.equal(textExposesRawLimitationCode(JSON.stringify(unknownView)), false);
  assert.equal(unknownView?.framingNote, "这是一版验证型策略。");

  const high = buildConfidenceActionView({
    confidence: "HIGH",
    limitationCodes: [],
    projectId: "p1",
    context: "market",
  });
  assert.equal(high?.level, "high");
  assert.equal(high?.recommendedActions.length, 0);

  const planning = buildConfidenceActionView({
    confidence: "LOW",
    limitationCodes: ["LIMITED_MARKET_SAMPLE"],
    projectId: "p1",
    context: "planning",
  });
  assert.equal(planning?.framingNote, "本轮为验证型内容计划。");
  assert.ok(planning?.recommendedActions.some((a) => a.id === "continue-script"));

  const strategyPage = readFileSync(
    join(frontendSrc, "app/dashboard/projects/[projectId]/strategy/page.tsx"),
    "utf8",
  );
  assert.equal(strategyPage.includes("本次策略依据"), false);
  assert.match(strategyPage, /为什么这样建议/);
  assert.match(strategyPage, /用于生成内容计划|用于内容计划/);
  assert.match(strategyPage, /重新生成策略会重新制定本轮推广方向/);
  assert.match(strategyPage, /ConfidenceActionCard/);
  assert.match(strategyPage, /ExplanationDetails/);

  const summary = readFileSync(join(frontendSrc, "components/campaign-strategy-summary.tsx"), "utf8");
  assert.equal(summary.includes("来自产品信息"), false);
  assert.equal(/title=\"可信度\"/.test(summary), false);
  assert.equal(summary.includes("数据限制"), false);
  assert.match(summary, /推广目标|推荐策略|内容方向|关键执行建议/);

  const planningPage = readFileSync(
    join(frontendSrc, "app/dashboard/projects/[projectId]/content/plans/page.tsx"),
    "utf8",
  );
  assert.equal(planningPage.includes("本次计划依据"), false);
  assert.match(planningPage, /为什么这样规划/);
  assert.match(planningPage, /ContentPlanningWeekOverview/);
  // week overview rendered before explanation
  assert.ok(planningPage.indexOf("ContentPlanningWeekOverview") < planningPage.indexOf("为什么这样规划"));

  const insight = readFileSync(join(frontendSrc, "components/market-analysis-insight.tsx"), "utf8");
  assert.equal(insight.includes("<h2 className=\"mb-2 text-sm font-medium\">数据限制</h2>"), false);
  assert.match(insight, /ConfidenceActionCard/);
  assert.match(insight, /为什么这样判断/);

  console.log("confidence-action / 12.12N presentation selfcheck PASS");
}

run();
