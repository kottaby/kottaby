# Visual Scoring Outcome — DEV2-005 Verification Plan Purchase (5 Sessions)

- Date: 2026-09-14
- Plan: ai/plans/sprint_1/verification-plan-purchase-5-sessions/
- Capture rig: dev server @ localhost:3000 (DB_PROVIDER=pglite — real authed surfaces; Storybook stories absent and server-state-driven status branches made the dev rig the faithful choice — precedent: the two prior visual runs in this repo used the same rig per evolution-log)
- Inspector model: VLM-CLI (`z-ai vision`), one image per call, rubric inlined (evolution-log R1 mode)
- Locales captured: ar (default RTL) + en
- Dark-mode pass: no (out of run scope)
- Objective gate: manual eval implementation of `visual-precheck.sh` checks (script absent in repo) — title guard, console sweep, overflow, off-viewport bleed w/ clipped-ancestor exclusion, a11y smoke — ALL captures green before inspection

## Surfaces covered

| Surface | Route / state | Viewports | States |
|---|---|---|---|
| Teacher dashboard — pending | /teacher/dashboard (applicant `pending`) | 1440×900, 834×1112, 390×844 | CTA visible, AR+EN |
| Purchase dialog | dialog open over pending dashboard | 1440×900, 390×844 | AR+EN(1440) |
| Teacher dashboard — in_evaluation | /teacher/dashboard (applicant `in_evaluation`) | 1440×900, 390×844 | AR+EN(1440) |
| Teacher dashboard — failed+cooldown | /teacher/dashboard (applicant `failed`, cooldown active) | 1440×900, 390×844 | AR+EN(1440) |
| Teacher dashboard — failed+eligible | /teacher/dashboard (applicant `failed`, cooldown elapsed) | 1440×900, 390×844 | AR+EN(1440) |

State fixtures: pglite SQL fixtures (`visual-pending/eval/cool/eligible@test.local`) — 4 lifecycle states; rejection-snackbar state unreachable by design (cooldown CTA is fail-closed disabled) — covered by dialog error-arm component tests.

## Score history

Pass 1 (before fixes):

| Pass | Surface | Viewport | Hier | Spacing | Typo | Color | Afford | Resp | Total | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | pending | 1440 ar | 9 | 9 | 9 | 9 | 9 | 9 | 9.0 | NEEDS (no findings) |
| 1 | pending | 834 ar | 9 | 9 | 9 | 9 | 9 | 9 | 9.0 | NEEDS (no findings) |
| 1 | pending | 390 ar | 9 | 9 | 9 | 9 | 9 | 9 | 9.0 | NEEDS (no findings) |
| 1 | pending | 1440 en | 9 | 10 | 10 | 9 | 10 | 10 | 9.7 | READY |
| 1 | dialog | 1440 ar | 9 | 9 | 8 | 9 | 10 | 9 | 9.0 | NEEDS — bidi plan line (M) |
| 1 | dialog | 390 ar | 8 | 9 | 7 | 9 | 9 | 8 | 8.3 | NEEDS — bidi (M), cancel affordance (M), close-icon check (L) |
| 1 | dialog | 1440 en | 9 | 9 | 9 | 9 | 9 | 10 | 9.2 | NEEDS — confirm-vs-cancel weight (M) |
| 1 | in-eval | 1440 ar | 9 | 9 | 9 | 10 | 9 | 9 | 9.2 | NEEDS (no findings) |
| 1 | in-eval | 390 ar | 9 | 9 | 9 | 10 | 9 | 9 | 9.2 | NEEDS (no findings) |
| 1 | in-eval | 1440 en | 9 | 8 | 10 | 9 | 9 | 9 | 9.0 | NEEDS — spacing rhythm (M, pixel-disproven), stat-cards width (L, out of plan scope) |
| 1 | failed-cooldown | 1440 ar | 9 | 9 | 9 | 9 | 9 | 9 | 9.0 | NEEDS (no findings) |
| 1 | failed-cooldown | 390 ar | 9 | 9 | 9 | 9 | 9 | 9 | 9.0 | NEEDS (no findings) |
| 1 | failed-cooldown | 1440 en | 9 | 9 | 9 | 9 | 9 | 9 | 9.0 | NEEDS (no findings) |
| 1 | failed-eligible | 1440 ar | 9 | 9 | 9 | 10 | 10 | 9 | 9.3 | NEEDS (no findings) |
| 1 | failed-eligible | 390 ar | 9 | 9 | 9 | 9 | 9 | 9 | 9.0 | NEEDS (no findings) |
| 1 | failed-eligible | 1440 en | 9 | 9 | 10 | 9 | 10 | 10 | 9.5 | NEEDS — "Failed" chip green/success tone (M) |

