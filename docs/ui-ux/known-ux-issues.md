# UI_UX_KNOWN_ISSUE_REGISTRY

重设计必须消化下列问题，不得遗漏。编号稳定，实施时在对应 Phase 关闭并防回归。

## 当前产品问题（1–50）

| ID | 问题 | 消化位置 |
| --- | --- | --- |
| 1 | 工程控制台感过强 | Shell + DS + 文案 |
| 2 | 视觉层级弱 | DS typography / cards |
| 3 | 页面超长 | G15 摘要优先 |
| 4 | 页面内嵌套滚动 | G20；脚本/视频 |
| 5 | 主任务不明显 | G16；每页一 CTA |
| 6 | 下一步位置不统一 | NextActionBarV1 |
| 7 | 返回上一步缺失 | WorkflowBackNavV1 全覆盖 |
| 8 | 相同主 CTA 重复 | **PARTIAL_IN_PHASE_H**。计划页 duplicate CTA 已收敛；部分页仍有 Confirm + NextActionBar 并存但下一阶段已弱化。 |
| 9 | 状态改变不明显 | StatusBadgeV2 |
| 10 | 项目头信息重复占空间 | ProjectCompactHeaderV1 |
| 11 | 顶栏 / 左侧职责重叠 | IA：一级全局 vs 二级流程 |
| 12 | 技术术语暴露 | status-language-map |
| 13 | 状态文案不统一 | 同上 |
| 14 | AI 值来源不直观 | **CLOSED_IN_PHASE_C**。定位四项来源标记。 |
| 15 | 已知信息重复填写 | G4/G5；资料复用 |
| 16 | 空状态工程化 | EmptyStateV2 |
| 17 | 错误远离操作点 | InlineActionErrorV1 |
| 18 | 长任务反馈弱 | AsyncTaskProgressV1 |
| 19 | 内容计划展开过长 | **CLOSED_IN_PHASE_C**。Topic summary + drawer。 |
| 20 | 内容计划信息重复 | **CLOSED_IN_PHASE_C**。详情按需打开；周览/焦点折叠。 |
| 21 | 脚本页面过长 | **CLOSED_IN_PHASE_D**。摘要工作区 + 制作建议折叠。 |
| 22 | 脚本正文 / 审核双滚动 | **CLOSED_IN_PHASE_D**。去掉 WorkspacePageShell 嵌套滚动。 |
| 23 | 视频预览与操作失衡 | **CLOSED_IN_PHASE_E**。Preview 主区 + Review 侧栏/下栏。 |
| 24 | 历史视频关系不清晰 | **CLOSED_IN_PHASE_E**。历史版本抽屉只读。 |
| 25 | 下载和发布流程割裂 | **CLOSED_IN_PHASE_E**。确认后下载 + 前往发布与数据。 |
| 26 | 发布登记流程割裂 | **CLOSED_IN_PHASE_F**。五步工作流。 |
| 27 | 数据录入机械 | **CLOSED_IN_PHASE_F**。compact 两列人话字段。 |
| 28 | 两套历史数据表重复 | **CLOSED_IN_PHASE_F**。单表 + 查看全部。 |
| 29 | 数据趋势缺图形 | **CLOSED_IN_PHASE_F**。MetricsTrendV1。 |
| 30 | AI复盘入口过深 | **CLOSED_IN_PHASE_G**。项目 AI复盘单页工作区。 |
| 31 | AI复盘过于技术化 | **CLOSED_IN_PHASE_G**。Observation / Recommendation 人话。 |
| 32 | HIGH_* code 暴露 | **CLOSED_IN_PHASE_G**。正常 UI 隐藏，仅技术详情。 |
| 33 | 建议全部展开超长 | **CLOSED_IN_PHASE_G**。默认 3 条 + 查看另外 N 条。 |
| 34 | 采纳操作视觉弱 | **CLOSED_IN_PHASE_G**。卡片内决定 + persisted 状态。 |
| 35 | AI 学习价值感知不足 | **CLOSED_IN_PHASE_C**。LearningContextSummaryV1。 |
| 36 | 反馈进入新计划偏工程 | **PARTIAL_IN_PHASE_C**。已采纳建议人话展示；ignore 仅生成前。 |
| 37 | 工作台任务中心感不足 | **CLOSED_IN_PHASE_B**。Continue / Needs Attention / Recent / Empty。 |
| 38 | 新用户 onboarding 不完整 | **CLOSED_IN_PHASE_H**。0 项目 3 步 + 可跳过 + 工作流 Dialog；定位首次 notice。 |
| 39 | 项目切换器不够产品化 | Switcher 文案 |
| 40 | 顶部「全部 / 12345」意义不明 | 禁止无语义数字 |
| 41 | dev issue badge 出现在正式产品 | 正式壳删除 |
| 42 | 组件视觉不一致 | DS + Button 收敛 |
| 43 | spacing/radius/border/shadow 不一致 | design-system-v2 |
| 44 | 主按钮黑过多、优先级乱 | 每页一个 primary brand |
| 45 | 响应式未真正视觉验收 | **PARTIAL_IN_PHASE_H**。布局 selfcheck；Browser Validation NOT_RUN。 |
| 46 | accessibility 未完整人工验收 | **PARTIAL_IN_PHASE_H**。focus/aria/dialog 代码基线；真键盘验收留给 Phase I。 |
| 47 | BROWSER_VISUAL_ACCEPTANCE 未完成 | Phase I |
| 48 | AI_CONVERSATION_CONTEXT_DATA_GAP | Known limitation；UI 不假装有对话记忆 |
| 49 | REVIEW_SESSION_FACT_DATA_GAP | 审核清单是辅助，不以未持久化 session 当事实 |
| 50 | LANDSCAPE_EXPORT_CURRENT_API_LIMITATION | 仅当存在 landscape artifact 才提供横版；否则不暗示可下载横版 |

