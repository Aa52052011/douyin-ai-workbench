# Design System V2

在现有 `globals.css` CSS 变量上收敛，不另起一套皮肤。实施 Phase A 只整理 token 与组件用法，不改业务 API。

## 1. 方向

SIMPLE / COMFORTABLE / RESTRAINED
1 个 brand + 中性灰 + 4 个语义色。禁止渐变主背景、glass、neon、装饰 motion、dashboard 彩标堆砌。

## 2. Color（沿用现有 token）

| Token | 用途 |
| --- | --- |
| `--acf-brand` / `--acf-brand-hover` / `--acf-brand-subtle` | Primary 按钮、当前阶段、关键链接 |
| `--acf-bg` | 页面底 |
| `--acf-surface` / `--acf-surface-subtle` | 卡片 / 次级底 |
| `--acf-border` / `--acf-border-strong` | 分割 |
| `--acf-text` / `--acf-text-secondary` / `--acf-text-muted` / `--acf-text-disabled` | 文字层级 |
| `--acf-success*` | 已完成、已采纳、已确认 |
| `--acf-warning*` | 待确认、稍后再看、数据不足 |
| `--acf-danger*` | 失败、不采纳、破坏性 |
| `--acf-info*` | 参考、AI 已整理 |

普通 UI 主按钮用 brand，不再用「满屏黑按钮」当唯一强调（现有部分页面仍 `bg-neutral-950`，Phase A 迁到 `Button variant=primary`）。

## 3. Spacing

统一阶：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64。
现有 `--acf-space-5: 20px`、`--acf-space-10: 40px` 视为过渡；新布局优先上表。页面左右 padding 16–24；区块垂直 24–32。

## 4. Radius

新组件只用两档：

- 控件 / 小卡：8px（将 `--acf-radius-sm` 从 6 收到 8，Phase A 一次性）
- 标准卡 / 抽屉：12px（`--acf-radius-md`）

`--acf-radius-lg: 14` 停止在新代码使用。禁止一页混 4 种圆角。

## 5. Typography

| Role | 建议 | 用途 |
| --- | --- | --- |
| Page title | 20–24 / semibold | 页面标题 |
| Section title | 16 / medium | 区块 |
| Card title | 14–16 / medium | 卡片 |
| Body | 14 / regular | 正文 |
| Secondary | 13 / regular，`--acf-text-secondary` | 解释 |
| Caption | 12 / regular，`--acf-text-muted` | 时间、来源 |

一行解释不超过 40 个汉字为宜。

## 6. Button

已有 `Button`：`primary` / `secondary` / `ghost` / `danger`。

规则：一页正常只允许 **一个 Primary**。其余用 secondary/ghost。加载用 `loading`，文案「保存中… / 生成中…」，不用内部 RUNNING。

Hit target：最小高度 36px（已有 `min-h-9`）。

## 7. Cards

| 类型 | 何时用 |
| --- | --- |
| StandardCard | 表单、编辑器主体 |
| SummaryCard | 指标摘要、进度 |
| ActionCard | 下一步、待处理 |
| StatusCard | 生成中、已确认成片 |

禁止所有内容同一白框平铺。

## 8. Motion

`--acf-motion: 150ms` / `ease-out`。尊重 `prefers-reduced-motion`。无入场大动画。抽屉/手风琴仅高度与透明度。

## 9. Responsive（desktop first，本期不做手机产品化）

必须设计：1920 / 1440 / 1280 / 1024。

| 宽度 | 布局 |
| --- | --- |
| ≥1440 | 侧栏 + 主列 + 可选右动作列 |
| 1280 | 侧栏收窄，主列优先 |
| 1024 | 右 sidebar 落到主内容下方，禁止挤压正文 |

禁止：横向溢出、主按钮消失、表格不可读、主内容嵌套滚动。

本阶段**不声明** Browser Visual PASS。

## 10. Accessibility（规范，非验收声明）

- 可见 `:focus-visible`（2px brand 描边）
- 按钮用 `<button>` / 链接用 `<a>`，不把 div 当按钮
- label 关联 input
- Dialog：focus trap、Esc 关闭、关闭后焦点回到触发器
- Accordion/Drawer：键盘开关
- 对比度：正文与背景达到可读（brand 白字已存在，新灰字不得低于 secondary token）
- 点击区域 ≥ 36px
- `prefers-reduced-motion: reduce` 时停过渡

Browser accessibility 人工验收放在 Phase H/I，本阶段不标 PASS。

## 11. Phase A 落地（2026-09-16）

已在 `apps/frontend/src/app/globals.css` 与 `lib/ux/tokens.ts` 收敛，不另起第二套 token。

### Color

`--acf-page` / `--acf-surface` / `--acf-surface-muted` / `--acf-surface-elevated`
`--acf-text` `--acf-text-primary` `--acf-text-secondary` `--acf-text-muted` `--acf-text-disabled` `--acf-text-inverse`
`--acf-border` `--acf-border-subtle` `--acf-border-strong`
`--acf-brand` `--acf-brand-hover` `--acf-brand-active` `--acf-brand-soft`
semantic + `*-soft`：success / warning / danger / info

无 neon / gradient / glass。

### Spacing

`--acf-space-1`…`16`：4 / 8 / 12 / 16 / 24 / 32 / 48 / 64。已移除过渡用 20/40。

### Radius

8 / 12 / pill 999。`--acf-radius-lg` 对齐 12。

### Shadow

默认 `none`；允许 `subtle` / `overlay`。

### Typography classes

`acf-display` `acf-page-title` `acf-section-title` `acf-card-title` `acf-body` `acf-body-small` `acf-caption` `acf-label` `acf-metadata`

### Layout width

`--acf-app-max` 90rem · `--acf-content-max` 72rem · `--acf-form-max` 36rem · `--acf-reading-max` 42rem

### Button / Card

`Button`：primary / secondary / ghost / danger；sm / md / lg；loading →「处理中…」。
`Card`：standard / summary / action / status。

### Status

中央 mapper：`getUserFacingStatus` / `getStatusTone`（`lib/ui-labels.ts`）。

## 12. Phase H 收尾（2026-09-16）

- html/body `overflow-x: clip`；`.acf-app-frame` `min-width: 0`
- `:focus-visible` 2px brand；Dialog trap 保持
- 主流程 1024 单列：Dashboard 最近项目、定位摘要、计划卡、发布步骤、指标 2 列
- 脚本 `<xl` compact queue；视频 `max-xl` 单列（Phase E 保留）
- 例外：video `bg-black`；历史表 container `overflow-x-auto`；ConfidenceActionCard 仍有中性色
- Browser Visual **NOT_CLAIMED**
