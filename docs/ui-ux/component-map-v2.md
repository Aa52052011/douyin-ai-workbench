# Component Map V2

原则：**先复用现有组件，再包一层产品外观。禁止平行造第二套导航/返回/任务中心。**

## 1. Shell / 导航

| 规划名 | 策略 | 现有基础 |
| --- | --- | --- |
| AppShellV2 | **演进** `AppShell`：更紧顶栏、品牌字「抖音 AI 智能工作台」可产品名映射、去掉工程感 | `app-shell.tsx` |
| GlobalNavigationV2 | **保持** `GLOBAL_NAV_V2` 四项 | `global-nav.ts` |
| ProjectWorkflowNavV2 | **演进** 侧栏：✓/●/○ 工作流状态，增加 AI复盘，资料仍折叠 | `project-shell.tsx` `project-nav.ts` `workflow-stages.ts` |
| ProjectCompactHeaderV1 | **替换** 现项目头长描述 | `project-shell.tsx` 头部块 |
| WorkflowPageHeaderV1 | **演进** `PageHeader` + 一句话 + 单 Primary 槽 | `page-header.tsx` |
| WorkflowBackNavV1 | **冻结复用** 禁止重写语义 | `workflow-back-nav-v1.tsx` |
| NextActionBarV1 | **新建** 底栏左右上一步/下一步 | 部分页底已有零散按钮 |
| ProjectSwitcher | **演进** 产品化文案，去掉不明数字 | `project-switcher.tsx` |

## 2. 任务与状态

| 规划名 | 策略 | 现有基础 |
| --- | --- | --- |
| TaskCardV1 | **演进** | `task-center.tsx` `ResumeWorkCard` |
| StatusBadgeV2 | **演进** 只显示人话 | `production-status-badge.tsx` `ui/badge.tsx` |
| EmptyStateV2 | **演进** 行动导向文案 | `empty-state.tsx` |
| InlineActionErrorV1 | **新建/替换位置** 贴操作点 | `ui/error-state.tsx` `ProductErrorState`（现常在页顶，要改用法） |
| AsyncTaskProgressV1 | **演进** 真实阶段 | `ui/ai-task-state.tsx` |

## 3. 内容生产

| 规划名 | 策略 | 现有基础 |
| --- | --- | --- |
| TopicSummaryCardV2 | **重构外观** 默认摘要卡 | `content-planning-topics.tsx` `TopicCardV3` `content-planning-week-overview.tsx` |
| TopicDetailDrawerV1 | **新建** 同时只开一条 | 现默认长列表展开 |
| LearningContextSummaryV1 | **演进** | `planning-accepted-feedback-notice.tsx` `learning-summary-card.tsx` |
| FeedbackHandoffSummaryV2 | **演进** | `feedback-handoff-ux-v5.tsx` |
| ScriptEditorV2 | **重构布局** 去双滚动 | `script-detail.tsx` `script-editor.tsx` `script-source-form.tsx` `script-production-queue.tsx` |
| VideoReviewPanelV2 | **重构布局** 播放器优先 | `video-detail.tsx` `final-review-checklist.tsx` `human-review-bar.tsx` `video-variant-panel.tsx` |
| VersionHistoryDrawerV1 | **新建统一抽屉** | `content-planning-history.tsx` `video-history.tsx` 脚本历史块 |

## 4. 发布 / 数据 / 复盘

| 规划名 | 策略 | 现有基础 |
| --- | --- | --- |
| ManualPublishWorkflowV2 | **串成 5 步** | `manual-publish-card-v5.tsx` `manual-publish-guide.tsx` `publication-complete-form.tsx` `publication-source-form.tsx` |
| MetricsSummaryV2 | **演进** | `published-post-summary-v5.tsx` `trend-cards-v5.tsx` |
| MetricsTrendV1 | **新建轻量** 2 点折线/sparkline | 现偏表格 |
| RecommendationCardV2 | **压缩默认 3 条** | `recommendation-review-v5.tsx` |
| TechnicalDetailsPanel | **新建统一折叠** | 各页散落 UUID/SHA |

## 5. 表单与基础 UI

继续用：`Button` `Textarea` `SmartFormField` `Dialog` `HumanReviewBar` `ExplanationDetails` `ProductionContextHeaderV3`（项目内可降级，避免与 CompactHeader 重复）。