## Phase A 关闭（仅壳层 / 全局基础设施，2026-09-16）

| ID | 结果 |
| --- | --- |
| 1 工程控制台感 | **CLOSED_FOR_SHELL**。业务长页仍工程感，留给后续 Phase。 |
| 6 下一步位置 | **PARTIAL**。`NextActionBarV1` 已挂项目壳；页面顶 CTA 未清重复（禁止改业务流程）。 |
| 10 项目头重复 | **CLOSED**。Compact header；长介绍进「项目资料」。 |
| 11 顶栏/侧栏职责 | **CLOSED**。全局四项 vs 项目流程七项。 |
| 12 技术术语 | **PARTIAL**。壳层与 mapper 人话；遗留工程路由与部分业务页仍有 raw。 |
| 13 状态文案 | **PARTIAL**。中央 mapper 已立；业务页未全替换。 |
| 16 空状态 | **PARTIAL**。EmptyStateV2 API 统一；未改各业务空文案。 |
| 39 项目切换器 | **CLOSED**。显示项目名 + 真实 updatedAt。 |
| 40 「全部」/ debug 数字 | **CLOSED**。改为「全部项目」。 |
| 42/43 组件与 spacing | **CLOSED_FOR_FOUNDATION**。token 阶已统一；旧页仍有杂间距。 |
| 44 黑按钮 | **PARTIAL**。Button V2 brand primary；业务页大量原生 button 未改。 |

未关闭（后续 Phase）：8、15、41、47–50。Issue 23/24/25 在 Phase E 关闭。Issue 26–29 在 Phase F 关闭。Issue 30–34 在 Phase G 关闭。Issue 38 在 Phase H 关闭。Issue 45/46 在 Phase H 仅代码基线，视觉/人工验收在 Phase I。

## Phase B 关闭（2026-09-16）

| ID | 结果 |
| --- | --- |
| 37 工作台任务中心 | **CLOSED**。Continue / 需要处理 / 最近项目 / 空态。 |
| 创建后找不到项目 | **CLOSED**。成功进入账号定位。 |
| 创建无反馈 | **CLOSED**。「正在创建项目…」+ InlineActionError。 |

## Phase C 关闭（2026-09-16）

| ID | 结果 |
| --- | --- |
| 19 CONTENT_PLAN_LONG_PAGE | **CLOSED**。7 条默认摘要卡。 |
| 20 CONTENT_PLAN_INFORMATION_DUPLICATION | **CLOSED**。详情进 Drawer。 |
| 历史计划占正文 | **CLOSED**。VersionHistoryDrawer 次要。 |
| 定位信息密度 | **CLOSED**。四项摘要 + 更多设置。 |
| 14 来源标记 | **CLOSED**。你填写 / 复用 / AI 已整理 / AI 建议。 |
| 35 Learning Context | **CLOSED**。 |
| DUPLICATE_PLAN_CTA | **CLOSED**。页级唯一 brand「开始制作第一条脚本」；ConfidenceActionCard 不再带 continueHref；NextActionBar 下一阶段弱化。 |

