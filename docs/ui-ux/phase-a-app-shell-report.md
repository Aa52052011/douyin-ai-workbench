# UI/UX Implementation Phase A Report

Date: 2026-09-16
Wave: `UI_UX_IMPLEMENTATION_PHASE_A_APP_SHELL_AND_DESIGN_SYSTEM`
Do not start Phase B from this document.

## 1. Scope

App Shell V2, global + project navigation, compact project header, workflow page header primitive, Next Action Bar, Design System V2 tokens on existing `--acf-*`, core Button/Card/Status/Empty/Error/Progress components, hide technical terms from the product shell. **No business-logic or page-flow redesign.** Real User Loop remains FROZEN_PASS.

## 2. Existing Components Reused

AppShell, GLOBAL_NAV_V2, ProjectShell, ProjectSwitcher, WorkflowBackNavV1, PageHeader, Button, Card, EmptyState, Dialog/Input/Badge/Tabs/Table, SmartFormFieldV1, HumanReviewBar, loadProjectStatus, dashboard layout wrapping.

## 3. Existing Components Refactored

`globals.css` tokens; Button (lg, loading「处理中…」); Card variants; StatusBadge mapper; project-nav 7 items + ✓/●/○ from facts; project-shell compact header; app-shell + PageContainer; project-switcher copy; TechnicalDetailsPanel extracted.

## 4. New Components

`PageContainerV2`, `WorkflowPageHeaderV1`, `NextActionBarV1`, `InlineActionErrorV1`, `AsyncTaskProgressV1`, `getUserFacingStatus` / `getStatusTone`.

## 5. Deprecated Components

No file deletions. Deprecated as **normal-UI patterns**: unlabeled「全部」, debug-like numbers in the switcher, parallel `router.back`, engineering nav as primary IA. Legacy routes `/dashboard/agents|content-planning|scripts|videos|assets` remain unlinked from global nav.

## 6. Design Tokens

Extended `--acf-*` only. Page/surface/muted/elevated; text primary/secondary/muted/disabled/inverse; border default/subtle/strong; brand primary/hover/active/soft; semantic + soft. No neon/gradient/glass.

## 7. Typography

Classes: display, page title, section title, card title, body, body small, caption, label, metadata. Chinese line-height 1.45–1.55; limited semibold.

## 8. Spacing

Scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Removed 20/40 token steps. Old pages may still have off-scale utilities (not redesigned).

## 9. Radius

8px controls, 12px cards, pill 999. `--acf-radius-lg` aligned to 12.

## 10. Button System

primary / secondary / ghost / danger; sm / md / lg; loading inner copy「处理中…」; disabled opacity + cursor. Shell uses brand primary. Many business pages still use native dark buttons (Phase C+).

## 11. Card System

Card `variant`: standard / summary / action / status aliases StandardCard/SummaryCard/ActionCard/StatusCard. Light borders, shared radius-md.

## 12. Status System

Central mapper in `lib/ui-labels.ts`.
PENDING→等待处理, RUNNING→正在处理, COMPLETED→已完成, FAILED→处理失败, DRAFT→草稿, CONFIRMED→已确认, ACCEPTED→已采纳, REJECTED→不采纳, DEFERRED→稍后再看, USER_ASSERTED→用户已登记. Unknown→处理中 (empty→状态未知). Tones include warning. Video-specific labels stay via `videoUserStatusLabel`.

## 13. AppShellV2

`data-acf-app-shell-v2` on existing AppShell. Sticky global header. Main document scroll. Project workspace children skip extra page max-width so sidebar + main share the app frame.

## 14. Global Navigation

工作台 / 项目 / 发布与数据 / 设置. Right: project switcher + user name + 退出. `aria-current` on active item.

## 15. Project Switcher

Current project name as the control (not a labeled form after「项目」). Ellipsis via max-width truncate. Dropdown options: name + `updatedAt` when present. No fake stage. Link: 全部项目.

## 16. Project Workflow Nav

Only under `/dashboard/projects/[projectId]`. Seven steps including AI复盘. Marks from `loadProjectStatus` facts; if facts missing, neutral ○/● only — never fake ✓ from URL. Foundation links under 项目资料.

## 17. Project Compact Header

Name, 平台 · 行业, 当前阶段, 编辑项目. Long description no longer on every page.

## 18. Workflow Page Header

`WorkflowPageHeaderV1` composes WorkflowBackNavV1 + PageHeader (title, one-line description, status, single actions slot, weak breadcrumb). Not applied to all business pages this phase.

## 19. Workflow Back Navigation

PRESERVED. Same `resolveWorkflowBackNav` mapping; component has no `router.back`.

## 20. Next Action Bar

`NextActionBarV1` on ProjectShell: ← previous / 当前 / next →. Flow links only, not generate CTAs.

## 21. Technical Details