## 6. 不在正常 UI 新建的东西

不要新做：AgentRun 查看器、token 用量卡、HIGH_* 调试条、execution plan 面板（`production-plan-panel.tsx` 对普通用户默认隐藏，仅 TechnicalDetails）。

## 7. 页面改造强度

### 需全页重设计

- 内容计划
- 选题与脚本
- 视频制作
- 发布与数据（项目内）
- AI复盘（monitoring 详情 + project performance）
- 工作台信息架构（任务中心化，减看板）

### 需局部重设计

- App shell / 项目壳 / 项目头
- 项目概览
- 账号定位（主次信息折叠）
- 数据录入表单
- 数据历史（合并双表）
- 项目切换器、空状态、错误位置
- Onboarding 文案与跳转

## 8. Phase A 组件映射（2026-09-16）

### REUSE

- `AppShell`（演进为 V2，未平行新建 AppShellV2 文件）
- `GLOBAL_NAV` / `GLOBAL_NAV_V2`
- `ProjectShell` + `PROJECT_NAV`
- `ProjectSwitcher`
- `WorkflowBackNavV1` + `resolveWorkflowBackNav`（禁止 router.back）
- `PageHeader` / `Breadcrumb` / `Button` / `Card` / `EmptyState` / `Dialog` / `Input` / `Badge` / `Tabs` / `Table`
- `SmartFormFieldV1` / `HumanReviewBar` / `TechnicalDetailsPanel`（从 error-state 抽出并复用）
- `loadProjectStatus` facts（✓ 不根据 URL 假装完成）
- `statusLabel` → 委托 `getUserFacingStatus`

### REFACTOR

- `globals.css` tokens（在 `--acf-*` 上扩展）
- `Button` sizes/loading/disabled
- `Card` variants
- `StatusBadge` → StatusBadgeV2 mapper
- `project-nav` 7 项 + workflow marks
- `project-shell` compact header + 项目资料折叠
- `app-shell` sticky header + PageContainerV2（非 project workspace）
- `project-switcher`「全部项目」、去掉无语义数字

### NEW

- `PageContainerV2`
- `WorkflowPageHeaderV1`
- `NextActionBarV1`
- `InlineActionErrorV1`
- `AsyncTaskProgressV1`（仅 UI，不接管任务逻辑）
- `getUserFacingStatus` / `getStatusTone`

### DEPRECATE（正常 UI 不再作为产品入口；路由未删）

- 顶栏「全部」无语义短词
- 工程导航：Agent 测试、独立 `/dashboard/agents|content-planning|scripts|videos|assets`
- 页面内联 `status === "COMPLETED" ? "COMPLETED"` 文案（业务页仍有比较逻辑，展示应走 mapper；遗留工程页仍 raw）
- 平行 `router.back` 返回

### 可复用（外观跟随 DS，逻辑不动）

- `WorkflowBackNavV1`
- 登录/注册
- 设置页骨架
- 市场调研/策略等资料页（继续藏在项目资料）
- 隐藏的 legacy Agent 调试路由

## 9. Phase C 组件映射（2026-09-16）

### REUSE
- PositioningForm / executeAndAwaitPositioning / confirmContentPlan / createContentPlan
- ignoreAcceptedPerformanceFeedback
- WorkflowPageHeaderV1 / WorkflowBackNavV1 / Dialog / AsyncTaskProgressV1 / InlineActionErrorV1
- TopicCardV3 名称保留，改为摘要卡

### REFACTOR
- positioning/page.tsx 确认页
- content/plans/page.tsx summary-first + DRAFT 优先展示
- content-planning-history → VersionHistoryDrawerV1
- positioning-summary 四项 + 来源

### NEW
- LearningContextSummaryV1
- TopicDetailDrawerV1
- resolveTopicUserFacingV2
- selectDisplayPlan
- positioningSourceLabel

### 未改
- 视频/发布/复盘页

## 10. Phase D 组件映射（2026-09-16）

### REUSE
- createScript / confirmScript / updateScriptDraft / archiveScript
- resolveScriptWorkspaceSelection / latestScriptForTopic
- HumanReviewBar / Dialog / AsyncTaskProgressV1 / InlineActionErrorV1 / NextActionBarV1
- TopicDetailDrawerV1

