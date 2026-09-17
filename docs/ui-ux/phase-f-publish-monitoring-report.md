# UI/UX Implementation Phase F Report

Date: 2026-09-16
Wave: `UI_UX_IMPLEMENTATION_PHASE_F_PUBLISH_AND_MONITORING`
Do not start Phase G from this document.

## 1. Scope

Productize in-project publish + monitoring as a continuous 5-step workflow (prepare vertical cut → manual Douyin publish → register work → enter metrics → view performance / AI review handoff). Frontend only. No Douyin auto-publish. No fake publications or snapshots. Existing publication `01a0a54e-…` and its two snapshots were not mutated in this session.

## 2. Five-step workflow

`PublishWorkflowStepsV1` + `PUBLISH_WORKFLOW_STEPS`: 准备成片, 手动发布, 登记作品, 录入数据, 查看表现. Current step from download / register / metrics facts, not URL theater.

## 3–8. Prepare + download

Primary download remains 下载竖版视频. Copy: 正在准备下载… then 已开始下载，请查看浏览器下载记录. Not READY → 视频文件仍在准备中. No “download complete”.

## 9–14. Manual publish

`ManualPublishCardV5` kept. 我已经发布 → `declarePublished` only `setReadyToRegister(true)`. `publicationCreatedOnDeclarePublished()` still false. Copy: 下一步：登记你刚刚发布的作品. No 立即发布到抖音 / 一键发布.

## 15–22. Registration

`isRegistrationFormVisible` unchanged. Create/complete still existing APIs. Frozen strings: 登记已发布作品, 粘贴你刚刚在抖音发布的视频链接, 登记作品, 录入第一组数据. After success the page stays in-project (✓ 作品已登记 + metric form). `router.push(\`/dashboard/monitoring/${updated.id}\`)` remains on 查看表现, not auto-run after register.

## 23–28. Isolation / current vs history

Pending publish videos = current CONFIRMED plan scripts ∩ `eligiblePublishVideos` ∩ not already tied. v2 with 0 scripts does not select v1 video `cb66555a-…` as the current task. Empty: 还没有可发布的最终成片. Historical publications stay in 本期已登记作品 summary list.

## 29–36. Metrics entry / zero vs empty / duration

Form: 播放, 新增粉丝, 观察时间, 保存本次数据. Frozen helper copy kept (新增一条数据记录 / 填写你现在在抖音看到的数据即可 / 当前数据由你手动录入). `displayMetricValue(0) === "0"`; null → "—". `trendPercent(0, 1)` still null (no infinite %). Observation duration still adjacent `observedAt` (`9 分钟` between 14:11 and 14:20). Snapshots remain append-only.

## 37–44. Summary, trend, single history table

`MetricsSummaryV2` current + delta. `MetricsTrendV1` polyline when ≥2 view points; one snapshot: 目前只有一组数据，再录入一次后可以看到变化趋势. `MetricsHistoryV5` is the only table (PerformanceHistory no longer mounted). Default 3 rows + 查看全部历史. 新增粉丝 column uses existing `changeLabel`.

## 45–50. Truth copy / monitoring list / analysis readiness

USER_ASSERTED → 用户已登记. `publicationTruthCopy()`: 这条作品由你手动登记。系统尚未通过抖音接口验证发布状态. No 平台已验证. Cross-project monitoring list is summary cards (title, bound video, latest play/like, status, 下一步). Analysis copy uses snapshot count + existing `dataSufficiency`; never claims “two snapshots always ready”. AI review UI not redesigned (Phase G).

## 51–56. Files / backend

Touched: publish page, monitoring list/detail, metric form, history, summary/trend/steps, publish.workspace, publication-monitoring-v5 copy helpers, selfchecks, docs. Backend/DB/Agent/Provider/.env/Git writes: 0 / NO. MANUAL_PUBLICATION_MODE and MANUAL_IMPORT unchanged.

## 57–61. Verification / gate

Frontend `check:phase-f` PASS. `check:ux-wave5` PASS. `tsc --noEmit` PASS. Next.js build PASS. Browser NOT_RUN. Visual NOT_CLAIMED. Closed: PUBLISH_FLOW, REGISTRATION_FRAGMENTED, METRIC_ENTRY_MECHANICAL, MONITORING_DOUBLE_TABLE, CURRENT_HISTORY_HIERARCHY, DOWNLOAD_PUBLISH_FRAGMENTED, PUBLICATION_TRUTH_COPY, METRICS_ZERO_NULL_UI. Remaining: AI_REVIEW_DENSITY, BROWSER_VISUAL_ACCEPTANCE.

Gate: PASS_WITH_LIMITATIONS (no browser).

Recommended Next Step: `UI_UX_IMPLEMENTATION_PHASE_G_AI_REVIEW_AND_FEEDBACK_HANDOFF`
