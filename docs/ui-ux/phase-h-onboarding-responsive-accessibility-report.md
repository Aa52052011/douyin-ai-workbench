# UI/UX Implementation Phase H Report

Date: 2026-09-16
Scope: frontend onboarding, responsive (1024–1920), accessibility baseline, consistency. No Phase I.

## 1. Scope

First-run onboarding, create-project first-step notice, 1024/1280/1440/1920 layout classes, a11y baseline, overflow/CTA/empty/loading/error/terminology audits. No business-logic / schema / agent / pipeline changes.

## 2. Onboarding Before

FirstRunOnboardingV1 listed 4 internal steps and showed for returning users until local dismiss. EmptyState duplicated welcome copy. No workflow overview dialog. No per-project positioning first-step notice.

## 3. Onboarding After

0 projects: welcome + 3 steps + Primary「创建第一个项目」+ Secondary「了解工作流程」+ skip「知道了」. Returning users: no first-run card. Workflow Dialog is skippable.

## 4. First-run Flow

Dashboard 0 projects → create form → `createProjectSuccessHref` → `/dashboard/projects/:id/positioning` → PositioningFirstStepNotice once.

## 5. Returning User Flow

`shouldShowFirstRunOnboarding(hasProjects, dismissed)` is false when projectCount > 0. Dashboard shows ResumeWorkCard / 需要处理 / 最近项目.

## 6. Onboarding Persistence

ONBOARDING_PERSISTENCE: **LOCAL** (also inferred from project count). Keys: `acf.first-run.onboarding.v1.dismissed`, `acf.positioning.first-step.v1.${projectId}.dismissed`, contextual `acf.contextual-guidance.v1.${id}.dismissed`. Not a backend fact.

## 7. Contextual Hints

Dismissible ContextualGuidanceV1 on positioning/planning/script/video/publish/analysis. Copy aligned to spec; wave-6 positioning body still contains「后续计划和脚本会自动复用」.

## 8. Global Responsive Audit

Class-level: 1920 max-width `--acf-app-max` 90rem; 1440 standard; 1280 sidebar+main; 1024 project nav collapse. Phone UI not in scope. Visual: NOT_CLAIMED.

## 9. AppShell Responsive

Sticky header, `overflow-x-clip`, `min-w-0`, 1024 menu `aria-expanded`, mobile nav `aria-current`.

## 10. Dashboard Responsive

Continue / Needs Attention / Recent. Recent: 1 col until xl (1280+ two cols). 1024 single column.

## 11. Project Overview Responsive

Progress + Recent 2-col at xl; 1024 stacked. Progress remains rows, not charts.

## 12. Positioning Responsive

Four summaries `xl:grid-cols-2`; 1024 single. 更多设置 `xl:col-span-2`.

## 13. Content Plan Responsive

Topic cards `md:grid-cols-1 xl:grid-cols-2` (no 3-col). Drawer = Dialog `max-w-lg`.

## 14. Script Responsive

1280+ (`xl`): queue 12–16rem + workspace. 1024: compact collapsible queue (`max-width: 1279px`).

## 15. Video Responsive

Phase E `max-xl:flex-col` retained. video-responsive selfcheck still required.

## 16. Publish Responsive

Workflow steps 1 col until xl (5 col). Metrics 2 col then 3 at xl. History table `overflow-x-auto`.

## 17. AI Review Responsive

Workspace single-column recs; FeedbackHandoff `max-w-3xl` not a side rail.

## 18. Horizontal Overflow Audit

Safety: html/body `overflow-x: clip`; main `min-w-0`. Tables may scroll internally. **Measured page overflow in browser: NOT_RUN** (selfcheck cannot prove 0).

## 19. Nested Scroll Audit

Script/video pages still without WorkspacePageShell nested document+workspace scroll. Allowed: queue `overflow-y-auto`, Dialog, table x-scroll.

## 20. Keyboard Navigation

Selfcheck: Dialog Tab trap, Escape, nav links as `<a>`, buttons as `<button>`. Live keyboard: NOT_RUN.

## 21. Focus Visibility

`:focus-visible` 2px `--acf-brand`.

## 22. Dialog/Drawer Focus Trap

Shared `Dialog`: focus in, Tab cycle, Escape, restore `previousFocus`. TopicDetailDrawer / VersionHistoryDrawer use Dialog.

## 23. aria-current

Global nav, project nav (`page`), script queue item (`true`), publish step (`step`).

## 24. aria-expanded

App menu, project nav, 项目资料, compact script queue.

## 25. Form Labels

Login htmlFor retained. Positioning form unchanged (prior wave-6).

## 26. Status Accessibility

Mapper `getUserFacingStatus` (已确认 / 处理失败). Sufficiency empty copy「还没有足够数据」not bare「暂无数据」on analysis/coverage.