## Phase D 关闭（2026-09-16）

| ID | 结果 |
| --- | --- |
| 21 SCRIPT_LONG_PAGE | **CLOSED**。Topic 上下文 + 稿子 + 当前动作。 |
| 22 SCRIPT_DOUBLE_SCROLL | **CLOSED**。document scroll；队列可 overflow。 |
| SCRIPT_CURRENT_OBJECT_NOT_CLEAR | **CLOSED**。第 N 条 + 标题 + 状态。 |
| SCRIPT_HISTORY_DOMINATES | **CLOSED**。历史版本抽屉只读。 |
| SCRIPT_PRIMARY_ACTION_HIERARCHY | **CLOSED**。无脚本/待确认/已确认各一个 primary。 |
| SCRIPT_TECHNICAL_METADATA_EXPOSURE | **CLOSED**。正常区无 payload/UUID/AgentRun。 |

## Phase E 关闭（2026-09-16）

| ID | 结果 |
| --- | --- |
| 23 VIDEO_LAYOUT / PREVIEW_REVIEW_IMBALANCE | **CLOSED**。Preview 主区；1024 单列。 |
| VIDEO_ORIENTATION_UX | **CLOSED**。仅真实 landscape artifact 显示横版。 |
| 24 VIDEO_CURRENT_HISTORY_RELATION | **CLOSED**。历史抽屉只读。 |
| VIDEO_REVIEW_ENGINEERING_FORM | **CLOSED**。Human decision + 辅助 checklist 不自动确认。 |
| 25 VIDEO_DOWNLOAD_PUBLISH_DISCONNECT | **CLOSED**。确认后下载 + 前往发布。 |
| VIDEO_RESPONSIVE_1024 | **CLOSED**。max-xl 单列。 |
| VIDEO_TASK_PROGRESS_UI | **CLOSED**。AsyncTaskProgressV1，无假百分比。 |

## Phase F 关闭（2026-09-16）

| ID | 结果 |
| --- | --- |
| 26 PUBLISH_FLOW / REGISTRATION_FRAGMENTED | **CLOSED**。项目内五步：准备成片 → 手动发布 → 登记作品 → 录入数据 → 查看表现。 |
| DOWNLOAD_PUBLISH_FRAGMENTED | **CLOSED**。下载 COPY_STARTED 后接手动发布卡；`我已经发布` 打开登记区。 |
| 27 METRIC_ENTRY_MECHANICAL | **CLOSED**。两列录入；播放 / 新增粉丝 / 观察时间 / 保存本次数据。 |
| 28 MONITORING_DOUBLE_TABLE | **CLOSED**。仅 `MetricsHistoryV5` 单表；默认 3 行 + 查看全部历史。 |
| 29 CURRENT_HISTORY_HIERARCHY / 趋势 | **CLOSED**。`MetricsSummaryV2` + `MetricsTrendV1`。 |
| PUBLICATION_TRUTH_COPY | **CLOSED**。USER_ASSERTED → 用户已登记；登记 ≠ 平台验证。 |
| METRICS_ZERO_NULL_UI | **CLOSED**。0 显示「0」；空显示「—」；0→1 无无限百分比。 |

## Phase G 关闭（2026-09-16）

| ID | 结果 |
| --- | --- |
| AI_REVIEW_DENSITY | **CLOSED**。摘要 + 最多 3 条观察 + 前 3 条建议 + 回流。 |
| AI_REVIEW_ENGINEERING_LANGUAGE | **CLOSED**。无 HIGH_* / raw enum / recommendationId。 |
| FEEDBACK_REVIEW_VISUAL_HIERARCHY | **CLOSED**。事实突出，解释次级，不确定性 muted。 |
| RECOMMENDATION_ACTIONABILITY_UI | **CLOSED**。建议动作 / 依据 / 为什么 / 决定。 |
| RECOMMENDATION_STATUS_VISIBILITY | **CLOSED**。未审核 / 已采纳 / 不采纳 / 稍后再看。 |
| FEEDBACK_HANDOFF_VISIBILITY | **CLOSED**。FeedbackHandoffSummaryV2 计数 + accepted-only。 |
| AI_LEARNING_VALUE_VISIBILITY | **CLOSED**。学习循环 + 已采纳进入下一轮参考。 |
| ANALYSIS_FAILURE_VS_SAVE_FAILURE_COPY | **CLOSED**。生成失败 ≠ 保存失败。 |

