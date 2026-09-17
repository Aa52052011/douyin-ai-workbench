# UI/UX Full Product Redesign Spec

产品：抖音 AI 智能工作台 / AI Content Factory
阶段：`UI_UX_FULL_PRODUCT_REDESIGN_SPEC`
日期：2026-09-16
状态：**等待人工确认后才可进入 Phase A 实施**

本文件是总纲。细节见同目录其他文档。历史 UX / 工程文档一律保留，本文不替代、不删除。

## 0. 本阶段边界

只做：产品设计、信息架构、页面结构、交互规范、实施蓝图。

严禁：大规模页面重构、改业务逻辑、改后端、改数据库、改 Agent、改发布模式、生成新内容、调用 LLM / TTS / Visual / FFmpeg / Douyin、改 `.env`、Git mutation。

## 1. 已冻结系统边界

| 边界 | 状态 |
| --- | --- |
| Backend business logic | FROZEN |
| Agent logic | FROZEN |
| Database business model | FROZEN |
| Real user loop | PASS / FROZEN |
| Manual publication | PRESERVED |
| Douyin official auto publish | DEFERRED_TO_POST_V1 |
| Monitoring | MANUAL_IMPORT |
| Human review | REQUIRED |
| Auto apply AI feedback | FORBIDDEN |
| Final video acceptance | PERSISTED `VideoFinalAcceptance` |
| Performance feedback handoff | ACCEPTED_ONLY |
| REJECTED / DEFERRED / PENDING | 不得成为 planning 硬约束 |

已验证闭环（不得在 UI 重设计中改语义）：

账号定位 → 内容规划 → 选题与脚本 → 视频生成 → 人工审核 → 最终成片 → 下载 → 用户手动发布抖音 → 登记作品 → 人工录入真实数据 → AI 复盘 → 人工审核建议 → ACCEPTED 进入下一轮规划 → ContentPlan v2 → 人工确认。

## 2. 设计目标

不改变已跑通功能。把偏工程控制台的界面，改成创作者 / 商家能自然完成任务的正式产品。

视觉方向：`SIMPLE_COMFORTABLE_RESTRAINED`
一条主色（已有 `--acf-brand` 冷杉绿）、中性灰、语义色。禁止大面积渐变、玻璃拟态、霓虹、装饰动画、彩色大图标堆砌。

## 3. UX 原则（全部 ACTIVE）

G1–G14 继续有效。本阶段新增并冻结：

- **UX-G15 SUMMARY_FIRST_DETAILS_ON_DEMAND**：默认只展示当前任务、关键状态、关键结果、主操作。
- **UX-G16 ONE_PAGE_ONE_JOB**：每页唯一任务。
- **UX-G17 SEMANTIC_BACK_NAVIGATION_REQUIRED**：业务页必须有「← 上一步」，不依赖 browser back；刷新 / 直链仍正确。现有 `WorkflowBackNavV1` 保留并成为标准入口。
- **UX-G18 STATUS_MUST_BE_HUMAN_READABLE**：普通 UI 禁止内部 enum / UUID / AgentRun / HIGH_*。
- **UX-G19 HISTORY_MUST_NOT_DOMINATE_CURRENT_TASK**：历史默认折叠。
- **UX-G20 NO_NESTED_SCROLL_FOR_PRIMARY_CONTENT**：禁止页面滚动 + 主卡片内再滚动。

## 4. 产品一句话心智模型

这是一个**按项目推进的周内容生产线**，不是 Agent 调试台。

用户每次只需要知道：现在该做什么、结果是什么、下一步点哪里。

## 5. 文档索引

| 文件 | 内容 |
| --- | --- |
| [information-architecture.md](./information-architecture.md) | 一二级导航、发布与数据双入口语义 |
| [page-flow-map.md](./page-flow-map.md) | 页面任务、CTA、返回/下一步 |
| [design-system-v2.md](./design-system-v2.md) | 颜色、间距、字体、按钮、卡片 |
| [component-map-v2.md](./component-map-v2.md) | 新组件 vs 现有复用 |
| [status-language-map.md](./status-language-map.md) | 内部状态 → 用户文案 |
| [known-ux-issues.md](./known-ux-issues.md) | 已知问题总账 + 防回归 |
| [implementation-waves.md](./implementation-waves.md) | Phase A–I |

## 6. 人工确认清单

确认本蓝图后，下一步只能是：

`UI_UX_IMPLEMENTATION_PHASE_A_APP_SHELL_AND_DESIGN_SYSTEM`

每一实施阶段必须：build → selfcheck → browser manual acceptance → freeze，才能进入下一阶段。
