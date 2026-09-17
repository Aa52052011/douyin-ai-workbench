# Implementation Waves

禁止一次改全站。每阶段：build → selfcheck → **browser manual acceptance** → freeze → 下一阶段。

业务逻辑 / 后端 / 数据库 / Agent / 发布模式：0 变更。若某视觉改动需要新 API，**停下来等人工批准**，本蓝图默认不需要。

## Phase A — App Shell + Design System + Navigation

- Token 收敛（圆角 8/12、主按钮 brand、去掉正式壳 issue badge）
- AppShell 顶栏、ProjectCompactHeader、ProjectWorkflowNav（✓/●/○）
- 侧栏增加「AI复盘」入口（复用现路由）
- Global nav 语义不变
- 扩展 WorkflowBackNavV1 覆盖缺口，不平行实现
- NextActionBarV1 骨架

退出标准：1280/1440 壳层不溢出；返回链接刷新仍对。

**Status 2026-09-16:** IMPLEMENTED（壳 + DS + nav）。Browser Validation NOT_RUN；不自动进入 Phase B。

## Phase B — Dashboard + Project Overview

- Continue / Needs Attention / Recent / Empty
- 概览进度与下一步，去掉与工作台重复的看板
- 创建项目成功 → 定位页

**Status 2026-09-16:** IMPLEMENTED（工作台任务中心 + 项目概览）。Browser Validation NOT_RUN；不自动进入 Phase C。

## Phase C — Positioning + Content Planning

- 定位主次折叠与来源标记
- 计划摘要卡 + Drawer；DRAFT 占主位
- LearningContextSummary / 忽略建议（已有 ignore 标志，只改呈现）
- 历史计划进抽屉

**Status 2026-09-16:** IMPLEMENTED（定位确认页 + 内容计划 summary-first）。Browser Validation NOT_RUN；不自动进入 Phase D。

## Phase D — Scripts

- 队列 + 编辑器；去双滚动
- 单 Primary「确认脚本」

**Status 2026-09-16:** IMPLEMENTED（Script Workspace summary-first）。Browser Validation NOT_RUN；不自动进入 Phase E。

## Phase E — Video review / export

- 三态页；真实进度；播放器比例
- 确认最终成片绑定已有 acceptance
- 下载文案 DOWNLOAD_STARTED

**Status 2026-09-16:** IMPLEMENTED（Video Review Workspace）。Browser Validation NOT_RUN；不自动进入 Phase F。

## Phase F — Publish + Monitoring

- 五步向导
- 指标 summary + 轻量趋势 + 单历史表
- 录入 0 vs 空

**Status 2026-09-16:** IMPLEMENTED（Publish + Monitoring）。Browser Validation NOT_RUN；不自动进入 Phase G。

## Phase G — AI review + feedback handoff

- 人话复盘、默认 3 条、persisted 三按钮
- 回流说明「仅参考」
- HIGH_* 只在技术详情

**Status 2026-09-16:** IMPLEMENTED（AI Review + Feedback Handoff）。Browser Validation NOT_RUN；不自动进入 Phase H。

## Phase H — Onboarding + responsive + a11y

- 轻量 onboarding
- 1024 右栏下沉
- focus / dialog / contrast / reduced motion 人工清单

**Status 2026-09-16:** IMPLEMENTED（Onboarding + Responsive + Accessibility baseline）。ONBOARDING_PERSISTENCE=LOCAL。Browser Validation NOT_RUN；不自动进入 Phase I。

## Phase I — Full-product visual acceptance

- 1920–1024 真浏览器走主路径
- 才允许将 `BROWSER_VISUAL_ACCEPTANCE` 从 NOT_COMPLETED 改为有条件 PASS
- 无浏览器不得标 PASS

## 依赖与风险

- `WorkflowBackNavV1` 已验收：只加页面，不改已通过语义。
- 内容计划 / 脚本超长是用户痛点，C/D 优先于装饰。
- 复盘绑定已真实存在：G 是呈现，不是补后端。
- Landscape：E 阶段按 artifact 有无显示，不新造导出 API。
