# Phase I Final UI Fix Batch Report

Date: 2026-09-17
Input: `docs/ui-ux/phase-i-final-full-product-visual-regression-audit.md`
Mode: frontend-only UI fix. Frozen 9 browser-accepted pages not redesigned.

---

## 1. Audit Issues Read

| ID | Severity | Batch |
| --- | --- | --- |
| REG-P1-01 | P1 | MUST_FIX_BEFORE_UI_FREEZE |
| REG-P1-02 | P1 | MUST_FIX_BEFORE_UI_FREEZE |
| REG-P2-01 | P2 | SHOULD_FIX_BEFORE_RC（audit risk 中 → 本轮不实施） |
| REG-P2-02 | P2 | SHOULD_FIX_BEFORE_RC（audit risk 中 → 本轮不实施） |
| REG-P2-03 | P2 | SHOULD_FIX_BEFORE_RC（LOW → 实施） |
| REG-P2-04 | P2 | SHOULD_FIX_BEFORE_RC（LOW → 实施） |
| REG-P2-05 | P2 | CAN_DEFER_POST_V1 |
| REG-P3-01 … 03 | P3 | CAN_DEFER_POST_V1 |

## 2. P1 Issues

- REG-P1-01 全局/项目内「发布与数据」双 active、入口 scope 混淆
- REG-P1-02 项目 AI复盘顶栏返回 global monitoring，页脚返回项目发布与数据

## 3. P1 Fixed

### REG-P1-01

- **Before:** `publish-data.match` 把项目 `/publish`、`/performance` 也当成全局「发布与数据」。
- **Fix:** 全局 active 仅 `/dashboard/monitoring` 与 `/dashboard/monitoring/*`。href 仍是 `/dashboard/monitoring`（未改 destination）。
- **Files:** `apps/frontend/src/lib/global-nav.ts`, `apps/frontend/src/lib/nav-scope.ts`
- **Regression Risk:** LOW
- **Business Logic Impact:** 0

### REG-P1-02

- **Before:** `page=ai-review` + `publicationId` → `/dashboard/monitoring/:id`。
- **Fix:** 有 `projectId` 时一律项目 `/publish`（`PROJECT_SCOPED_AI_REVIEW`）。无 `projectId` 时全局 `/dashboard/monitoring`（`GLOBAL_MONITORING_CONTEXT`）。忽略 publicationId 作为项目复盘 back。
- **Files:** `apps/frontend/src/lib/ux/workflow-back-nav.ts`
- **Regression Risk:** LOW
- **Business Logic Impact:** 0

## 4. P2 Issues Reviewed

全部阅读。仅实施 frontend-only + LOW risk + 不改冻结页主结构。

## 5. P2 Fixed

### REG-P2-03

- **Before:** 页脚 Next「查看表现」跟随任意选中 publication（含历史）。
- **Fix:** 仅当 `current.videoId === selectedVideo.id`（当前周期待发布成片）且可看 metrics 时才给 Next。页内 underline「查看表现」仍可进 monitoring。
- **Files:** `publish/page.tsx`
- **Regression Risk:** LOW
- **Business Logic Impact:** 0

### REG-P2-04

- **Before:** PENDING「采纳」为 Button primary，与回流 brand CTA 并列。
- **Fix:** 「采纳」改为 `variant="secondary"`。审核 API/状态不变。回流 CTA 仍为页级明确下一步。
- **Files:** `recommendation-card-v2.tsx`
- **Regression Risk:** LOW
- **Business Logic Impact:** 0

## 6. P2 Deferred

- REG-P2-01 宽度对齐 — SHOULD_FIX 但 audit risk **中**，会改已 PASS 的列表/设置容器。
- REG-P2-02 双返回导航 — SHOULD_FIX 但 audit risk **中**，会改已 PASS 页头结构。
- REG-P2-05 资料页/legacy — CAN_DEFER_POST_V1。

## 7. P3 Reviewed

REG-P3-01 返回文案、REG-P3-02 LearningLoop 密度、REG-P3-03 历史 overlay Dialog。

## 8. P3 Fixed

0（未与本轮改动同一组件的一两行必改项）

## 9. P3 Deferred

REG-P3-01, REG-P3-02, REG-P3-03 → DEFER_POST_V1

## 10. Global Nav Scope Fix

「发布与数据」全局项只匹配 global monitoring hub/detail。项目路由只高亮「项目」。href 未改。

## 11. Project Nav Scope Fix

侧栏「发布与数据」仍指向 `.../publish`。`isProjectNavActive` 未改。项目 publish/performance 时侧栏对应项 active，全局发布与数据 **inactive**。

