# Phase I Final Full Product Visual Regression Audit

Date: 2026-09-17
Mode: **AUDIT ONLY**（未实施视觉修复批次）
Browser Automation: **NOT_AVAILABLE**（本环境无浏览器自动化；9 页人工视觉验收视为 regression anchors，本报告不冒充浏览器验收）

---

## 1. Audit Scope

只读检查：路由/组件映射、壳层与导航、NextActionBar、CTA、按钮/卡片/字号/宽度、状态文案、空态/加载/错误、渐进披露、响应式 class、交互锁回归、current-cycle / historical isolation、既有 selfcheck 与 `next build`。

**未做：** 业务闭环改动、真实数据 mutation、后端/DB/Agent/provider/LLM、`.env`、git mutation、大范围 UI 修复。

产品闭环（冻结）：定位 → 内容计划 → 脚本 → 视频 → 最终成片确认 → 下载 → 手动发布 → 登记作品 → 手动录入数据 → AI复盘 → 人工审核建议 → ACCEPTED-only 回流 → 下一轮内容规划。

## 2. Frozen Browser Accepted Pages

| Anchor | Route | Human visual |
| --- | --- | --- |
| DASHBOARD | `/dashboard` | PASS |
| PROJECT_LIST | `/dashboard/projects` | PASS |
| PROJECT_OVERVIEW | `/dashboard/projects/:projectId` | PASS |
| POSITIONING | `.../positioning` | PASS |
| CONTENT_PLAN | `.../content/plans` | PASS |
| SCRIPT_WORKSPACE | `.../content/scripts` | PASS |
| VIDEO_EMPTY_STATE | `.../content/videos` | PASS |
| PUBLISH_MONITORING | `.../publish` | PASS |
| AI_REVIEW | `.../performance`（非 `/ai-review`） | PASS |

**Frozen Browser Pages: 9 / 9。** 新问题不把已 PASS 页判废，只分类剩余债。

无独立 `/dashboard/projects/:projectId/publication`、`.../ai-review`、`.../monitoring/*`。作品监控在 `/dashboard/monitoring` 与 `/dashboard/monitoring/:publishedPostId`。设置在 `/dashboard/settings`（无 `/settings`）。

**隐藏 / legacy（不纳入正式视觉 PASS）：**
`/dashboard/agents`、`/dashboard/agents/account-positioning`、`/dashboard/content-planning`、`/dashboard/scripts`、`/dashboard/scripts/:id`、`/dashboard/videos`、`/dashboard/videos/:id`、`/dashboard/assets`、`/dashboard/production/review/crop/:sessionId`。
**项目资料（侧栏折叠，非 9 页冻结范围）：** `product` / `market/research` / `market/analysis` / `strategy` / `assets`。

## 3. Global Header

- 产品名：顶栏「智能工作台」；`title` 为「抖音 AI 智能工作台」。与页面内「工作台」标题不完全同字，可接受。
- 主导航：工作台 / 项目 / 发布与数据 / 设置；`aria-current` 有实现。
- 项目切换器：`max-w-40` + 「全部项目」链接；用户名 `max-w-[4.5rem]` truncate；退出为 underline 文本按钮。
- 高度：`--acf-topbar-height: 3.25rem`；sticky + 底边框。
- 对齐：`acf-app-frame`（max 90rem）+ `px-3 md:px-4`。工作台与**项目内页**跳过 `PageContainerV2`，与顶栏同框。**项目列表 / 设置 / 全局监控**套 `PageContainerV2`（72rem），内容比顶栏更窄（见 issue REG-P2-01）。
- 无技术字段、无 `overflow-x: clip`。

**重点问题：** 项目内 `/publish`、`/performance` 上，`GLOBAL_NAV` 的「项目」与「发布与数据」**同时 match**（见 REG-P1-01）。顶栏「发布与数据」指向 `/dashboard/monitoring`，侧栏同名指向项目 `/publish`。

## 4. Project Header

