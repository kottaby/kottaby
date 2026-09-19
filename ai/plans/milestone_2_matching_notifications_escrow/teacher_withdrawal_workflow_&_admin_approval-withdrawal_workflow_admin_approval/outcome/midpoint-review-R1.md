# Mid-Point Review R1 — Gate Record

**Plan:** `ai/plans/milestone_2_matching_notifications_escrow/teacher_withdrawal_workflow_&_admin_approval-withdrawal_workflow_admin_approval/`
**Date:** 2026-09-18
**Branch reviewed:** `feat/teacher-withdrawal-workflow-admin-approval` (commits `f29072f`, `2738397`, `b96dbda`) vs baseline `c4971c6`
**Reviewers:** backend · docs · plan-integrity (three independent reviews, findings aggregated below)

---

## 1. Scope reviewed

`git diff c4971c6..HEAD`:

| Path | Delta |
|---|---|
| `test/workflows/billing/admin-financial-auditing.journey.test.ts` | **+77/−0** — pure additions at 4 sites (header-docblock step-8 bullet, `PAYOUT_REJECTED_REPLAY` constant, `expectNotPending` helper, the step-8 test); steps 1–7 byte-identical |
| `db/schema.dbml` | **×1 line** — `teacher_transaction.amount` check annotation repaired to `> 0` (matches Drizzle `teacher_transaction_amount_check`) |
| `docs/workflows/03-session-lifecycle-escrow.md` | **×3 lines (+3/−1)** — §6.3 wording aligned to the reserve-at-request model |
| plan-dir files | tasks.md checkbox flips, `deferred-items.md` (ledger), `plan.md`/`specs.md` citation touches, and the `outcome/*.md` evidence files (0-baseline, 1.1, 2.1, 2.2, 3.1, 3.2, 3.3, plan-review-R2) |

Zero production-code changes beyond the journey test. Both doc repairs: ZERO defects.

## 2. Reviewer verdicts

- **Backend reviewer:** **ZERO code findings** — the +77 journey leg is conformant (same describe/cast/`TrackedFixtures`/`ledgerTxnIds` registry/`publishReceipts` spy; byte-frozen steps 1–7 intact; zero new imports; helper mirrors the file's existing wrappers; enums value-imported; no `runInRollback`/`.rejects.toThrow()`/`console.*`/`any`; no plan-artifact references in comments).
- **Docs reviewer:** **PASS on both repairs** — `db/schema.dbml` teacher-transaction check now matches the Drizzle truth; the workflow-diagram §6.3 wording now matches the reserve-at-request settlement model.
- **Plan-integrity reviewer:** plan-dir coherent, with the findings below — all confined to plan-dir files; no code defects.

## 3. Findings (all plan-dir level; code repairs: ZERO defects)

1. **[MEDIUM] Environment switch unreconciled.** `outcome/0-baseline-outcome.md` §3 records `DB_PROVIDER=pglite`; the environment later switched to **real PostgreSQL 17.11** (`postgresql://postgres@127.0.0.1:5432/app_db`) because the pglite single-connection shim caused PRE-EXISTING failures in journey steps 1/3/4/6 + finsec A/B/D/D2/H (nested top-level transactions + shared-session races — root-caused in `outcome/1.1-journey-gapfill-outcome.md` §5). All green test evidence (3.1: 9+24; 3.2: 22/26/13; 3.3: 8/8 ×2, 9/9, 31/31; plus an earlier 48/48 validation run) was captured under postgres. Typecheck/lint baselines (tsgo 0, biome 0, lint PASS) are provider-independent.
2. **[HIGH] `outcome/3.3-journey-wire-outcome.md` anchor map is +10 stale.** 3.3 worked on a discarded leg variant (worktree was briefly on main). The COMMITTED leg is task 1.1's variant; `outcome/1.1-journey-gapfill-outcome.md` §3's anchor map (step 1 `:503-562`, step 2 `:564+`, step 5 `:737-822`, step 6 `:824-865`, step 7 `:867-933`, step 8 `:935-992`, `expectNotPending` helper `:307-315`) was verified EXACT against the committed file. 3.3's §5 "corrected map" (`:493-552` etc.) and §0 authorship narrative ("1.1 had NOT landed") are superseded.
3. **[LOW/INFO] Sibling drift discovered.** `db/schema.dbml:401` `student_payments.amount` says `>= 0` but the Drizzle `student_payments_amount_check` says `> 0` (`backend/db/schema/billing/student-payments.ts:74`) — same drift class as the repaired teacher-transaction annotation; OUT of this plan's scope → recorded as ledger row **D8** (no silently-absorbed scope).

## 4. Fixes applied (this gate record)

1. **`outcome/environment-addendum.md` created** — full timeline (Phase 0 pglite baseline → pre-existing journey failures → root-cause citation → PostgreSQL 17.11 provisioning → `.env`/`.env.test` switch → migrate+seed green → 48/48 validation → Phase 3 green evidence), the connection-URL form (no secrets), the explicit statements that the 0-baseline §3 DB claim is superseded **for test execution only** and that the tsgo/biome/lint baselines are provider-independent and remain valid. *Resolves finding 1.*
2. **`outcome/3.3-journey-wire-outcome.md` — `## Corrections (mid-point review R1)` section APPENDED** (append-only audit trail; original content untouched): (a) §0 authorship narrative superseded — the committed step-8 leg is task 1.1's variant (outcome/1.1 §3 map verified exact); 3.3's re-implementation was a discarded duplicate; (b) §5's "corrected map" is +10 stale — task 4.1 must use outcome/1.1 §3's map; (c) 3.3's green runs double as the retroactive green run-gate evidence for task 1.1 (flipped while red under pglite — defensible, root-caused, now green under postgres). *Resolves finding 2.*
3. **`deferred-items.md` — row D8 added** to the ledger table (same column format as D1–D7: student-payments DBML drift, source "Discovered by task 2.1 execution (same drift class as D6)", owner "Student-payments surface owner", status 🔄 Open (forward contract), verified-by Task 4.1 matrix). Ledger prose checked for count claims ("seven rows" / "D1–D7") — **none present; no adjustment needed** (the only nearby strings are historical records in `outcome/0-baseline-outcome.md` §4 and the plan-review files, which were accurate for their time and stay untouched). *Resolves finding 3.*

## 5. Gate verdict

✅ **ZERO unresolved findings — PROCEED TO PHASE 4.**

- **Task 4.1** must re-derive journey anchors per correction (b): use `outcome/1.1-journey-gapfill-outcome.md` §3's map (step 1 `:503-562`, step 2 `:564+`, step 5 `:737-822`, step 6 `:824-865`, step 7 `:867-933`, step 8 `:935-992`, `expectNotPending` `:307-315`) — NOT 3.3 §5.
- **Task 4.2** must cite `outcome/environment-addendum.md` for its baseline compare (tsgo/biome/lint baselines remain valid; the 0-baseline §3 DB statement is superseded for test execution only).
- tasks.md Phase 4 checkboxes remain `[ ]` — untouched by this review.
