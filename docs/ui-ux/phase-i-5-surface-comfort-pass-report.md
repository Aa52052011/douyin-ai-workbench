# Phase I.5 Surface Comfort Pass Report

Date: 2026-09-17
Mode: surface / border / Brand Soft tokens only. Brand Primary frozen. No layout, route, or business mutation.

## Page Background

`--acf-page: #EEF1EC` (also `--acf-bg` / `--acf-background`).

## Primary Surface

`--acf-surface: #F7F8F5`
Default Card / panel / sidebar container. Not `#FFFFFF`.

## Muted Surface

`--acf-surface-muted` / `--acf-surface-subtle: #F2F4F0`
More / project info / AI reference / history table / script queue / 生成设置 / feedback handoff.

## Elevated Surface

`--acf-surface-elevated: #FAFBF9`
Header, Dialog, Input / Select / Textarea. Still not `#FFFFFF`.

## Input Surface

`--acf-surface-input: #FAFBF9`
Shared `Input` / `Select` / `Textarea` + `.acf-field`. Focus remains Brand Primary ring.

## Border System

Default `#D8DED9`. Strong `#C8D0CA`. Brand border unused on default cards.

## Sidebar Surface

Project nav container: `--acf-surface`. Current: Brand Soft `#E4EEE9`. Completed: transparent + Success ✓.

## Header Surface

`--acf-surface-elevated`. Active tab: Brand Soft.

## Card Surface

Standard / action: `#F7F8F5`. Summary / status: muted `#F2F4F0`. Current stage: surface + neutral border + left Brand accent.

## Dialog Surface

`--acf-surface-elevated`. Closed still `return null`. Overlay / Escape / trap logic unchanged.

## White Audit

| Use | Class |
| --- | --- |
| `--acf-text-inverse: #FFFFFF` | KEEP_ONLY_IF_REQUIRED (primary button text) |
| Warning Soft `#FFF7E8` | KEEP_ONLY_IF_REQUIRED |
| Crop overlay `bg-white` | TECHNICAL_ONLY (legacy crop, not 9 frozen routes) |
| Intake / market `#fff` canvas | TECHNICAL_ONLY |
| Card / panel / input `bg-white` on 9-route components | MIGRATE_TO_SURFACE |

Pure white large cards on frozen 9 routes: **REMOVED**.

## 9 Route Regression

Dashboard / Projects / Overview / Positioning / Planning / Scripts / Video / Publish / AI Review.

Layout Changed: **NO**
Route Changed: **NO**
Navigation Changed: **NO**
Business Logic Changed: **NO**
Primary Action Semantics Changed: **NO**

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

## Interaction Regression

No `overflow-x: clip` on html / body / AppShell. Dialog closed: no overlay, no body lock, no inert, no extra trap.

## Build

`tsc --noEmit` PASS. `next build` PASS.

## Gate

READY_FOR_SURFACE_COMFORT_BROWSER_ACCEPTANCE

## Selfchecks

check:phase-a … h, final-ui-regression, visual-color-system, color-comfort-polish, surface-comfort-pass.

## Mutations

Business / Route / Backend / Database / Agent / Provider / LLM: 0
.env / Real Data / Git: NO
