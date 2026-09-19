# Visual Scoring Outcome — parent-session-completion-notification-display

- Date: 2026-09-19
- Plan: ai/plans/milestone_3_parent_portal_admin_governance/parent-session-completion-notification-display/
- Capture rig: dev server @ localhost:3000 (agent-browser session `visloop-03e363425671`), DB: pglite (DB_PROVIDER=pglite, ./db/pglite, freshly pushed+seeded for the run)
- Inspector model: z-ai vision CLI (VLM-CLI mode per capture-protocol.md), one image per call, rubric inlined
- Locales captured: en, ar (RTL checklist applied on ar)
- Dark-mode pass: implicit-dark (app served dark scheme in this sandbox); explicit dark/light toggle pass NOT run — recorded as run-scope decision, not skipped silently
- Prototype comparison: SKIPPED — no `prototype/` dir exists in the plan (skill Phase 7 skip rule; recorded here per the rule)

## Surfaces covered

| Surface | Route | Viewports | States |
|---|---|---|---|
| A — child detail, reports default | /parent/children/4?tab=reports | 1440×900, 834×1112, 390×844 | no deep link |
| B — child detail, reports + deep-link highlight | /parent/children/4?tab=reports&session=1 | 1440×900, 834×1112, 390×844 | aria-current row + chip + glow |
| C — homework tab highlight | /parent/children/4?tab=homework&session=1 | 1440×900 | aria-current homework row |
| D — evaluations tab highlight | /parent/children/4?tab=evaluations&session=1 | 1440×900 | aria-current evaluations row |
| E — portal root denial notice | /parent/children?session=999 (childless parent) | 1440×900 | persistent info Alert |
| F — notifications drawer (FROZEN surface, score-only) | drawer over detail page | 1440×900, 390×844 | open drawer |

All captures passed the objective pre-check gate (manual eval fallback — `scripts/visual-precheck.sh` is not present in this repo): title guard, console error sweep, horizontal overflow, off-viewport bleed, a11y smoke. Zero gate failures across both passes.

## Score history

Pass 1 = pre-fix baseline; Pass 2 = after fix wave 1.

