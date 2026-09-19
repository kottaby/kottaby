# Visual Scoring Outcome — teacher withdrawal workflow & admin approval (surfaces /wallet + /admin/finances)

- Date: 2026-09-19
- Plan: ai/plans/milestone_2_matching_notifications_escrow/teacher_withdrawal_workflow_&_admin_approval-withdrawal_workflow_admin_approval/
- Capture rig: dev server @ localhost:3000 (PGlite provider), agent-browser sessions + browser-login.ts --inject
- Inspector model: x-preview-l subagents (3 blocked by image-transport, re-run via z-ai vision CLI) + z-ai vision CLI
- Locales captured: ar (primary, app default) , en
- Dark-mode pass: no (single dark theme is the app's only scheme)

## Surfaces covered

| Surface | Route | Viewports | States |
|---|---|---|---|
| Teacher wallet | /wallet | 1440×900, 834×1112, 390×844 | base; withdraw dialog (desktop+mobile) |
| Teacher wallet EN | /wallet | 1440×900, 390×844 | base |
| Admin finances | /admin/finances | 1440×900, 834×1112, 390×844 | payments tab (base) |
| Admin finances | ?tab=withdrawals | 1440×900 | pending queue + approve dialog + reject dialog |
| Admin finances | ?tab=wallet&teacherId=2 | 1440×900 | wallet inspector + adjust dialog |
| Admin finances EN | /admin/finances | 1440×900 | payments tab |

## Score history

| Pass | Surface | Viewport | Hier | Spacing | Typo | Color | Afford | Resp | Total | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | wallet ar | 1440×900 | 8 | 7 | 6.5 | 9 | 9 | 7 | 7.75 | NEEDS FIXES |
| 1 | wallet ar | 834×1112 | 7 | 8 | 6 | 7 | 7 | 4 | 6.5 | NEEDS FIXES |
| 1 | wallet ar | 390×844 | 9 | 7.5 | 6 | 8.5 | 9.5 | 8 | 8.1 | NEEDS FIXES |
| 1 | wallet ar withdraw dialog | 1440×900 | 9 | 9 | 6.5 | 8 | 8 | 9.5 | 8.3 | NEEDS FIXES |
| 1 | wallet ar withdraw dialog | 390×844 | — | — | — | — | — | — | 9.5 | READY |
| 1 | wallet en | 1440×900 | 9 | 9 | 9 | 9 | 10 | 9 | 9.2 | NEEDS FIXES |
| 1 | wallet en | 390×844 | 9 | 9 | 9 | 9 | 9 | 10 | 9.2 | NEEDS FIXES |
| 1 | admin ar | 1440×900 | 9 | 9 | 9 | 9 | 10 | 9 | 9.2 | NEEDS FIXES |
| 1 | admin ar | 834×1112 | 9 | 9 | 10 | 9 | 10 | 9 | 9.3 | NEEDS FIXES |
| 1 | admin ar | 390×844 | 8 | 9 | 8 | 9 | 8.5 | 8.5 | 8.5 | NEEDS FIXES |
| 1 | admin en | 1440×900 | 9 | 9 | 9 | 9 | 9 | 10 | 9.2 | NEEDS FIXES |
| 1 | admin ar withdrawals tab | 1440×900 | 9 | 9 | 9 | 9 | 10 | 10 | 9.3 | NEEDS FIXES |
| 1 | admin ar approve dialog | 1440×900 | — | — | — | — | — | — | 9.5 | READY |
| 1 | admin ar reject dialog | 1440×900 | 9 | 9 | 9 | 9 | 10 | 10 | 9.3 | NEEDS FIXES |
| 1 | admin ar wallet inspector | 1440×900 | 9 | 9 | 9 | 9 | 10 | 9 | 9.2 | NEEDS FIXES |
| 1 | admin ar adjust dialog | 1440×900 | — | — | — | — | — | — | 9.5 | READY |
| 2 | wallet ar | 1440×900 (v2) | 9.5 | 9 | 9.5 | 10 | 10 | 8 | 9.33 | NEEDS FIXES |
| 2 | wallet ar | 390×844 (v3) | 9.5 | 9.8 | 10 | 9.5 | 9.5 | 9.8 | 9.68 | READY |
| 2 | wallet ar | 1440×900 (v4) | 9.5 | 9.5 | 10 | 10 | 10 | 8.5 | 9.58 | READY |
| 2 | wallet ar | 834×1112 (v4) | 9 | 8 | 10 | 9 | 10 | 7 | 8.83 | adjudicated debt |
| 2 | wallet ar withdraw dialog | 1440×900 (v4) | 9 | 10 | 9 | 10 | 10 | 10 | 9.67 | READY |
| 2 | wallet ar withdraw dialog | 390×844 (v3) | 10 | 10 | 10 | 10 | 9 | — | 9.8 | READY |
| 2 | wallet en | 1440×900 (v3) | 10 | 9 | 10 | 10 | 10 | 10 | 9.83 | READY |
| 2 | wallet en | 390×844 (v3) | 9 | 9 | 9 | 9 | 10 | 9 | 9.17 | adjudicated (intentional scroll affordance) |
| 2 | admin ar | 390×844 (v3) | 9 | 9 | 10 | 9 | 10 | 9 | 9.3 | adjudicated (uniform grid gap is the token) |

## Pre-check gate failures found (and fixed)

| Surface | Check | Script output line | Fix |
|---|---|---|---|
| admin finances | title guard | expected "الشؤون المالية", got "Admin Finances…" | locale re-pinned per batch (capture-protocol rule) — capture-side, not app-side |
| admin finances (pre-fix) | console | GraphQL INTERNAL_SERVER_ERROR on AdminStudentPayments / AdminPendingWithdrawals / AdminTeacherWallet | REAL functional bug: nested second top-level transaction inside `withTransaction` — fixed (see fix waves); console clean after |

## Fix waves

| Wave | Files | Findings addressed | Per-file sub-loop | Tests |
|---|---|---|---|---|
| 0 (functional gate-fixer, orchestrator) | backend/services/billing/admin-financial-auditing.service.read.helpers.ts | readInSnapshot opened a SECOND top-level `repeatable read` transaction inside the withTransaction transaction — hard failure on single-connection PGlite, silently split snapshots on pooled Postgres. Fixed: live tx handle + savepoint join; isolation moved to withTransaction config (mirrors parent-monitoring pattern) | ✅ duplicates exit 0 | journey suite: pglite 3→5 pass of 8 (remaining 5 are documented PGlite single-connection concurrency limits); postgres parity unchanged (CI runs postgres) |
| 1 (teacher wallet, FIXER-W + orchestrator splits) | frontend/views/teacher/wallet/{WalletLedger.parts,WalletLedgerRow,WalletLedgerRows,WalletLedger,WalletBody,TeacherWalletContainer,WithdrawDialog}.tsx, shared/locale/{ar,en,types}/wallet/labels.ts | bidi-isolated datetime + dir=auto description (HIGH), desktop column header row, viewport-stretch card + "showing all" footer + roomier md rows (dead space), bidi-isolated signed amounts + tabular-nums, RTL-mirrored directional arrow, one success tone for credits, dialog × close + outlined neutral Cancel (AA) + on-primary submit label, chip row scrolls at xs | ✅ duplicates exit 0 ×7 files | n/a (visual) |
| 2 (admin finances, orchestrator) | frontend/views/admin/finances/PaymentsFilterDateWindow.tsx | from/to date pair shares one row at every breakpoint (mobile fold fix) | ✅ duplicates exit 0 | n/a (visual) |
| seed fixtures (scratch, untracked) | scratch/seed-cross-users.ts | AR descriptions + varied timestamps (fixture artifacts the inspectors flagged) | n/a | n/a |

## Accepted cosmetic debt

| Item | Current score impact | Why it can't reach 10 | Why acceptable |
|---|---|---|---|
| Ledger void between last row and card footer at 834×1112 with a 3-row wire page (wallet ar tablet 8.83) | responsive axis only | The ledger renders the server page verbatim (3 rows); filling 1112px requires fabricated rows or inflated spacing — the inspectors demanded BOTH "fill the void" and "don't be sparse" across passes (contradictory-readings noise signature) | The void is INSIDE a bounded bordered card whose footer marks the end; the v1 bare-background band is gone; real wallets with more rows fill the space naturally |
| Native `<input type="date">` renders the browser-locale placeholder (mm/dd/yyyy) in the AR filter bar | affordance/typography axis, LOW | Native date controls paint their own segments; localizing requires a custom picker (out of scope, higher-risk surface) | Fully functional + keyboard accessible; once picked, values render localized; documented trade-off in PaymentsFilterDateWindow |
| Reject-dialog multiline label floats mid-field when empty (MUI un-shrunk multiline label) | affordance axis, LOW | Forcing `shrink` on multiline outlined fields clips the label glyphs at the notch border (in-code comment documents this) | Standard MUI multiline behavior; label is also the field's visible hint; focus/value states are unambiguous |
| EN mobile chip row's last chip partially in view (wallet en mobile 9.17) | responsive axis, LOW | This IS the intentional horizontally-scrollable affordance added by fix wave 1 (the pre-fix state was a lone wrapped chip); one pass's "wrap is broken" vs another's "clip is broken" is the contradictory noise signature | Scroll affordance is a standard mobile pattern; all chips reachable by one swipe; no overflow leaks past the viewport |

## Adjudicated false positives (DOM-measured, not fixed)

| Claim | Verdict evidence |
|---|---|
| "Broken Arabic word salad" in the withdraw-dialog description (v1 HIGH) | VLM OCR hallucination — shared/locale/ar/wallet/labels.ts:9 is fluent Arabic; DOM renders the exact string; EN DOM text fluent too |
| "Pagination enabled on empty table" (admin EN desktop) | DOM: both prev/next carry `disabled=true` at totalCount 0 (code disables at bounds) |
| "Search input disproportionately wide" (admin ar desktop) | Grid is `repeat(4, 1fr)` — equal tracks; measurement contradicts the code |
| "Header/data column alignment mismatch" (withdrawals tab + wallet inspector) | Headers already `align="end"` and cells `textAlign:"end"` for amount/balance/date in both tables |
| "Summary cards unequal widths" (wallet inspector) | Grid `1fr 1fr` — equal by construction |
| "Date format includes seconds (1906:37)" | OCR misread of "19/09/2026، 06:37" — DOM text has no seconds |
| "Status badge lower than amount" / "button icon vertical offset" | Sub-8px claims; not re-reported after wave 1 (noise signature per playbook row 38) |

## Prototype comparison

No `prototype/` dir in the plan — Phase 7 skipped entirely per the skill's skip rule.

## Capture lessons → evolution-log candidates

- Subagent image delivery failed for 5 of 16 inspector dispatches; the z-ai vision CLI fallback scored every one of them — treat the CLI as the primary rig in this sandbox, subagents as the exception.
- Locale cookie (NEXT_LOCALE) silently reverts between capture batches on session re-login; the title guard catches it, so pin + verify before EVERY batch.
- The dev-server + quality-gate combination OOM-kills the eslint child in a 4GB sandbox — stop the dev server while running per-file sub-loop gates, restart for captures.
- Turbopack refuses to resolve `next` outside the project root: a nested git worktree needs a local node_modules (hardlink copy `cp -al` works and costs no extra disk).