### Active matching matrix

| Route | Global Active | Project Active | Back Target |
| --- | --- | --- | --- |
| `/dashboard` | 工作台 | — | — |
| `/dashboard/projects` | 项目 | — | — |
| `/dashboard/projects/:id` | 项目 | 项目概览 | 项目列表 |
| `.../positioning` | 项目 | 账号定位 | 概览 |
| `.../content/plans` | 项目 | 内容计划 | 账号定位 |
| `.../content/scripts` | 项目 | 选题与脚本 | 内容计划 |
| `.../content/videos` | 项目 | 视频制作 | 选题与脚本 |
| `.../publish` | 项目 | 发布与数据 | 视频制作 |
| `.../performance` | 项目 | AI复盘 | **项目** `/publish` |
| `/dashboard/monitoring` | 发布与数据 | — | 监控列表自身 back |
| `/dashboard/monitoring/:id` | 发布与数据 | — | 有 projectId 则项目 publish，否则 monitoring |
| `/dashboard/settings` | 设置 | — | — |

`project route` 不会让全局「发布与数据」active。已 selfcheck。

## 12. AI Review Back Navigation

PROJECT_SCOPED_AI_REVIEW：WorkflowPageHeader / 上一步 / NextActionBar back 均为项目发布与数据。
GLOBAL_MONITORING_CONTEXT：无 projectId 的 ai-review 回 monitoring hub。
未把用户因 publicationId 送出项目。

## 13. NextActionBar Regression

概览仍无 NextActionBar。主流程页各 1 个。壳层在这些页隐藏。AI 复盘 bar 无「开始下一轮内容规划」。视频无 script 时无 publish next。发布页脚 Next 不再用历史作品冒充当前周期。

## 14. Primary CTA Regression

未改各页主 CTA 文案/入口。AI 复盘「采纳」降为 secondary，页级回流 CTA 仍唯一实心 brand（有已采纳时）。概览仍只有 NextActionCard。内容计划未加第二个「制作第一条脚本」。

## 15. Current-cycle Regression

未改 `current-cycle.ts` / overview progress / sidebar done 判定。v2 脚本 0 仍不会把 v1 video/publication/metrics 算当前完成。

## 16. Historical-cycle Isolation

发布历史列表仍可查看；页脚 Next 不再把历史 publication 当成当前周期下一步。AI 复盘仍可选历史作品做复盘上下文。

## 17. Publication Truth Regression

仍 `registrationVerificationCopy("USER_ASSERTED")` → 「用户已登记」。无「平台已验证」回归。

## 18. AI Review Regression

未改分析、审核 persistence、metrics、handoff accepted-only、默认 3 条观察/建议、NO_AUTO_APPLY / NO_AUTO_GENERATE。

## 19. Interaction Lock Regression

无 html/body/AppShell `overflow-x: clip`。Dialog 关闭 `return null`。PASS。

## 20. Terminology Regression

产品路由无 raw enum 节点。技术 ID 未暴露。

## 21. Responsive Regression

未改 overflow / 分栏 / 1024 sidebar 折叠。

## 22. Accessibility Regression

全局 `aria-current` 现在不会双高亮发布与数据。审核按钮仍有标签。未宣称 WCAG。

## 23. Backend Changes

0

## 24. Database Changes

0

## 25. Agent Changes

0

## 26. Provider Calls

0

## 27. LLM Calls

0

## 28. .env

NO

## 29. Real Data Mutation

NO

## 30. Git

NO

## 31. Selfchecks

PASS: phase-a … phase-h, workflow-back-nav, final-ui-regression（含 global 不在项目 publish active、侧栏矩阵、AI review back=项目 publish、无冲突 active、单 NextActionBar、overflow-x clip、dialog closed、accepted-only、current-cycle isolation）

## 32. Frontend Build

PASS（`tsc --noEmit`, `next build`）

## 33. Browser Validation

NOT_RUN

## 34. Remaining Issues

- REG-P2-01 列表/设置 vs 顶栏宽度
- REG-P2-02 双返回导航
- REG-P2-05 资料页/legacy
- REG-P3-01, REG-P3-02, REG-P3-03

## 35. Gate

READY_FOR_FINAL_BROWSER_REGRESSION

---

## Final Issue Accounting

P0 Remaining: 0
P1 Remaining: 0
P2 Remaining: 3
P3 Remaining: 3
MUST_FIX Remaining: 0
SHOULD_FIX Remaining: 2
CAN_DEFER: 4