`ProjectShell` compact header：项目名 `truncate` + `min-w-0`；平台 · 行业；`当前：{workflowCurrentLabel}` 来自 `resolveWorkflowStagesV2(facts)`（current-cycle）；「编辑项目」右侧稳定。
`lg` 以下「项目导航」折叠。占位项目 `createdAt=1970` 不拉 status。未见历史 v1 直接写入项目头。

## 5. Project Sidebar

七项主流程 + 「项目资料」`<details>`（默认收起）。Active：muted 底 + `font-medium` + `aria-current`。标记 ✓ / ● / ○ 由 `projectWorkflowMark` + current-cycle helpers。
1024：`hidden lg:block` + 顶栏「项目导航」。宽度 `lg:w-52`（约 `--acf-sidebar-width: 13rem`）。

代码级 current-cycle：v2 已确认计划、脚本 0 时，脚本为 ●，视频/发布/复盘不为 ✓（`project-workflow-nav-current-cycle` PASS）。

## 6. Workflow Back Navigation

`resolveWorkflowBackNav` 语义：

| Page | Back |
| --- | --- |
| Overview | 项目列表 |
| Positioning | 概览 |
| Content Plan | 账号定位 |
| Scripts | 内容计划 |
| Video | 选题与脚本 |
| Publish | 视频制作 |
| AI Review（无 publicationId） | 项目发布与数据 |
| AI Review（有 publicationId） | `/dashboard/monitoring/:id`「返回作品数据」 |

产品页源码 **无 `router.back()`**。
`WorkflowBackNavV1` 同时渲染「← 返回 xxx」与「上一步：xxx」，且冻结页普遍还有 breadcrumb + 页脚 `NextActionBar` 再一条 ←（见 REG-P2-02）。
**AI 复盘在选中作品时 back 目标与「→ 发布与数据」链路不一致**（REG-P1-02）。

## 7. NextActionBar Matrix

壳层 `hideProjectShellNextActionBar` 覆盖概览与全部主流程页，避免壳层+页面双 bar。概览用 `NextActionCard`，不用 bar。

| Page | NextActionBar | Back | Current | Next | 是否重复 Primary CTA |
| --- | --- | --- | --- | --- | --- |
| Dashboard | HIDE | — | — | — | NO（继续处理为唯一实心 brand） |
| Projects | HIDE | — | — | — | NO |
| Overview | HIDE | （仅顶栏 WorkflowBackNav） | NextActionCard | — | NO |
| Positioning | SHOW（弱流程） | 返回项目概览 | 账号定位 | 内容计划 | NO |
| Planning | SHOW（弱流程） | 返回账号定位 | 内容计划 | 选题与脚本 | NO |
| Scripts | SHOW | ← 内容计划（无「返回」前缀） | 选题与脚本 | 视频制作 | NO（bar 为文字链） |
| Videos | SHOW | ← 选题与脚本 | 视频制作 | 无 confirmed script 时 **NONE** | NO |
| Publish/Data | SHOW | 返回视频 | 工作流步骤文案 | 有可看数据时「查看表现」→ **全局 monitoring 详情**（随当前选中作品，含历史） | NO vs 页内主 CTA；见 REG-P2-03 |
| AI Review | SHOW | 返回发布与数据 | AI复盘 | **NONE**（不把「开始下一轮内容规划」放进 bar） | 下一轮 CTA 仅反馈回流；PENDING 卡上「采纳」仍为 Button primary（REG-P2-04） |

## 8. Primary CTA Matrix

代码推断（非浏览器像素计数）。「明显 Primary」= `Button` default/primary 或 `bg-[var(--acf-brand)]` 实心链。

