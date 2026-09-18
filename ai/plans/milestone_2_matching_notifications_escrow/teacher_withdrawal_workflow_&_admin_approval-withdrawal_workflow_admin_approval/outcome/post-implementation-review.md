# Post-Implementation Review

**Plan:** `ai/plans/milestone_2_matching_notifications_escrow/teacher_withdrawal_workflow_&_admin_approval-withdrawal_workflow_admin_approval/`
**Branch:** `feat/teacher-withdrawal-workflow-admin-approval`
**Scope:** post-implementation review waves over the completed milestone work.

## Round 1 fixes

**Wave:** round 1 — 4 independent reviewers: backend (2 LOW), types (0), frontend (0), pentest (0). Both findings LOW, wording/provenance-level only — zero code-behavior changes.

1. **[LOW] Journey test comment wording** — `test/workflows/billing/admin-financial-auditing.journey.test.ts:157`: the `PAYOUT_REJECTED_REPLAY` docblock claimed the failed row is "re-settled", but both re-settlement attempts on it are DENIED (never re-settled). Comment-only fix, single line +1/−1: "(a fresh request, rejected, then re-settled)" → "(a fresh request, rejected, then re-attempted for settlement denial)".
2. **[LOW] Docs addendum path shorthand** — `docs/billing/admin-financial-auditing.md:302-303`: the verification addendum cited `outcome/verification-matrix.md` and `outcome/environment-addendum.md` by bare relative path; all three citations expanded to the full plan-relative form used at `:296` (`ai/plans/.../outcome/...`). No other wording changes.

**Verification:** sub-loop `scripts/health/sub-loop.ts … --lifecycle duplicates` → **exit 0** (duplicates check passed); journey suite `bun run test/scripts/run-test.ts test/workflows/billing/admin-financial-auditing.journey.test.ts` → **8 pass / 0 fail** (147 expect calls, exit 0); `git diff` hunk inspection → only the two intended edits (2 files, 3+/3−).

**Next:** re-review round 2 follows.

## Round 2 fixes

**Wave:** round 2 — 4 independent reviewers: backend (1 LOW + 1 INFO), types (0), frontend (0), pentester (1 INFO). All three findings documentation-precision only — zero code-behavior changes.

1. **[LOW] Addendum race bullet overgeneralized the concurrent-settle journeys** — `docs/billing/admin-financial-auditing.md:301`: one bullet claimed BOTH the double-settle (`:824-865`) and settle∥new-request (`:867-933`) journeys end with "exactly one winner, one audit row, and one balance movement". True only for the double-settle race. Before → after: the single bullet was split into two — step 6 double-settle (`test/workflows/billing/admin-financial-auditing.journey.test.ts:824-865`): exactly one approve wins (loser = localized not-pending conflict), one audit row, one balance movement (the reserve was already taken at request time — the winning approve settles the reservation, no second debit); step 7 settle∥new-request (`:867-933`): NO loser — both legs land valid and the final balance arithmetic is exact `start − A − B` (two request-time reserves). The tail ("guarded pending predicate remains the arbiter (§7), no `SELECT FOR UPDATE` anywhere") is preserved.
2. **[INFO] Bare journey filename in the same bullet** — the addendum cited `admin-financial-auditing.journey.test.ts` without its repo path; the reworked bullet cites the full repo-relative path `test/workflows/billing/admin-financial-auditing.journey.test.ts`, consistent with the round-1 provenance fix.
3. **[INFO] Stale §2 anchor in `outcome/3.3-journey-wire-outcome.md`** — the §2 green-run table records the step-8 leg at `:925-989`, predating the round-1 comment edit; appended correction **(d)** to the existing `## Corrections (mid-point review R1)` section noting the shipped range is `:935-992` (as already carried by the docs verification addendum + `outcome/verification-matrix.md`). Append-only — no prior wording rewritten.

**Cumulative round ledger:** R1 — 2 LOW fixed (journey comment wording; addendum provenance paths). R2 — 1 LOW + 2 INFO fixed (race arithmetic split; full-path journey citation; §2 anchor provenance note).

**Next:** round 3 (independent) follows.

## Round 4 fixes

**Wave:** round 4 — reviewers: backend + pentest (1 LOW + 1 INFO); types + frontend + docs (0). Both findings documentation-precision only — zero code-behavior changes.

1. **[LOW] Stale `>= 0` bound in §4 of the canonical doc** — `docs/billing/admin-financial-auditing.md:119`: §4 claimed `teacher_transaction.amount` has a `>= 0` CHECK while the DB truth is `> 0` (`db/schema.dbml:372`, `backend/db/schema/billing/teacher-transaction.ts:50`, migration `20260914064155`), contradicting the doc's own verification addendum (:291-304). Before → after (one word): "signed amounts (`teacher_transaction.amount` has a `>= 0` CHECK)" → "signed amounts (`teacher_transaction.amount` has a `> 0` CHECK)". Nothing else in §4 touched.
2. **[INFO] §3 anchor span in `outcome/4.3-knowledge-propagation-outcome.md`** — §3 recorded the addendum as "lines 291–303 … six fact bullets at :298–303"; the shipped addendum is seven bullets ending at :304. Append-only correction line at EOF: "Correction (round-4 review): the addendum spans :291-304 with seven fact bullets (the zero-dispatch bullet at :304 was outside the originally cited span)."
3. **Ledger row D9** — appended to `deferred-items.md` (7-column format, after D8): planning artifacts still citing the stale `>= 0` bound (`docs/planning/PRODUCTION_READINESS.md:100,261`; `docs/planning/TICKETS.md:1793` as frozen historical ticket text, not a drift to repair) — discovered by round-4 review; owner: planning-docs owner; status 🔄 Open (forward contract); Verified By: Task 4.1 matrix; same drift class as D6/D8. Frozen planning docs are historical records — repair belongs to the planning-docs owner; nothing silently absorbed.

**Verification:** `git diff` hunk inspection — only the four intended edits (§4 one-word bound fix; 4.3 correction append; ledger D9 row; this section). No code, test, or other doc file touched.

**Cumulative round ledger:** R1 — 2 LOW fixed; R2 — 1 LOW + 2 INFO fixed; R3 — 0 (independent, no findings); R4 — 1 LOW + 1 INFO → fixed.

**Next:** round 5 (independent) follows.
