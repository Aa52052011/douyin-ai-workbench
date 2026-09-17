# Phase I.5 Color Comfort Polish Report

Date: 2026-09-17
Mode: token / CSS / className only. Brand Primary frozen. No layout, route, workflow, or business mutation.

---

## 1. Scope

Comfort-only polish on existing `--acf-*` tokens: page background, surfaces, borders, Brand Soft, sidebar current vs completed, current-stage card, secondary button border, primary shadow. Brand Primary unchanged. No UI redesign.

## 2. Page Background Before

`--acf-page: #F7F8F6`

## 3. Page Background After

`--acf-page: #F3F5F1` (also `--acf-bg` / `--acf-background`). Far-look still near-white; cards remain `#FFFFFF`.

## 4. Surface System

- Page: `#F3F5F1`
- Surface / elevated: `#FFFFFF`
- Muted / subtle: `#F7F8F6`
- Cards not tinted green.

## 5. Border System

- Default: `#DEE5E1`
- Strong: `#CBD8D2`
- Brand border: `#B7D4C9` (reserved; not on every card)
- Ordinary Card / Action Card: neutral border
- Current stage: left Brand accent only

## 6. Brand Primary

`#176B5B` / hover `#125648` / active `#0F4A3F`
Brand Primary Changed: **NO**

## 7. Brand Soft

`#EAF2EE` / strong `#DFECE6`. Active/current fills stay light, not saturated green.

## 8. Sidebar Current

- Page active (this route, not workflow current): `acf-nav-page` — Brand Soft + Brand text
- Page active + workflow current: `acf-nav-current` — Brand Soft + 2px left accent
- Workflow current on another page: `acf-nav-workflow` — transparent + Brand text + ●

Overview and “选题与脚本” no longer share the same full-row Brand Soft when only one is the page.

## 9. Sidebar Completed

`acf-nav-done`: transparent background, default text, Success ✓ only. No Brand Soft row fill.

## 10. Current Stage Card

`acf-stage-current`: white surface, **neutral** border, inset 3px Brand accent. No full green ring + accent together. Applied to NextActionCard, planning current-focus, priority topic, week-overview current cell.

## 11. Global Nav

`acf-nav-active`: Brand Soft `#EAF2EE` + Brand text. No dark-green fill, heavy border, or glow.

## 12. Primary Button

Hue unchanged `#176B5B`. `shadow-none`. Color transition only. No glow.

## 13. Secondary Button

White + `#CBD8D2` (`--acf-border-strong`) + Brand text. Hover Brand Soft. Empty-state secondary aligned.

## 14. Card System

White + `#DEE5E1`. Shadow `0 1px 2px rgba(15, 23, 42, 0.03)` on standard/action. No floating system.

## 15. Info State

`--acf-info: #52635D` / `--acf-info-soft: #EEF4F3`. Distinct from current-stage accent.

## 16. Warning State

`--acf-warning: #A96F18` / `--acf-warning-soft: #FFF7E8`. Unchanged usage sites.

## 17. Empty State

Page token background; empty card white; primary still Brand. No illustrations.

## 18. Full Product Coverage

Tokens on `html`/`body` via `--acf-page`. Coverage: Dashboard, Projects, Overview, Positioning, Planning, Scripts, Video, Publish/Data, AI Review, Settings (AppShell).

## 19. Hardcoded Color Audit

Scanned `bg-white`, `bg-gray-*`, `border-gray-*`, `bg-green-*`, `border-green-*`, `text-green-*`.

Adjusted obvious comfort breakers: planning current-focus black ring, week-overview current black ring, script queue selected brand-border, empty-state secondary brand-border.

Did **not** mechanically replace remaining `border-neutral-200 bg-white` on intake/legacy/history panels.

## 20. Frozen Routes

Dashboard / Projects / Overview / Positioning / Planning / Scripts / Video / Publish / AI Review — **9 / 9**.

## 21. Layout Regression

Layout Changed: **NO**

## 22. Navigation Regression

Navigation: **PRESERVED** (hrefs, `isProjectNavActive`, `projectWorkflowMark`, GLOBAL_NAV / PROJECT_MAIN_NAV labels unchanged). Visual classes only.

## 23. Primary CTA Regression

Primary CTA: **PRESERVED**. Button hue and primary/secondary semantics unchanged.

## 24. Business Logic Regression

Business Logic Changed: **NO**

## 25. Interaction Freeze Regression

No `overflow-x: clip` on html/body/AppShell. Dialog closed: `return null`; no overlay/inert/focus trap added.

## 26. Responsive Regression

No breakpoint, grid, or width changes.

## 27. Accessibility Baseline

`:focus-visible` Brand ring retained. Sidebar still uses ✓●○ plus text. No WCAG claim.

## 28. Selfchecks

check:phase-a … check:phase-h PASS
final-ui-regression PASS
check:visual-color-system PASS
check:color-comfort-polish PASS

## 29. Frontend Build

PASS (`tsc --noEmit`, `next build`)

## 30. Backend Changes

0

## 31. Database Changes

0

## 32. Agent Changes

0

## 33. Provider Calls

0

## 34. LLM Calls

0

## 35. .env

NO

## 36. Real Data

NO

## 37. Route Changes

0

## 38. Git

NO

## 39. Browser Validation

NOT_RUN

## 40. Gate

READY_FOR_COLOR_COMFORT_BROWSER_ACCEPTANCE

---

Per-route code confirmation:

| Route | Layout | Primary CTA | Navigation | Business Semantics |
| --- | --- | --- | --- | --- |
| Dashboard | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
| Projects | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
| Overview | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
| Positioning | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
| Planning | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
| Scripts | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
| Video | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
| Publish/Data | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
| AI Review | PRESERVED | PRESERVED | PRESERVED | PRESERVED |