| Page | Primary CTA Count | Notes |
| --- | --- | --- |
| Dashboard | 1 | 空项目：创建表单 primary；有项目：Resume「继续处理」brand，创建为 secondary |
| Projects | 0–1 | 列表「创建项目」secondary；空列表表单可为 primary |
| Overview | 1 | NextActionCard「继续下一步」 |
| Positioning | 1 | 生成/保存主路径（页脚 bar 非实心） |
| Planning | 1 | 生成/确认主路径 |
| Scripts | 1 | 当前选题生成/确认 |
| Videos | 1 | 有脚本时生成/确认；空态 EmptyState 一个动作 |
| Publish/Data | 1 | 下载 / 我已经发布 / 登记 按步骤 |
| AI Review | 1 + N | 回流 CTA 1；每个 PENDING 建议默认「采纳」为 primary（REG-P2-04） |

Drawer/Dialog 内按钮仅在打开时存在；关闭无 overlay。

## 9. Button Consistency

设计系统：`Button` primary/secondary/ghost/danger，radius `--acf-radius-sm`（8px）。
残留：项目头「编辑项目」、顶栏「退出」、历史列表「查看」等 **原生 button**；部分 `rounded-md` / `border-neutral-*`。
Legacy 工程页仍有 **黑色实心按钮**（不纳入 9 页 PASS）。
视频预览 `bg-black` 为播放器底，不是 CTA。
不要为统一而改已 PASS 层级。

## 10. Card Consistency

Token：border `--acf-border`，radius 8/12，shadow 弱。
定位摘要 2 列卡、选题队列、视频空态、指标卡、建议卡已产品化。
历史列表仍 `border-neutral-200`（P3）。未见系统性 heavy black border。Dashed 空态未在主流程页作为默认巨大空盒出现。

## 11. Typography

全局：`.acf-page-title` 1.375rem / 600 / lh 1.3；section/card 0.9375rem；body 0.875rem lh 1.55；caption 0.75rem muted。
WorkflowBackNav 仍用 `text-neutral-800` / `text-neutral-500`，未全部切 token（P3）。未建议全局放大字号。

## 12. Page Width

| Page | Main Width Strategy | Issue | Severity |
| --- | --- | --- | --- |
| Dashboard | `acf-app-frame` 90rem + `px-3` | 与顶栏对齐 | — |
| Project list | `PageContainerV2` 72rem + `px-4 py-6` | 比顶栏/工作台更窄 | P2 |
| Project inner | 90rem − sidebar `lg:w-52` + gap | 比列表更宽 | 可接受（工作区） |
| Plans / Scripts / Video / Publish | 随项目 main | 脚本 1279 以下单列；视频 Preview/Review 分栏 | — |
| AI Review | 项目 main 内再 `max-w-6xl` | 略收窄，不明显破版 | P3 |
| Settings / Monitoring | 72rem 容器 + 自身 padding | 与工作台错位 | P2 |
| 1024 | sidebar 折叠 | class 具备 | 未浏览器测 |

## 13. Vertical Rhythm

PageHeader 默认 `mb-6`；工作台改为 `mb-4`。NextActionBar `mt-8` + 顶部分割线。
主流程已压过长说明；AI 复盘仍有一句分析能力说明 + LearningLoop（P3 密度）。未发现回归成「大块空卡」。

## 14. Status Language

产品路由 JSX 无 `>USER_ASSERTED<` / `>HIGH_<` / `>SPARSE<` / `>COMPLETED<`。
`getUserFacingStatus` / `registrationVerificationCopy`：用户已登记 ≠ 平台已验证。下载文案有 DOWNLOAD_STARTED 与完成区分（phase-e selfcheck）。
内部比较仍用枚举，不渲染给用户。

## 15. Technical Terminology

正常 UI 未暴露 UUID/AgentRun/requestId 等。`tenantId`/`workspaceId` 仅 layout 占位对象，不渲染。
`TechnicalDetailsPanel` 默认 `open=false`。设置「高级设置」默认折叠。

## 16. Empty States

冻结页均有 title + 原因 + 动作模式（无项目、无定位、无计划、无脚本、视频空、无可发布成片、无 publication、无 metrics、无可复盘作品）。代码未见巨大 dashed 空盒作为唯一主界面。

## 17. Loading States

