# Visual Scoring Outcome — Fee Escrow & Teacher Wallet Crediting (#140)

- Date: 2026-09-15
- Plan: ai/plans/sprint_2/fee_escrow_and_teacher_wallet_crediting-crediting/
- Capture rig: production test server (.next-test-prod) @ localhost:3000, PGlite (DB_PROVIDER=pglite)
- Inspector model: GLM vision via z-ai CLI (single image per call, vlm-batch.sh)
- Locales captured: en, ar
- Dark-mode pass: no (app renders its default light scheme; single-scheme run)
- Viewports: 1440×900 desktop · 834×1112 tablet · 390×844 mobile

## Surfaces covered

| Surface | Route | Viewports | States |
|---|---|---|---|
| Student sessions | /student/sessions | d/t/m | empty; scheduled+escrow row; completed-awaiting-confirm; AR (desktop, mobile) |
| Teacher sessions | /teacher/sessions | d/t/m | scheduled+escrow row (Start CTA); settled completed row |
| Teacher wallet | /wallet | d/t/m | zeroed empty; credited 25.00 with ledger row; AR (mobile) |
| Admin governance | /admin/session-governance | d/t/m | directory with settled session |

20 captures per pass; every capture passed the objective pre-check gate
(title guard, console sweep, horizontal overflow, off-viewport bleed, a11y smoke)
before inspection.

## Score history

Pass 1 = pre-fix baseline (17 EN captures). Pass 2 = after fix wave 1+2.
Pass 3 = after fix wave 3 (full clean recapture). Pass 4 = final (+3 AR captures).

Totals below are the inspector-reported means (some inspectors print sums /60;
normalized here). Axis scores hover 7–10 with the rubric's documented plateau.

| Pass | Surface | Viewport | Total | Verdict |
|---|---|---|---|---|
| 1 | all 17 EN captures | d/t/m | 8.5–9.3 | 16 NEEDS FIXES / 1 READY |
| 2 | all 17 EN captures | d/t/m | 8.6–9.5 | 14 NEEDS FIXES / 3 READY |
| 3 | all 17 EN captures | d/t/m | 8.5–9.3 | plateau per rubric calibration note |
| 4 | all 17 EN + 3 AR | d/t/m | 8.6–9.33 | plateau; AR desktop READY |

## Pre-check gate failures found (and fixed)

| Surface | Check | Script output | Fix |
|---|---|---|---|
| all | title guard | expected EN titles, got AR ("جلسات التدريس") | NEXT_LOCALE=en cookie set after each fresh login (run-en-pass.sh) |
| 01/02/05 | marker guard | "Hifz" renders verbatim (server-owned value) in AR | AR pass markers use payload-verbatim "Hifz" (run-ar-pass.sh) |

## Fix waves

| Wave | Files | Findings addressed | Per-file sub-loop | Tests |
|---|---|---|---|---|
| 1 | sessionRowAction.ts, SessionRowActions.tsx, SessionRowLifecycleCtas.tsx, SessionRowMeta.tsx, SessionsEmptyState.tsx, teacherSessionCacheArms.ts, TeacherWalletContainer.tsx, WalletBalanceCard.tsx, AdminSessionFilterFields.tsx, AdminSessionSummaryStrip.tsx, AdminSessionGovernanceChrome.tsx, shared/locale/types/sessions/labels.ts, shared/locale/{en,ar}/sessions/labels.ts | escrow-held chip added (new feeHeldInEscrow key EN+AR); destructive cancel wash (errorContainer); confirm consequence explainer made VISIBLE under CTA (was hover-only tooltip); Start CTA filled primary; disabled withdraw dashed outline; balance-card padding 2.5→2; filter labels shrunk; summary-card padding 1.5; count-line contrast | lint-service --files clean (0 errors) after extracting nested ternary to `moneyHintFor` | StudentSessionsContainer 39 pass, TeacherSessionsContainer 47 pass, TeacherWalletContainer 21 pass, AdminSessionGovernanceContainer+RowStatusCell 44 pass (0 fail) |
| 2 | SessionRow.tsx, SessionRowMeta.tsx | footer breakpoint sm→md (tablet stacking), gap {xs 1.25/sm 1.5}, awaiting-pill fontWeight 700 | lint clean | student+teacher suites re-run, 0 fail |
| 3 | SessionRowMeta.tsx, SessionStatusFilterChips.tsx, AdminSessionFilterBar.tsx | escrow chip solid warningContainer tint (dark-surface legibility), selected filter chip onPrimaryContainer outline, teacher/student-id filter fields label-shrunk (uniform baseline — DOM-arbitrated) | lint clean | student 29-pass branch, teacher 47 pass, admin container 0 fail |

