# Phase I.5 Visual Color and Action Emphasis Report

Date: 2026-09-17
Mode: token-first visual only. Frozen 9 browser routes not redesigned.

---

## 1. Scope

扩展现有 `--acf-*`：页面底色、Brand Primary、状态色、Button/Card/Badge、导航 current/completed、指标正增长、回流计数着色。未改布局、路由、文案语义、工作流、数据。

## 2. Frozen Routes

Dashboard / Projects / Overview / Positioning / Planning / Scripts / Video / Publish / AI Review — 结构保持。

## 3. Visual Direction

SIMPLE_COMFORTABLE_RESTRAINED。无渐变、neon、glass、大面积彩色。

## 4. Color Tokens

集中于 `globals.css` `:root`。新增 `--acf-brand-soft-strong`、`--acf-brand-border`。

## 5. Brand Color

`#176B5B` / hover `#125648` / active `#0F4A3F` / soft `#EAF4F1`。

## 6. Page Background

`#F7F8F6`（`--acf-page`）。卡片白底。

## 7. Surface System

Surface `#FFFFFF`；muted `#F2F4F1`；border `#E2E7E3`；strong `#CBD5CF`。Card 仅 `0 1px 2px rgba(15,23,42,0.04)`。

## 8. Primary Button

实心 Brand + 白字 + 同色边；hover/active 加深；disabled 灰色。`font-medium`。

## 9. Secondary Button

白底 + Brand Border + Brand 文字；hover Brand Soft。非实心主色。

## 10. Ghost/Text Action

次要文字 + hover Brand Soft。NextActionBar 下一阶段仅为 Brand 文字链。

## 11. Navigation Active State

顶栏 active：`acf-nav-active`（Brand Soft + Brand 字）。逻辑未改。

## 12. Project Sidebar

Current/active：Brand Soft + 左 2px accent。Completed 图标 Success。Todo muted。✓●○ 未改。

## 13. Current Step Style

`acf-stage-current` 用于概览 NextActionCard。优先 topic、脚本 queue 选中项 Brand Soft。

## 14. Completed State

Success 文字/图标，非整卡绿。

## 15. Pending State

Neutral / muted。

## 16. Info/AI State

Info token 保留；运行中 badge 用 Brand Soft（当前/进行中）。

## 17. Warning State

`--acf-warning` + Warning Soft。登记未验证提示、稍后再看。

## 18. Error State

`InlineActionErrorV1` 仍 Danger Soft。不采纳不用红。

## 19. Dashboard

继续处理仍 Brand 实心；进入项目仍描边 secondary。结构未改。

## 20. Projects

创建/进入按钮走 Button token。列表结构未改。

## 21. Overview

当前阶段 left accent；继续下一步 Primary。无 NextActionBar。

## 22. Positioning

未改确认逻辑与四卡结构；按钮走全局 variant。

## 23. Planning

优先 topic Brand Soft 边；其余行中性。未恢复双列或重复 CTA。

## 24. Scripts

选中 queue Brand Soft；✓ Success。未改 queue 布局与选中逻辑。

## 25. Video

空态「返回脚本」仍 EmptyState primary。无历史 v1 展示改动。

## 26. Publish/Data

「去视频」仍 EmptyState primary。用户已登记 Brand Soft pill；truth copy Warning Soft。文案仍「用户已登记」且未宣称平台验证。

## 27. Metrics

白卡；正增长 `acf-metric-up`。未新增图表。

## 28. AI Review

回流 CTA 仍唯一实心 Primary。已采纳 Success；不采纳 muted；稍后再看 Warning。审核 persistence 未改。

## 29. Feedback Handoff

计数着色；accepted-only 句在 Brand Soft 条上。文字未改。

## 30. NextActionBar

弱导航；下一阶段 Brand 文字，非实心按钮。

## 31. Status Badge

Success / Brand Soft progress / Warning / Danger / Neutral。REJECTED mapper → neutral。USER_ASSERTED → progress（Brand Soft）。

## 32. Forms

白底 + strong border；focus-visible Brand 边。

## 33. Details/Accordion

未改默认收起；未整块上色。

## 34. Dialog/Drawer

未改 open/close、焦点、overlay 挂载。面板仍白底。

## 35. Interaction Lock Regression

无 overflow-x clip。Dialog 关闭 return null。

## 36. Responsive Regression

未改 breakpoint / grid / width。

## 37. Accessibility Baseline

`:focus-visible` Brand ring。状态仍有文字/✓●○。不宣称 WCAG PASS。

## 38. Hardcoded Color Audit

产品冻结页主要 token 化。保留：视频播放器 `bg-black`、legacy 工程页黑按钮（非 9 路线）。未机械替换所有 black。

## 39. Frozen Route Regression

Layout Changed: **NO**
Route Changed: **NO**
Business Logic Changed: **NO**
Primary Action Semantics Changed: **NO**

## 40–49. Mutations

Business Logic / Backend / Database / Agent / Provider / LLM: 0
.env: NO
Real Data: NO
Route Changes: 0
Git Mutation: NO

## 50. Selfchecks

phase-a … phase-h PASS
final-ui-regression PASS
visual-color-system PASS

## 51. Frontend Build

PASS（`tsc --noEmit`, `next build`）

## 52. Browser Validation

NOT_RUN

## 53. Gate

READY_FOR_VISUAL_COLOR_BROWSER_ACCEPTANCE
