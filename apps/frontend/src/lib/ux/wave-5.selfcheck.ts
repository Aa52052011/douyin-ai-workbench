import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canSubmitComplete, validateExternalUrl } from "../publication.form";
import { canSubmitMetrics, emptyMetricForm } from "../performance.form";
import { latestMetricCards, metricHistoryRows } from "../performance.view";
import { productStatusLabel } from "./status-map";
import {
  SHORT_LINK_HUMAN_ERROR,
  containsForbiddenAutoPublish,
  containsForbiddenPlatformVerifiedLie,
  findingTypeCopy,
  forceReanalysisCopy,
  hubNextAction,
  integerFieldError,
  looksLikeTechnicalId,
  boundVideoLabel,
  mayShowBenchmarkClaim,
  mayShowRetentionClaim,
  metricSourceUserCopy,
  monitoringPrimaryCta,
  monitoringStatusLabel,
  monitoringTitle,
  notAutoAppliedCopy,
  overclaimRewrite,
  registrationVerificationCopy,
  reviewActionLabel,
  showPlatformVerified,
  staleAnalysisCopy,
  trendPercent,
} from "./publication-monitoring-v5";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function read(rel: string) {
  return readFileSync(path.join(frontendRoot, rel), "utf8");
}

function run() {
  const publish = read("src/app/dashboard/projects/[projectId]/publish/page.tsx");
  const complete = read("src/components/publication-complete-form.tsx");
  const monitoring = read("src/app/dashboard/monitoring/page.tsx");
  const detail = read("src/app/dashboard/monitoring/[publishedPostId]/page.tsx");
  const performance = read("src/app/dashboard/projects/[projectId]/performance/page.tsx");
  const rec = read("src/components/recommendation-review-v5.tsx");
  const metricForm = read("src/components/performance-metric-form.tsx");
  const hub = read("src/components/publication-data-hub.tsx");
  const card = read("src/components/manual-publish-card-v5.tsx");

  assert.match(hub, /待发布/);
  assert.match(hub, /待登记/);
  assert.match(hub, /监控中/);
  assert.match(hub, /待复盘/);
  assert.match(hub, /已复盘/);
  assert.match(card, /我已经发布/);
  assert.match(card, /手动发布到抖音/);
  assert.equal(card.includes("立即发布到抖音"), false);
  assert.equal(card.includes("一键发布"), false);
  assert.equal(containsForbiddenAutoPublish(card), false);
  assert.match(publish, /ManualPublishCardV5/);
  assert.equal(publish.includes("立即发布到抖音"), false);

  assert.match(complete, /抖音作品链接/);
  assert.match(complete, /把发布后的作品链接粘贴到这里/);
  assert.match(complete, /没有链接？也可以填写作品 ID/);
  assert.equal(validateExternalUrl("https://v.douyin.com/abc"), SHORT_LINK_HUMAN_ERROR);
  assert.equal(canSubmitComplete({ externalUrl: "https://v.douyin.com/abc", externalPostId: "" }), false);
  assert.equal(canSubmitComplete({ externalUrl: "https://v.douyin.com/abc", externalPostId: "123" }), true);
  assert.equal(registrationVerificationCopy("USER_ASSERTED"), "用户已登记");
  assert.equal(registrationVerificationCopy("FORMAT_VALIDATED"), "链接格式已识别");
  assert.equal(showPlatformVerified(false), false);
  assert.equal(containsForbiddenPlatformVerifiedLie(complete, false), false);
  assert.equal(complete.includes("平台已验证"), false);
  assert.match(publish, /录入第一组数据/);
  assert.match(publish, /router.push\(`\/dashboard\/monitoring\/\$\{updated.id\}`\)/);

  assert.equal(monitoring.includes("productionArtifactId"), true);
  assert.equal(boundVideoLabel(true), "已绑定成片");
  assert.match(monitoring, /boundVideoLabel/);
  assert.equal(monitoring.includes("{item.productionArtifactId}"), false);
  assert.match(monitoring, /下一步/);
  assert.equal(monitoringTitle({ platformPostId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }), "未命名作品");
  assert.equal(looksLikeTechnicalId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), true);
  assert.equal(productStatusLabel("MONITORING_READY"), "等待数据");
  assert.equal(monitoringStatusLabel("ANALYSIS_READY"), "可进行AI复盘");
  assert.equal(monitoringPrimaryCta({ hasMetrics: false, hasAnalysis: false }).label, "录入数据");
  assert.equal(monitoringPrimaryCta({ hasMetrics: true, hasAnalysis: false }).label, "开始AI复盘");
  assert.equal(monitoringPrimaryCta({ hasMetrics: true, hasAnalysis: true }).label, "查看AI复盘");

  assert.match(metricForm, /新增一条数据记录/);
  assert.match(metricForm, /填写你现在在抖音看到的数据即可/);
  assert.match(metricForm, /当前数据由你手动录入/);
  assert.equal(metricForm.includes("MANUAL_ENTRY"), false);
  assert.equal(integerFieldError("-1"), "请输入 0 或更大的整数");
  assert.equal(integerFieldError("3"), null);
  assert.equal(canSubmitMetrics({ ...emptyMetricForm(), views: "1" }), true);
  assert.equal(canSubmitMetrics(emptyMetricForm()), false);
  assert.equal(metricSourceUserCopy("MANUAL_IMPORT"), "手动录入");

  const history = metricHistoryRows(
    [
      { observedAt: "2026-03-02T12:00:00.000Z", views: 80, likes: 1, comments: 0, shares: 0, favorites: 0 },
      { observedAt: "2026-03-03T12:00:00.000Z", views: 200, likes: 2, comments: 0, shares: 0, favorites: 0 },
    ],
    "2026-03-02T00:00:00.000Z",
  );
  assert.equal(history[0]?.views, "200");
  assert.match(history[0]?.changeLabel ?? "", /播放/);

  assert.equal(trendPercent(0, 10), null);
  assert.equal(trendPercent(100, 150), "50%");
  assert.equal(mayShowBenchmarkClaim(false), false);
  assert.equal(mayShowRetentionClaim(null), false);
  const cards = latestMetricCards({
    observedAt: "2026-03-03T12:00:00.000Z",
    views: 10,
    likes: 1,
    comments: 0,
    shares: 0,
    favorites: 0,
    completionRate: null,
    averageWatchTimeSeconds: null,
  });
  assert.equal(cards.some((item) => item.label === "完播率"), false);
  assert.equal(performance.includes("高于平均"), false);
  assert.equal(performance.includes("行业平均"), false);

  assert.match(detail, /RecommendationReviewV5/);
  assert.match(rec, /采纳/);
  assert.match(rec, /不采纳/);
  assert.match(rec, /稍后再看/);
  assert.equal(rec.includes(">Approve<"), false);
  assert.equal(reviewActionLabel("approve"), "采纳");
  assert.equal(findingTypeCopy("HYPOTHESIS"), "待验证假设");
  assert.match(rec, /待验证假设/);
  assert.match(rec, /你正在审核：AI给出的优化建议/);
  assert.equal(notAutoAppliedCopy().includes("尚未自动应用"), true);
  assert.equal(performance.includes("已自动应用"), false);
  assert.equal(overclaimRewrite().includes("因为这个开头"), false);
  assert.equal(staleAnalysisCopy(), "有新的数据，建议重新复盘");
  assert.equal(forceReanalysisCopy(), "使用最新数据重新复盘");
  assert.equal(detail.includes("STALE_BY_NEWER_METRICS"), true);
  assert.equal(detail.includes("平台已验证"), false);
  assert.match(detail, /data-acf-published-post-detail-v5/);
  assert.match(detail, /FeedbackHandoffUXV5/);
  assert.equal(monitoring.includes("AWAITING_MANUAL_PUBLICATION"), false);

  const next = hubNextAction({
    pendingPublishCount: 1,
    pendingRegisterCount: 0,
    waitingMetricsCount: 0,
    analysisReadyCount: 0,
  });
  assert.match(next?.label ?? "", /等待手动发布/);

  console.log("ux-wave5 selfcheck PASS");
}

run();