## DOM arbitration record

| Disputed finding | Measurement | Ruling |
|---|---|---|
| "Withdraw CTA looks enabled despite zero balance" | `wallet-request-withdrawal` disabled=false at balance 0.00 | By design — suite branch 4 pins "enabled CTA" at zeroed wallet; the dialog's client gate + server R-303 own the insufficient-funds flow |
| Admin date-label baseline misalignment | Created-from/-before labels top=464 == Status top=464 (all shrunk) | Finding disproven post-fix; residual complaint moved to Teacher/Student-id fields (not shrunk, top=417) → fixed in wave 3 |
| "Excessive dead space below single card" (responsive 7) | content height == viewport on short lists; no overflow, normal flow | Content-volume variance (exactly one session exists in the state machine); no CSS defect to fix |

## Accepted cosmetic debt

| Item | Current score impact | Why it can't reach 10 | Why acceptable |
|---|---|---|---|
| Dead space below single row/card | responsive 7 on tall viewports | The state machine yields exactly ONE session/wallet row; a viewport-filling page cannot invent data | Standard app behavior; no overflow, no cramped content; reflows purposefully when more rows exist |
| Withdraw CTA enabled at 0.00 balance | affordance −1 on wallet-empty | Disabling would break the tested design contract (branch 4 "enabled CTA") and duplicate the dialog's R-303 validation | In-dialog client gate + server authority keep the flow honest; one click reveals the validation copy |
| AR ledger description "Session #1 earning (dual confirmation)" in EN | typography −1 on AR wallet | Description text is SERVER-generated payload (stored at settlement), not client copy | Bilingual ledger text policy is a backend/product decision, out of visual-styling scope |
| MUI date-input intrinsic clipping at 390px (picker glyph) | LOW on admin mobile | MUI-native rendering of native date inputs at narrow widths | Inputs remain operable; glyph fully visible at ≥sm |
| VLM integer-step plateau | totals cap ≈9.0–9.3 | Inspectors reserve 10 for "flawless" (rubric calibration note 2026-09-13) | All reported findings fixed, DOM-disproven, or mutually contradictory across passes |

## Prototype comparison (prototype/ exists — phase 7 ran)

| Screen | Better | Still missing vs prototype | Decision |
|---|---|---|---|
| teacher-wallet-default-mobile ↔ 06-wallet-credited-mobile | TIE (impl 9/10) | View-All link, pending-clearance stat, copy-balance icon, explainer card — all out-of-spec flourishes | Recorded, not implemented (scope) |
| teacher-sessions-escrow-badges-default-desktop ↔ 03-teacher-escrow-desktop | IMPLEMENTATION (8/10) | none in spec (row-alert slot exists, renders empty by design) | Complete |
| student-confirm-settle-default-mobile ↔ 05-student-completed-mobile | PROTOTYPE fancier (impl 7/10) | dispute CTA in completed state — SPEC-FORBIDDEN (disputed not reachable from completed, dual-confirmation ruling D-2, recorded divergence); escrow chip — replaced by the more specific awaiting-confirmation pill (single money-hint slot) | Deltas resolved by spec; no change |

## Capture lessons → evolution-log candidates

- Inline `setsid nohup … &` servers are reaped when the tooling command exits; booting
  from a FILE script (boot-prod.sh) survives — same pattern as boot-dev.sh.
- Next.js dev (turbopack) never hydrated React in this sandbox (no console errors,
  `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` stayed 0); the production build
  (`.next-test-prod` + `next start`) hydrates correctly and is the reliable capture rig.
- Production builds need JWT_ACCESS_SECRET/JWT_REFRESH_SECRET in the env file
  (env.ts throws under NODE_ENV=production) and ~2.7GB free RAM; closing
  agent-browser sessions before `next build` prevents OOM SIGKILL.
- `reset-state.sh` cannot wipe `teacher_transaction` after a settlement — the #140
  immutability trigger (financial audit trail) blocks DELETE. Full reset = wipe
  db/pglite + pglite-bootstrap.ts migrate+seed (now also ensures the approved
  teacher profile row).
- GraphQL-driven lifecycle setup must read the session id from the booking response
  (book1.json) — hardcoded ids break after any DB reset.