`TechnicalDetailsPanel` title「技术详情」, default collapsed. Settings uses it under 高级设置.

## 22. Inline Errors

`InlineActionErrorV1` created (message + 重试 + 技术详情). Not wired into generate/publish handlers this phase.

## 23. Empty States

EmptyStateV2: title + description + primary + optional secondary. Existing dashboard/projects empty copy already action-oriented.

## 24. Async Task Progress

UI-only `AsyncTaskProgressV1`. Caller must pass real stages. No fake progress. Not attached to video/agent jobs this phase.

## 25. Page Container

`PageContainerV2` + `--acf-content-max` 72rem inside `--acf-app-max` 90rem. Applied to non-project dashboard pages via AppShell.

## 26. Responsive Baseline

Desktop-first. Sidebar `lg:w-52`; at <lg nav collapses behind「项目导航」. No phone navigation productization.

## 27. Accessibility Baseline

`:focus-visible` brand outline; nav `aria-current`; semantic `<nav>`; reduced-motion media query. **ACCESSIBILITY_BASELINE_READY** only — not full a11y PASS.

## 28. Technical Terminology Audit

### NORMAL_UI_EXPOSURE_FOUND

| Location | Exposure | Treatment |
| --- | --- | --- |
| Product shell / mapper / badges | Enums mapped | Human copy |
| `recommendation-review-v5` / monitoring review | Compares ACCEPTED internally | User sees 已采纳 etc. |
| `publish/page.tsx` | `registrationVerificationCopy("USER_ASSERTED")` | Shows 用户已登记 |
| `content-planning` / `scripts` / `videos` / `assets` / `agents` (hidden nav) | Raw `status`, run ids | Legacy engineering surfaces; not global nav |
| `production/review/crop/[sessionId]` | Artifact ID, WAITING_FOR_* | Engineering crop review; not product loop |
| Content plan / script / video **logic** `status === "COMPLETED"` | Internal branching | Unchanged; display uses labels on project content pages |

Phase A did not rewrite business page bodies. Remaining raw strings on hidden/legacy routes are documented, not claimed gone.

## 29. Dev Overlay Audit

Next.js dev issue badge is **DEV_ONLY_OVERLAY**. No framework-internal hacks. Production `next build` does not include the dev overlay. **PASS** for production.

## 30. Pages Migrated to Shell

`/dashboard` layout AppShell; `/dashboard/projects`; `/dashboard/projects/[projectId]` + child routes via ProjectShell (overview, positioning, plans, scripts, videos, publish, performance, foundation pages). Settings and monitoring: AppShell only, no project workflow nav.

## 31. Pages NOT Redesigned

Content plan, script, video review, publish wizard, AI review cards, dashboard task-center information architecture, onboarding copy beyond shell.

## 32. Known Issues Closed

Shell-level: engineering chrome (shell), nav split, compact header, switcher labeling, spacing/radius foundation, layout max-width.

## 33. Known Issues Remaining

Long content-plan/script pages, nested scroll, video review layout, publish workflow, AI review density, monitoring duplicated tables, HIGH_* on review cards until Phase G, button hierarchy on business pages, browser visual acceptance.

## 34. Backend Business Mutations

0

## 35. Database Mutations

0

## 36. Agent Mutations

0

## 37. Provider Calls

0

## 38. .env

NO

## 39. Git Mutation

NO (this report does not commit)

## 40. Frontend Build

PASS — `tsc --noEmit`, `check:phase-a` (+ shell/workspace/unified-ui/ux-wave1/workflow-back), `next build`.
Backend health (read-only): `{"service":"backend","status":"ok"}` on :3001. No restart.

## 41. Browser Validation

NOT_RUN (no browser MCP / automated visual session in this environment)

## 42. Visual Acceptance

NOT_CLAIMED

## 43. Gate

See footer below.

---

UI/UX Phase: A_APP_SHELL_AND_DESIGN_SYSTEM
Real User Loop: FROZEN_PASS
Visual Direction: SIMPLE_COMFORTABLE_RESTRAINED
App Shell: IMPLEMENTED
Design System V2: IMPLEMENTED
Global Navigation: PASS
Project Navigation: PASS
Human-readable Status: PARTIAL
Technical Terminology: PARTIAL
Workflow Back Navigation: PRESERVED
Business Logic Changes: 0
Backend Changes: 0
Database Changes: 0
Agent Changes: 0
Provider Calls: 0
.env Modified: NO
Git Mutation: NO
Frontend Build: PASS
Browser Validation: NOT_RUN
Visual Acceptance: NOT_CLAIMED
Known Issues: PRESERVED_AND_UPDATED
Gate: PASS_WITH_LIMITATIONS

Recommended Next Step: UI_UX_IMPLEMENTATION_PHASE_B_DASHBOARD_AND_PROJECT_OVERVIEW

STOP.