## 已修复、必须防回归

| 规则 | 说明 |
| --- | --- |
| DOWNLOAD_STARTED only | 下载只能宣称已开始，不能写下载完成 |
| USER_ASSERTED ≠ platform verified | 登记 ≠ 平台验证 |
| historical completed videos 不得进入待发布 | 待发布只含当前最终成片链路 |
| final accepted video 必须持久化 | `VideoFinalAcceptance` |
| publication 必须绑定 final accepted video | 禁止未确认成片登记 |
| zero ≠ null | 0 是真实 0 |
| evidence 绑定对应 metric | 不得串用播放量解释点赞 |
| observation duration | snapshot `observedAt` 差 |
| recommendation review 持久化 | refetch 后仍保持 |
| ACCEPTED-only handoff | REJECTED/DEFERRED/PENDING 不进规划 |
| no auto apply | 建议不作硬约束 |
| no auto content plan generation | 必须用户点生成 |
| no fake browser acceptance | 无浏览器不得标 Browser PASS |

## Phase H 关闭（2026-09-16）

| ID | 结果 |
| --- | --- |
| ONBOARDING_INCOMPLETE / 38 | **CLOSED**。0 项目 3 步；了解工作流程 Dialog；可跳过；returning 不弹。 |
| 创建后首次引导 | **CLOSED**。定位页 `PositioningFirstStepNotice`，localStorage，不挡主 CTA。 |
| DUPLICATE_PLAN_CTA | **CLOSED**。折叠置信卡去掉 continueHref。 |
| NextActionBar 重复页 CTA | **CLOSED**。下一阶段弱化；主流程页去掉壳层双栏。 |
| RESPONSIVE_NOT_AUDITED | **PARTIAL**。1024/1280 布局类落地；无 Playwright。 |
| ACCESSIBILITY_BASELINE_INCOMPLETE | **PARTIAL**。focus-visible、dialog trap、aria-current/expanded、labels。 |
| TECHNICAL_TERMINOLOGY_RESIDUAL | **CLOSED_FOR_PRODUCT_ROUTES**。正常项目路由无 HIGH_/sourceAgentRunId；dev routes 仍允许。 |
| GLOBAL_EMPTY / LOADING / ERROR | **CLOSED_FOR_CORE_PAGES**。EmptyStateV2 + skeleton aria-busy + InlineActionErrorV1。 |
| DESIGN_TOKEN_ESCAPE_CORE_PAGES | **PARTIAL**。核心页收敛；video black / ConfidenceActionCard 中性色仍为例外。 |
| BROWSER_VISUAL_ACCEPTANCE | **OPEN**。Phase I。 |

## Known Limitations（更新后）

| ID | 状态 2026-09-16 |
| --- | --- |
| AI_CONVERSATION_CONTEXT_DATA_GAP | OPEN。UI 不得声称「记住了多轮对话」。可复用的是定位/计划/已采纳建议等结构化上下文。 |
| REVIEW_SESSION_FACT_DATA_GAP | OPEN。checklist 辅助；最终以确认成片 / 确认脚本的持久化为准。 |
| FULL_PERFORMANCE_ANALYSIS_UI_BINDING | **CLOSED_FOR_PRODUCT_UI**（Phase G）。分析/建议/审核仍走原 API；本阶段只改呈现。 |
| RECOMMENDATION_REVIEW_PERSISTENCE | **REAL_USER_PASS**（刷新保持 ACCEPTED/REJECTED/DEFERRED/PENDING）。UI 仍须 refetch，不得只信本地 state。 |
| FINAL_VIDEO_UI_CONFIRMATION | **已持久化** `VideoFinalAcceptance`。UI 须读该事实，不另造「看起来确认了」。 |
| LANDSCAPE_EXPORT_CURRENT_API_LIMITATION | OPEN。有 `variant=landscape` 与 landscape asset 时才可下载；无 artifact 不得承诺。 |
| BROWSER_VISUAL_ACCEPTANCE_NOT_COMPLETED | OPEN。本 spec 阶段不关闭。 |
| MANUAL_PUBLICATION_MODE | FROZEN。 |
| PLATFORM_VERIFICATION_NOT_AVAILABLE | FROZEN。 |
| NO_AUTOMATIC_DOUYIN_METRICS | FROZEN。仅人工录入。 |
| DOUYIN_OFFICIAL_PUBLISH_DEFERRED | FROZEN POST_V1。 |