`Button` loading → disabled +「处理中…」+ `aria-busy`。工作台/概览 Skeleton。脚本/视频有 `AsyncTaskProgressV1`（真实 stage，无假百分比承诺）。布局 auth 未就绪：「加载中…」。

## 18. Errors

主流程多用 `InlineActionErrorV1`。项目列表仍用 `ProductErrorState`（P3 组件不一致）。Dialog/表单错误贴近操作。未发现把 provider stack 作为默认正文。Timeout 映射依赖既有 `toProductError`（未改业务）。

## 19. Progressive Disclosure

定位「更多操作」；计划历史/为什么；脚本生成设置/history；视频 technical + history；发布历史数据；复盘历史数据 / 观察解释 / 建议依据。`<details>` 默认闭合。AI 复盘观察/建议默认 ≤3。

## 20. Responsive

Class 覆盖 1920/1440/1280/1024 意图：脚本 `max-width: 1279px` 单列；视频 `max-xl:flex-col`；表格 `overflow-x-auto`；`min-w-0` 在 AppShell/ProjectShell/Dashboard。
**NO_GLOBAL_OVERFLOW_X_CLIP**：`html`/`body`/`AppShell` 无 `overflow-x: clip`。
未做真实视口拖拽。

## 21. Interaction Lock Regression

**PASS（代码）。**
html/body/AppShell 无 overflow-x clip、无全局 pointer-events-none、无 inert。
`Dialog`：`open !== true` 时 `return null`；无 body overflow lock；Escape + Tab trap 仅打开时绑定。
历史定位等自定义 `fixed inset-0` **仅 viewing 时挂载**，关闭无 overlay。

## 22. Accessibility Baseline

有：`:focus-visible`、nav `aria-current`、折叠 `aria-expanded`、button `aria-busy`、Dialog 焦点恢复。
缺口：部分原生 button、历史 overlay 未走 Dialog（Escape/焦点不统一）。**不宣称 WCAG PASS。**

## 23. Current-cycle Truth

事实模型（代码 + selfcheck）：latest plan v2 confirmed、current scripts/videos/publications 0 时，概览进度为 0/7，阶段「内容计划已确认」，下一步「制作第一条脚本」；侧栏脚本 ●、视频/发布/复盘 ○。不把 `hasCompletedVideo` / `hasPublishedPublication` / `hasMetrics` 当成当前周期完成。

## 24. Historical-cycle Isolation

发布「已登记作品」文案明确不是「本期已登记」。AI 复盘可看历史 publication，选择器「正在复盘」+ 标题/登记时间/记录条数。页脚下一轮规划仅 accepted-only。
Publish NextActionBar「查看表现」跟随**当前选中记录**，可能是历史作品（REG-P2-03），不改数据，但可能像「当前周期下一步」。

## 25. Remaining Issues

### REG-P1-01

- **Severity:** P1 USER_CONFUSION
- **Page(s):** 全局顶栏；项目内 `/publish`、`/performance`；`/dashboard/monitoring`
- **Problem:** 「发布与数据」顶栏入口是跨项目 `/dashboard/monitoring`；项目侧栏同名是 `/publish`。项目内 publish/performance 上「项目」与「发布与数据」同时 `match` → 双 active。
- **User Impact:** 不知道自己在项目流程还是全局监控；点顶栏会离开项目工作区。
- **Evidence:** `global-nav.ts` `projects.match` 含 `/dashboard/projects/`；`publish-data.match` 含 `/publish` 与 `/performance`；`href: "/dashboard/monitoring"`。
- **Recommended Fix:** 项目路径下顶栏只高亮「项目」；或顶栏「发布与数据」在项目内指向该项目 `/publish`。不要改监控 API。
- **Business Logic Impact:** 0
- **Regression Risk:** 中（顶栏高亮与入口，已 PASS 页结构可保持）

### REG-P1-02