| Pass | Surface | Viewport | Hier | Spacing | Typo | Color | Afford | Resp | Total | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A default | 1440 | 9 | 8 | 8 | 9 | 9 | 9 | 8.7 | READY |
| 1 | A default | 834 | 9 | 8 | 9 | 10 | 9 | 9 | 9.0 | READY |
| 1 | A default | 390 | 8.5 | 9 | 9 | 9 | 9 | 9 | 8.9 | READY |
| 1 | B highlight | 1440 | 9 | 9 | 8.5 | 9 | 10 | 9 | 9.1 | READY |
| 1 | B highlight | 834 | 9 | 8.5 | 9 | 9 | 9 | 9 | 8.9 | READY |
| 1 | B highlight | 390 | 8.5 | 9 | 9 | 9 | 9 | 9.5 | 9.0 | READY |
| 1 | C highlight | 1440 | 9 | 8 | 8 | 9 | 7 | 9 | 8.3 | READY |
| 1 | D highlight | 1440 | 9 | 9 | 8 | 9 | 10 | 9 | 9.0 | READY |
| 1 | E denial | 1440 | 8 | 9 | 8 | 9 | 7 | 8 | 8.2 | NEEDS FIXES |
| 1 | F drawer | 1440 | 8 | 8.5 | 9 | 9 | 9 | 9 | 8.75 | READY |
| 1 | F drawer | 390 | 8.5 | 9 | 9.5 | 9 | 8.5 | 9 | 8.92 | READY |
| 1 | B highlight ar | 1440 | 8 | 8 | 7 | 9 | 9 | 8 | 8.2 | READY |
| 1 | B highlight ar | 834 | 9 | 8.5 | 9 | 9 | 9 | 9 | 8.9 | READY |
| 1 | B highlight ar | 390 | 8 | 7.5 | 8 | 8.5 | 8 | 8 | 8.0 | READY |
| 1 | A default ar | 1440 | 9 | 8.5 | 9 | 9 | 9 | 9 | 8.92 | READY |
| 1 | A default ar | 834 | 9 | 8.5 | 9 | 9 | 9 | 9 | 8.92 | READY |
| 1 | A default ar | 390 | 9 | 8 | 9 | 9 | 9 | 9 | 8.8 | READY |
| 1 | C highlight ar | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8.8 | READY |
| 1 | D highlight ar | 1440 | 8 | 8 | 7 | 9 | 8 | 8 | 8.0 | NEEDS FIXES |
| 2 | A default | 1440 | 9 | 8.5 | 9 | 9 | 9 | 9 | 8.92 | READY |
| 2 | A default | 834 | 9 | 9 | 8.5 | 9 | 9 | 9 | 8.9 | READY |
| 2 | A default | 390 | 9 | 9 | 8 | 10 | 9 | 9 | 9.0 | READY |
| 2 | B highlight | 1440 | 8.5 | 8.5 | 9 | 9.5 | 9 | 9 | 8.92 | READY |
| 2 | B highlight | 834 | 9 | 8 | 9 | 9 | 9 | 9 | 8.8 | READY |
| 2 | B highlight | 390 | 8.5 | 8.5 | 8.5 | 9 | 9 | 8.5 | 8.7 | READY |
| 2 | C highlight | 1440 | 9 | 9 | 8.5 | 9 | 8.5 | 9 | 8.83 | READY |
| 2 | D highlight | 1440 | 9 | 8 | 9 | 9 | 9 | 9 | 8.8 | READY |
| 2 | B highlight ar | 1440 | 8.5 | 9 | 7.5 | 9 | 8.5 | 9 | 8.6 | READY |
| 2 | B highlight ar | 834 | 9 | 8.5 | 9 | 9 | 9 | 9 | 8.9 | READY |
| 2 | B highlight ar | 390 | 8 | 8 | 8 | 9 | 9 | 8 | 8.3 | READY |
| 2 | D highlight ar | 1440 | 9 | 8 | 7 | 9 | 9 | 8 | 8.3 | READY |

## Pre-check gate failures found (and fixed)

| Surface | Check | Evidence | Fix |
|---|---|---|---|
| (none) | — | All captures green on title/console/overflow/bleed/a11y in both passes | — |

## Fix waves

| Wave | Files | Findings addressed | Per-file sub-loop | Tests |
|---|---|---|---|---|
| 1 (VA-1) | `frontend/views/parent/monitoring/RatingTrendChart.tsx` | Axis tick fill hardcoded recharts default #666 (DOM-confirmed rgb(102,102,102)) → `theme.palette.text.secondary` on XAxis+YAxis; `minTickGap={24}` narrow-viewport safety; pre-existing oxlint a11y `prefer-tag-over-role` on `role="img"` Box → `component="figure"` (verified pre-existing, repo-documented pattern) | EXIT 0 | — |
| 1 (VA-2) | `frontend/views/parent/monitoring/DeepLinkTargetChip.tsx`, `ParentChildDetailContainer.helpers.ts` | Chip body transparent/faint → `alpha(primary, 0.1)` wash + border `alpha(primary, 0.6)`; target row glow ring `0 0 0 1px alpha(primary, 0.35)` (conditional, non-target unchanged) | EXIT 0 ×2 | HomeworkTab/EvaluationsTab sessionHighlight suites 12/0 + 12/0 |
| 1 (VA-3) | `frontend/views/parent/monitoring/ReportsTab.tsx`, `HomeworkTab.tsx`, `EvaluationsTab.tsx` | Row-list Stack `spacing={2}` → `{2.5}` (20px gap matches sm+ card padding rhythm) | EXIT 0 ×3 | — |