### REFACTOR
- content/scripts/page.tsx 工作区（不再用 WorkspacePageShell）
- ScriptProductionQueue → ScriptTopicQueueV1
- ScriptEditor → ScriptEditorV2 稿子分区
- ScriptHistory → VersionHistoryDrawerV1 只读

### NEW
- ScriptReviewPanelV2
- selectWorkspaceScript / scriptWorkspaceStatusLabel
- unsaved switch guard

### 未改
- 发布/复盘页

## 11. Phase E 组件映射（2026-09-16）

### REUSE
- acceptFinalVideo / createVideo / retryVideo / exportVideoFile / fetchVideoPreview
- VideoFinalAcceptance current flag / eligiblePublishVideos
- HumanReviewBar / FinalReviewChecklistV4 / ManualPublishGuideV4
- AsyncTaskProgressV1 / InlineActionErrorV1 / NextActionBarV1

### REFACTOR
- content/videos/page.tsx 去掉 WorkspacePageShell
- VideoDetail → VideoPreviewPanelV2
- VideoVariantPanelV4 仅真实横版
- VideoHistory → VersionHistoryDrawerV1

### NEW
- VideoReviewPanelV2
- resolveVideoWorkspaceSelection / isCurrentFinalAcceptance / isArtifactReady

### 未改
- AI 复盘卡片密度与 HIGH_* 呈现（Phase G）

## 12. Phase F 组件映射（2026-09-16）

### REUSE
- eligiblePublishVideos / pendingManualPublishVideos / isRegistrationFormVisible / completeManualPublication / createPublication
- createManualMetrics / listPublicationMetrics / hoursSince / displayMetricValue / trendPercent
- ManualPublishCardV5 / PublicationCompleteFormFields / WorkflowBackNavV1 / NextActionBarV1
- RecommendationReviewV5（详情页保留，产品化留给 G）

### REFACTOR
- projects/[projectId]/publish/page.tsx 五步工作流 + 当前计划隔离
- monitoring/page.tsx 摘要卡
- monitoring/[publishedPostId]/page.tsx summary + trend + 单历史表
- metrics-history-v5 去掉 PerformanceHistory 双表
- performance-metric-form 人话字段

### NEW
- PublishWorkflowStepsV1
- MetricsSummaryV2
- MetricsTrendV1
- pendingProductionPublishVideos / resolvePublishCurrentVideo

### 未改
- 建议审核语义与 persistRecommendationReviewAndReload

## 13. Phase G 组件映射（2026-09-16）

### REUSE
- loadOrCreatePerformanceAnalysis / persistRecommendationReviewAndReload / reviewItemsFromAnalysis
- evidenceForInsight / hoursSince / displayMetricValue / trendPercent
- MetricsSummaryV2 / WorkflowPageHeaderV1 / NextActionBarV1 / TechnicalDetailsPanel
- mayShowBenchmarkClaim / mayShowRetentionClaim / hasCausalLanguage / notAutoAppliedCopy

### REFACTOR
- projects/[projectId]/performance/page.tsx 单页复盘工作区
- monitoring/[publishedPostId]/page.tsx 去掉建议第二 tab
- recommendation-review-v5 → RecommendationCardV2 默认 3 条
- feedback-handoff-ux-v5 → FeedbackHandoffSummaryV2

### NEW
- ObservationCardV2
- RecommendationCardV2
- FeedbackHandoffSummaryV2
- LearningLoopV1
- AiReviewWorkspaceV1
- ai-review.workspace.ts

### 未改
- 分析引擎、recommendation ID、accepted-only 过滤、规划注入

## 14. Phase H 组件映射（2026-09-16）

### REUSE
- FirstRunOnboardingV1 / ContextualGuidanceV1 / Dialog / NextActionBarV1 / EmptyStateV2 / InlineActionErrorV1
- AppShell / ProjectShell / ScriptTopicQueueV1 compact

### REFACTOR
- first-run：仅 0 project；3 步 + 创建第一个项目 + 了解工作流程
- NextActionBar 下一阶段弱化；主流程页去掉壳层重复栏
- 1024：项目导航 aria-expanded；脚本队列 collapsible；计划卡最多 2 列；发布步骤单列

### NEW
- WorkflowOverviewDialog
- PositioningFirstStepNotice
- onboarding-phase-h / accessibility-phase-h / phase-h selfchecks

### 未改
- 业务 API、schema、Agent、发布/复盘语义