- **Severity:** P1 USER_CONFUSION
- **Page(s):** AI复盘 `/performance`
- **Problem:** 选中作品时 `WorkflowBackNav` 去 `/dashboard/monitoring/:publicationId`（「返回作品数据」），页脚 bar 去项目 `/publish`（「返回发布与数据」）。规定链路是 AI Review → Publish/Data。
- **User Impact:** 两条「返回」到不同产品面。
- **Evidence:** `workflow-back-nav.ts` `ai-review` + publicationId；`performance/page.tsx` 传入 `publicationId`；`NextActionBar` `backHref=.../publish`。
- **Recommended Fix:** 项目 AI复盘 back 一律项目 `/publish`；monitoring 详情页保持自己的 back。
- **Business Logic Impact:** 0（纯 href）
- **Regression Risk:** 低；需改 back-nav selfcheck 旧断言

### REG-P2-01

- **Severity:** P2 VISUAL_INCONSISTENCY
- **Page(s):** 项目列表、设置、全局 monitoring vs 工作台/项目内
- **Problem:** 72rem `PageContainerV2` vs 90rem `acf-app-frame`，左右与顶栏不完全齐。
- **User Impact:** 换页时内容框跳动。
- **Evidence:** `app-shell.tsx` `alignWithHeader` 仅 dashboard 与 `/projects/:id`；列表/设置走 `PageContainerV2`。
- **Recommended Fix:** 列表与设置与顶栏同一 frame padding；或统一 content max。
- **Business Logic Impact:** 0
- **Regression Risk:** 中（项目列表已视觉 PASS，只做对齐微调）

### REG-P2-02

- **Severity:** P2 VISUAL_INCONSISTENCY
- **Page(s):** Overview、Positioning、Planning、Scripts、Videos、Publish、AI Review
- **Problem:** WorkflowBackNav +「上一步」+ breadcrumb + NextActionBar ←，双重/三重返回。已 PASS，不判废。
- **User Impact:** 噪音，偶发以为有两个返回栈。
- **Evidence:** `workflow-page-header-v1.tsx` + 各页 `NextActionBarV1` + `previousStepLabel` 恒有值。
- **Recommended Fix:** 页头只留一条 ←；bar 只保留「当前 / 下一阶段」或弱化 back。
- **Business Logic Impact:** 0
- **Regression Risk:** 中（改的是已验收布局，需再人工看一眼）

### REG-P2-03

- **Severity:** P2 VISUAL_INCONSISTENCY
- **Page(s):** Publish/Data
- **Problem:** 页脚 Next = 选中作品的 monitoring「查看表现」，历史作品被选中时像在推当前周期。
- **User Impact:** 可能以为当前 v2 已到「看表现」。
- **Evidence:** `publish/page.tsx` `nextHref={current && canOpenMetrics(...) ? /dashboard/monitoring/${current.id}}`。
- **Recommended Fix:** 无当前周期可发布成片时 Next=NONE；或文案标明「这条已登记作品」。
- **Business Logic Impact:** 0
- **Regression Risk:** 低

### REG-P2-04

- **Severity:** P2 VISUAL_INCONSISTENCY
- **Page(s):** AI Review
- **Problem:** 默认可同时出现多颗 primary「采纳」。回流 CTA 也是 brand。
- **User Impact:** 审核动作与「下一步规划」权重接近。
- **Evidence:** `recommendation-card-v2.tsx` 采纳为 default Button；`feedback-handoff-ux-v5.tsx` brand Link。
- **Recommended Fix:** 页级主 CTA 仅回流（有已采纳时）；卡内三动作为 secondary。
- **Business Logic Impact:** 0
- **Regression Risk:** 低

### REG-P2-05

- **Severity:** P2 VISUAL_INCONSISTENCY
- **Page(s):** 项目资料、legacy 工程页、`/login`、全局 monitoring
- **Problem:** 未冻结页仍有黑按钮、旧 overlay、monitoring 仍 `ContextualGuidanceV1`。
- **User Impact:** 从侧栏「项目资料」或误进 legacy 时体验掉档。
- **Evidence:** `assets/page.tsx` `bg-neutral-900`；agents/scripts 等 `bg-black`；`monitoring/page.tsx` ContextualGuidanceV1。
- **Recommended Fix:** RC 前至少统一资料页按钮；legacy 保持隐藏。
- **Business Logic Impact:** 0
- **Regression Risk:** 低