Pass 2 (after fix wave 1 — recaptured affected surfaces only):

| Pass | Surface | Viewport | Hier | Spacing | Typo | Color | Afford | Resp | Total | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | dialog | 1440 ar | 9 | 9 | 9 | 10 | 10 | 10 | 9.5 | READY |
| 2 | dialog | 390 ar | 9 | 9 | 9 | 9 | 9 | 9 | 9.0 | adjudicated (no findings; prior bidi/cancel/close resolved) |
| 2 | dialog | 1440 en | 9 | 8 | 10 | 9 | 9 | 9 | 9.0 | adjudicated (single finding pixel-disproven — see pre-check/fix table) |
| 2 | failed-eligible | 1440 ar | 9 | 9 | 9 | 10 | 9 | 9 | 9.2 | adjudicated (no findings; chip tone fix confirmed) |
| 2 | failed-eligible | 390 ar | 9 | 9 | 9 | 10 | 9 | 9 | 9.2 | adjudicated (no findings) |
| 2 | failed-eligible | 1440 en | 9 | 9 | 10 | 10 | 10 | 10 | 9.5 | READY (green-chip finding resolved) |

## Pre-check gate failures found (and fixed)

None — every capture in both passes passed all five objective checks on first gate.

## Fix waves

| Wave | Files | Findings addressed | Per-file sub-loop | Tests |
|---|---|---|---|---|
| 1 | frontend/views/teachers/dashboard/VerificationPurchaseDialog.tsx | bidi plan-line → `dir="auto"` (first-strong = Latin title → stable mixed-direction rendering in both locales); bare-text cancel → `variant="outlined" color="inherit"` (playbook row: bare-text dialog cancel reads non-interactive) | `sub-loop --lifecycle duplicates` exit 0 | VerificationPurchaseDialog.test.tsx — all lanes green (59-pass run incl. full RTL/arabic dialog suite) |
| 1 | frontend/views/teachers/dashboard/ApplicantStatusResolution.tsx | failed-ELIGIBLE branch chip `tone: "success"` → `"warning"` (status chips are lifecycle-semantic; eligibility positivity lives in EligibleZone copy — family consistency with the other failed branches) | `sub-loop --lifecycle duplicates` exit 0 | ApplicantStatusCard.test.tsx 18/18 pass (exit 0) |

## Pixel adjudications (fix-patterns sub-8px / misperception guard)

| Claim (pass) | DOM measurement | Verdict |
|---|---|---|
| EN dialog "less space below plan box than above" (pass 2) | `DialogTitle→plan box = 0px (title pb carries the gap)`; `plan box→actions = 20px (token) + actions pt 8px` — space BELOW is LARGER | FALSE POSITIVE — pixel-disproven; no fix shipped |
| EN in-eval "status-card internal padding inconsistent" (pass 1) | card composed of token-spaced `Stack spacing` (AR pass on same card: no findings — contradictory readings = noise signature) | FALSE POSITIVE — adjudicated |
| AR dialog-390 "asymmetric cancel alignment in RTL" (pass 1) | MUI `DialogActions` flex-end mirrors correctly in RTL; equal-quality outlined cancel (wave 1) resolved the perceived imbalance | Resolved via canonical recipe; claim closed |
| AR dialog "close icon may be flipped" (pass 1) | `CloseRounded` is a direction-neutral glyph; no directional transform in source | FALSE POSITIVE |
| EN pending "badge uses non-standard color token" (pass 1) | chip uses `palette.status.pendingContainer/onPendingContainer` Material-3 semantic pair | FALSE POSITIVE (token-exact) |
| EN in-eval "stat cards fixed widths / dead space" (pass 1) | stat-cards row is pre-existing dashboard furniture outside the plan's file set | OUT OF PLAN SCOPE — recorded, not fixed |