DOM arbitration of disputed findings (rubric orchestrator rule):
- Chart tick fill `rgb(102,102,102)` → CONFIRMED (fixed in wave 1; R2 computed `rgb(168,181,204)`)
- Row glow → confirmed landed live (`rgba(61,107,160,0.35) 0px 0px 0px 1px`)
- "rating trena" typo → DISPROVEN (string absent from DOM)
- X-tick overlap @390 → DISPROVEN (2 ticks, 0 overlapping rects; `preserveStartEnd` already guards)
- Evaluation notes "wrong direction" (R1 wanted ltr, R2 wanted rtl — contradictory) → DISPROVEN (notes carry `dir="auto"`; bidi renders correctly; alignment `start`)
- AR search placeholder "English in Arabic UI" → DISPROVEN (placeholder is `ابحث بالملاحظات أو التاريخ...`)
- Chart edge-label clipping (ar-834) → DISPROVEN (0 clipped tick rects)
- Chart "empty state lacks text" (recurring) → DISPROVEN (chart has data — two demo sessions both rated 5 → flat top line on the semantically-correct 0–5 scale; a true empty state exists in code via `ratingTrendEmpty`)

## Accepted cosmetic debt

| Item | Why it cannot reach 10 | Why acceptable |
|---|---|---|
| E-state: global filled error toast ("ليست لديك صلاحية...") rides above the outlined info notice on a denied probe | The global 403 toast host is a PRE-EXISTING frozen surface (R-A byte-freeze in the plan; drawer/feed/badge/toast hosts untouched by design); removing/suppressing it for this query would break the freeze or the global error contract | Copy is the constant localized permission text — zero session/child fields; no data leak; the plan's own info notice renders per contract; toast is transient |
| Inspector totals plateau 8.3–9.2 (not 10) | Rubric calibration: inspectors score in integer steps, reserve 10 for "flawless"; remaining findings are LOW-only, mutually contradictory across passes (e.g. +4px vs −4px rhythm on the same cards), or DOM-disproven | Per rubric thresholds + accepted-debt clause, LOW-only residuals at the plateau with DOM evidence close the loop instead of infinite re-inspection |
| English report/notes text inside AR captures | Seeded DEMO CONTENT (report notes submitted in English) — content, not UI; i18n of user content is out of scope | Real user data renders as submitted; UI chrome fully localized |
| Latin digits on chart axes in AR | The app's date formatter uses one consistent numeral decision (Latin) across all surfaces | Rubric requires ONE consistent decision per screen — holds everywhere |
| F drawer RTL row alignment + rhythm notes | Drawer/feed rows are R-A byte-frozen substrate components — the plan must not restyle them | Frozen by plan ruling; noted, not actionable in this plan |
| Homework ungraded "—" dash | Domain state display; muted token styling is the established pattern; inspector itself accepted "subtle —" as a valid option | Data semantics, not decoration |

## Environment incidents (run-level)

- Concurrent per-file quality loops (sub-loop.ts) while the dev server held `./db/pglite` corrupted the PGlite data dir (WAL panic `incorrect prev-link`); the run re-provisioned: fresh dir → `drizzle-kit push` (pglite driver config) → seed. Lesson landed in the skill evolution log.
- `scripts/visual-precheck.sh` referenced by the skill does not exist in this repo — the gate ran via the manual eval fallback from `references/objective-prechecks.md` (mandatory-gate rule honored; the gate is the rule, the script is convenience).

## Capture lessons

- `browser-login.ts --inject` + `PARENT_EMAIL/PARENT_PASSWORD` env keys worked for per-role sessions; locale must be re-pinned after every re-login (NEXT_LOCALE reverts with fresh sessions — reconfirmed).
- Fresh DB ⇒ stored notification copy is emitted with the app default locale (ar) while users.locale=null → drawer chrome EN with AR row copy is CORRECT per-locale-at-emission behavior, not a defect.
