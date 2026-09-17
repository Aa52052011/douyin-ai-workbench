# Status Language Map

普通 UI 只显示「用户文案」。内部值仅 TechnicalDetailsPanel。

## Agent / 任务

| Internal | User-facing | Treatment |
| --- | --- | --- |
| PENDING | 等待处理 | 中性灰 badge |
| RUNNING / PROCESSING / GENERATING | 正在处理 | info + 进度，禁止假百分比 |
| COMPLETED | 已完成 | success |
| FAILED | 处理失败 | danger + 贴旁重试 |
| CANCELLED | 已取消 | 次要灰 |

## ContentPlan / Script

| Internal | User-facing | Treatment |
| --- | --- | --- |
| DRAFT | 待确认 | warning；计划页可作主任务 |
| GENERATING | 正在生成 | info |
| READY | 已生成，待确认 | warning（若产品仍区分 READY/DRAFT，对用户都叫待确认） |
| CONFIRMED | 已确认 | success |
| ARCHIVED | 历史版本 | 次要，只在历史抽屉 |

## Video

| Internal | User-facing | Treatment |
| --- | --- | --- |
| PENDING | 尚未开始制作 | ○ |
| PROCESSING | 正在制作视频 | ● + AsyncTaskProgress |
| COMPLETED（未最终确认） | 待审核 | warning |
| COMPLETED + VideoFinalAcceptance | 最终成片已确认 | success |
| FAILED | 制作失败 | danger |

## Publication / 验证

| Internal | User-facing | Treatment |
| --- | --- | --- |
| PENDING / UPLOADING / SUBMITTING / PROCESSING | 处理中（仅技术详情） | 普通 UI 走 5 步向导，不展示状态机 |
| PUBLISHED | 已登记 | success；须同时写「用户手动发布」 |
| FAILED | 登记失败 | danger |
| UNKNOWN_EXTERNAL_STATE / CANCELLED | 状态不明 / 已取消 | 次要 |
| USER_ASSERTED | 用户已登记 | 明确「未验证」 |
| FORMAT_VALIDATED | 链接格式已检查 | 仍 ≠ 平台已验证 |
| PLATFORM_VERIFIED | 平台已验证 | **当前不可用，禁止展示为已发生** |
| MANUAL / MANUAL_IMPORT | 用户手动发布 / 人工录入 | caption |

禁止把 USER_ASSERTED 写成平台已验证。

## Recommendation review

| Internal | User-facing | Treatment |
| --- | --- | --- |
| PENDING | 未审核 | 默认 |
| ACCEPTED / APPROVED | 已采纳 | success |
| REJECTED | 不采纳 | 中性，不是错误恐吓 |
| DEFERRED | 稍后再看 | warning |

操作按钮用人话：采纳 / 不采纳 / 稍后再看。保存中… → 刷新持久化状态。

## Insight / 学习信号（禁止原样展示）

| Internal | User-facing |
| --- | --- |
| HIGH_LIKE_RATE | 点赞表现较好 |
| HIGH_COMMENT_RATE | 评论互动较活跃 |
| HIGH_SHARE_RATE | 分享有增加 |
| HIGH_FAVORITE_RATE | 收藏增长明显 |
| HIGH_VIEWS / HIGH_VIEW_RATE | 播放有增加 |
| HIGH_ENGAGEMENT_RATE | 互动整体有信号 |
| HIGH_FOLLOWER_GROWTH | 粉丝有增加 |
| LOW_* / DATA_INSUFFICIENT | 当前样本不足 / 信号弱 |
| INSUFFICIENT | 可信度：依据不足 |
| LOW / MEDIUM / HIGH（confidence） | 依据很少 / 有一定依据 / 依据较充分 |

## 工作流阶段（侧栏）

| Internal | Mark | User |
| --- | --- | --- |
| COMPLETED | ✓ | 已完成 |
| IN_PROGRESS | ● | 进行中 |
| NOT_STARTED | ○ | 未开始 |
| BLOCKED | ● + warning | 需要处理 |

## 指标空值

| 存储 | 显示 |
| --- | --- |
| null / 未填 | — 或「未填写」 |
| 0 | 0（真实零，不是缺失） |

## REMOVE_FROM_NORMAL_UI

UUID、Artifact ID、SHA、AgentRun、requestId、token usage、provider 名、HTTP status、truth gate、execution plan、raw enum、HIGH_* code。

全部进入 TechnicalDetailsPanel。