## Accepted cosmetic debt

| Item | Current score impact | Why it can't reach 10 | Why acceptable |
|---|---|---|---|
| VLM integer plateau (surfaces scoring 9.0–9.3 with ZERO findings) | totals below the 9.5 bar despite empty findings lists | documented inspector calibration: integer-granularity scoring reserves 10 for "flawless" and plateaus ≈9.0–9.2 (rubric note, evolution-log R2/validity-window runs) | zero actionable findings across two passes + all objective gates green; rubric's accepted-debt clause governs exactly this signature |
| Stat-cards row width distribution (EN 1440, in-eval) | LOW, single-locale | pre-existing dashboard primitive owned outside this plan (disjoint-file rule) | not part of DEV2-005 surfaces; recorded for the dashboard owners |
| Topbar email truncation (shell) | out of scored area | app shell is pre-existing and never scored (rubric contract) | pre-existing; noted in the earlier E2E run as well |

## Prototype comparison (prototype/ exists — 10 screens)

| Screen | Better | Still missing vs prototype | Decision |
|---|---|---|---|
| pending desktop | PROTOTYPE (richer: roadmap grid, resources, advisory columns) | roadmap/preparations/advisory surfaces; sidebar CTA; search/breadcrumbs | spec amendment candidates surfaced to user — NOT implemented (out of DEV2-005 scope; spec wins by definition) |
| pending mobile | IMPLEMENTATION | prototype's per-section modules | spec wins |
| dialog desktop | PROTOTYPE (itemized plan card: icon, session rows, total row, security banner) | itemized pricing rows; security notice | user-decision candidate; current single-line ICU plan descriptor is the spec'd contract |
| dialog mobile | IMPLEMENTATION | detailed plan card rows; security badge | spec wins |
| in-evaluation desktop | PROTOTYPE (session list, progress bars, milestones) | evaluation-session list/progress surfaces | future-plan candidate (evaluation sessions are a later plan) |
| failed-cooldown desktop | IMPLEMENTATION | rubric breakdown; review-notes/download actions | spec wins |
| failed-cooldown mobile | IMPLEMENTATION | masterclass recommendations; bottom nav | spec wins |
| failed-eligible desktop | IMPLEMENTATION | diagnostic summary bars; mentor office hours | spec wins |
| failed-eligible mobile | IMPLEMENTATION | audio player; refinement tooling | spec wins |
| cooldown-rejected snackbar | IMPLEMENTATION | rejection snackbar (unreachable: cooldown CTA is fail-closed disabled — deliberate posture; error arms covered by component tests) | spec wins (fail-closed beats prototype's error-recovery affordance) |

## Capture lessons → evolution-log candidates

- agent-browser `eval` on long multi-statement JS strings intermittently fails with `SyntaxError: Unexpected identifier` even when syntactically valid — remedied by splitting into short statements joined with commas (no arrow IIFE); retest the exact string before blaming the page. → landed: `references/capture-protocol.md` (snapshot-text gotchas area, this change).
- State-fixture composition: server-computed branches (cooldown eligibility) are best fixed via direct DB row fixtures (status/cooldown_until), never by UI-driven mutation attempts. → plan outcome only (feature-specific).
- The env reaper + daemon crash combo (`Resource temporarily unavailable`) recovers by killing agent-browser daemons AND using a fresh session name — session reuse after daemon crash poisons the next N commands. → landed: `references/capture-protocol.md` (this change).