## 27. Loading Accessibility

Skeleton `aria-busy`. Button `aria-busy` +「处理中…」. Not assertive live regions globally.

## 28. Reduced Motion

`prefers-reduced-motion` in globals. First-run scrollIntoView without smooth.

## 29. Hit Targets

Nav/buttons `min-h-9` (36px). Button sm remains min-h-8 (exception).

## 30. Typography Consistency

Core pages use `acf-*` classes. Remaining `text-sm` / `text-xs` on captions.

## 31. Spacing Consistency

New layout uses 4/8/12/16/24/32 scale (`gap-3`/`p-4`/`mb-6`).

## 32. Radius/Border/Shadow Consistency

`--acf-radius-sm/md`, `--acf-shadow` on Dialog. No new rounded-3xl / shadow-xl.

## 33. Primary CTA Audit

Dashboard 0-project: one create primary. Plan page: one brand「开始制作第一条脚本」. Confidence card no continueHref.

## 34. NextActionBar Audit

Next link: secondary「下一阶段：{label} →」. Shell bar omitted on positioning/plans/scripts/videos/publish/performance to avoid double bars. Overview owns its bar.

## 35. Technical Terminology Audit

Product routes scanned: no sourceAgentRunId / HIGH_ / truth gate / queueId. USER_ASSERTED only as mapper arg →「用户已登记」. Dev routes `/dashboard/agents`, `/dashboard/scripts` still expose AgentRun (allowed).

## 36. Raw Error Audit

InlineActionErrorV1 + TechnicalDetailsPanel. No Prisma/stack in product pages.

## 37. Empty State Consistency

EmptyStateV2 title+description+primary. Dashboard 0-project uses FirstRun card instead of「暂无数据」.

## 38. Loading State Consistency

Page skeletons `aria-busy`, not full-page spinner on core pages.

## 39. Error State Consistency

InlineActionErrorV1 near actions; page-level only on load failure.

## 40. Human-readable Status Audit

Central mapper retained. Analysis empty label mapped to「还没有足够数据」.

## 41. Design Token Escape Audit

Exceptions: video black preview; ConfidenceActionCard `border-neutral-*`; some `text-neutral-600` leftovers on production-context-header.

## 42. Automated Accessibility Checks

No axe introduced. eslint jsx-a11y not newly added. TS + selfchecks only.

## 43. Onboarding Selfchecks

`onboarding-phase-h.selfcheck.ts`: 0 projects, returning false, dismissed, create href, positioning notice, wave-6 4-step constant.

## 44. Responsive Selfchecks

`responsive.selfcheck.ts` + `video-responsive.selfcheck.ts` + phase-h layout class assertions.

## 45. Accessibility Selfchecks

`accessibility-phase-h.selfcheck.ts`: dialog restore, aria-current/expanded, labels, no div-onClick on topic cards, focus-visible, reduced motion.

## 46. Pages Modified

Dashboard, overview, positioning, plans, scripts queue, publish steps, metrics summary, app-shell, project-shell, first-run, globals.css, next-action-bar, button, performance.view, ai-review.workspace.

## 47. Backend Mutations

0

## 48. Database Mutations

0

## 49. Agent Mutations

0

## 50. Provider Calls

0

## 51. .env Modified

NO

## 52. Git Mutation

NO

## 53. Frontend Build

PASS (`check:phase-h`, `check:phase-b/c/d`, `tsc --noEmit`, `next build`)

## 54. Backend Health

Not required for this frontend-only phase; not mutated.

## 55. Regression

No writes to ContentPlan / Script / Video / Publication / Snapshot / Analysis / AgentRun.

## 56. Browser Validation

NOT_RUN (no Playwright harness executed).

## 57. Visual Acceptance

NOT_CLAIMED

## 58. Known Issues Closed

ONBOARDING_INCOMPLETE, DUPLICATE_PLAN_CTA, TECHNICAL_TERMINOLOGY_RESIDUAL (product routes), GLOBAL_EMPTY/LOADING/ERROR consistency (core pages).

## 59. Known Issues Remaining

BROWSER_VISUAL_ACCEPTANCE; RESPONSIVE/A11Y visual & live keyboard PARTIAL; AI_CONVERSATION_CONTEXT_DATA_GAP; REVIEW_SESSION_FACT_DATA_GAP; LANDSCAPE_EXPORT_CURRENT_API_LIMITATION; MANUAL_PUBLICATION_MODE; PLATFORM_VERIFICATION_NOT_AVAILABLE; NO_AUTOMATIC_DOUYIN_METRICS; DOUYIN_OFFICIAL_PUBLISH_DEFERRED.

## 60. Gate

PASS_WITH_LIMITATIONS — code baseline complete; browser visual not run; do not enter Phase I automatically.