### REG-P3-01

- **Severity:** P3 POLISH
- **Page(s):** 多页
- **Problem:** Back 文案「返回视频」vs「返回视频制作」；脚本 bar「← 内容计划」无「返回」；历史卡 `neutral` 边框。
- **User Impact:** 轻微不一致。
- **Evidence:** 各页 `backLabel` 字符串。
- **Recommended Fix:** 统一 `返回{侧栏名}`。
- **Business Logic Impact:** 0
- **Regression Risk:** 低

### REG-P3-02

- **Severity:** P3 POLISH
- **Page(s):** AI Review
- **Problem:** 分析能力说明 + LearningLoop 与已收敛的复盘密度略叠。
- **User Impact:** 多扫两眼。
- **Evidence:** `performance/page.tsx` caption + `LearningLoopV1`。
- **Recommended Fix:** 可再收一句或并入手风琴。
- **Business Logic Impact:** 0
- **Regression Risk:** 低（已 PASS 页）

### REG-P3-03

- **Severity:** P3 POLISH
- **Page(s):** Positioning 等历史
- **Problem:** 历史 overlay 未复用 `Dialog`（打开时无统一 Escape/焦点）。关闭态无锁页。
- **User Impact:** 键盘用户体验差一档。
- **Evidence:** `positioning-history.tsx` `fixed inset-0` 仅 `viewing` 时。
- **Recommended Fix:** 换 Dialog 原语。
- **Business Logic Impact:** 0
- **Regression Risk:** 中（焦点行为）

## 26. Severity Classification

| Severity | Count | IDs |
| --- | --- | --- |
| P0 BLOCKER | 0 | — |
| P1 USER_CONFUSION | 2 | REG-P1-01, REG-P1-02 |
| P2 VISUAL_INCONSISTENCY | 5 | REG-P2-01 … REG-P2-05 |
| P3 POLISH | 3 | REG-P3-01 … REG-P3-03 |

## 27. Recommended Final Fix Batch

**MUST_FIX_BEFORE_UI_FREEZE**
- REG-P1-01 顶栏 active +「发布与数据」入口歧义
- REG-P1-02 AI复盘返回目标统一到项目发布与数据

**SHOULD_FIX_BEFORE_RC**
- REG-P2-01 列表/设置与顶栏宽度对齐
- REG-P2-02 双返回导航收敛（已 PASS 页需再测一眼）
- REG-P2-03 发布页脚 Next 不拿历史作品冒充当前周期
- REG-P2-04 复盘 primary 层级

**CAN_DEFER_POST_V1**
- REG-P2-05 资料页/legacy 视觉
- REG-P3-01 … REG-P3-03

**本阶段不实施任何上述修复。**

## 28. Backend Mutations

0

## 29. Database Mutations

0

## 30. Agent Mutations

0

## 31. Provider Calls

0

## 32. .env

NO

## 33. Git

NO（审计未执行 git mutation）

## 34. Frontend Build

PASS

- `tsc --noEmit` PASS
- phase-a … phase-h PASS
- `final-ui-regression` PASS（无全局 overflow-x clip；current-cycle nav；壳层单 NextActionBar；产品路由无 raw 枚举节点；AI 复盘 bar 无重复「开始下一轮内容规划」；Dialog 关闭无 overlay；accepted-only handoff 文案存在）
- `next build` PASS

## 35. Browser Automation

NOT_AVAILABLE

## 36. Gate

AUDIT_PASS_WITH_REQUIRED_FIXES

Interaction Lock Regression: **PASS**（代码）
NO_GLOBAL_OVERFLOW_X_CLIP: **PASS**
