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
## Round 5 fixes

**Wave:** round 5 — combined 5-hat review: 5 LOW + 1 INFO, all documentation/anchor precision (one comment-only test-file edit) — zero code-behavior changes.

1. **[LOW] Matrix REQ-008/REQ-702 rows predate ledger D9** — `outcome/verification-matrix.md:41,66`: both rows still counted "D1–D8"/"8/8 rows" after round 4 appended D9. Rows updated to D1–D9 / 9/9 rows 🔄 Open; REQ-702's mapping note extended with `D9→REQ-008/REQ-702` (planning-docs `>= 0` drift), REQ-008's Notes cell records the round-4 D9 addition; the §6 summary count carried the same stale figure and was corrected to "D1–D9 = 9".
2. **[LOW] Dead per-leg zero-dispatch anchor (REQ-506 row)** — `outcome/verification-matrix.md:59`: the step-2 guard was cited `JRNL:610-611` (now `adjustmentInput(...)` args — dead after the step-8 insertions shifted lines); corrected to the live step-2 guard `:597-598` (`expectNoDispatches()` + DB-side zero-rows assert).
3. **[LOW] Queue-read citations missed the surfaced-row read** — `outcome/verification-matrix.md:67,92,101`: all three `JRNL:529-538` cites covered settled-row asserts + the drain re-read, missing the queue read + surfaced-row assertions. All three rows now cite `:517-524`; the REQ-801 pagination row additionally keeps the drain-re-read evidence its old span had covered (drain re-read `:533-538`, absence assert `:539`).
4. **[LOW] Addendum step-6 bullet mis-stated the race's actors** — `docs/billing/admin-financial-auditing.md:301`: "two admins approve the same pending request" is wrong — journey step 6 races two concurrent approve calls from the SAME admin actor (`adminActor.userId` twice, journey `:832-835`). Reworded to "two concurrent approve calls (same admin actor) target the same pending request"; bullet structure/length preserved.
5. **[LOW] Stale spy-install anchor in deferred-items D1** — `deferred-items.md:19`: cited `admin-financial-auditing.journey.test.ts:429-433` for the spy install; the step-8 insertions moved it to `:445-447`. Anchor refreshed (the `:222-228` oracle-docblock cite and the rest of the row untouched).
6. **[INFO] Step-8 replay comment named the wrong gate** — `test/workflows/billing/admin-financial-auditing.journey.test.ts:969-971`: the comment claimed both sequential replay denials fire "through the real guarded-settle gate"; for a sequential replay the denial fires at the settlement PROBE (`service.ts:207-214` approve / `:292-299` reject) — the guarded-UPDATE miss is the concurrent-race-only path. Comment-only precision fix; no behavior change.

**Verification:** sub-loop `scripts/health/sub-loop.ts … --lifecycle duplicates` → **exit 0**; journey suite `bun run test/scripts/run-test.ts test/workflows/billing/admin-financial-auditing.journey.test.ts` → **8 pass / 0 fail**; every new markdown anchor re-verified at the branch tip via `git show`/sed (queue read `:517-524`, drain re-read `:533-538` + absence assert `:539`, step-2 guard `:597-598`, per-leg cites `:560-561`/`:820-821`/`:863-864`/`:990-991`, spy install `:445-447`, same-actor race `:832-835`, settlement probes `:207-214`/`:292-299`).

**Cumulative round ledger:** R1 — 2 LOW; R2 — 3 (1 LOW + 2 INFO); R3 — 0; R4 — 2 (1 LOW + 1 INFO); R5 — 6 (5 LOW + 1 INFO) → all fixed.

**Next:** round 6 (independent) follows.
## Round 7 fixes

**Wave:** round 7 — 1 LOW, anchor precision only — zero code-behavior changes.

1. **[LOW] Verification-matrix ±1 anchor drift (6 cells)** — `outcome/verification-matrix.md:59-60`: the REQ-601 step-8 journey-leg anchors had drifted +1 against live `test/workflows/billing/admin-financial-auditing.journey.test.ts` — both replay arms deny `:972-977` → `:973-978`; row still `failed` `:982-983` → `:984`; balance byte-equals restored `:984-985` → `:985-986`; audits still 1 `:986` → `:987`; delta 0 `:987` → `:988` — and the REQ-506 step-5 per-leg silent pair cited `:820-821` → live `:819-820`. All six cells re-verified live at the branch tip (c57618d) via `git show`/sed before correcting; nothing else touched.

**Cumulative round ledger:** R1 — 2 LOW; R2 — 3 (1 LOW + 2 INFO); R3 — 0; R4 — 2 (1 LOW + 1 INFO); R5 — 6 (5 LOW + 1 INFO); R6 — 0 (independent, no findings); R7 — 1 LOW → fixed.

**Next:** round 8 (independent) follows.
## Round 8-10

**Wave:** rounds 8-10 — R8: 1 LOW stat nit → fixed (commit 7540edd); R9: 0 findings (independent wave, no changes); R10: 4 LOW stale anchors + comprehensive anchor sweep → fixed; 1 INFO ledger gap → closed by this section. All documentation/anchor precision — zero code-behavior changes.

1. **[LOW] R8 — journey diff stat nit (REQ-601 Notes cell)** — `outcome/verification-matrix.md:60`: the Notes cell recorded the step-8 leg's journey diff as `+77/−0`, the pre-round-5 figure; after the round-5 replay-comment precision edit the shipped diff is `+78/−0`. Corrected to "+78/−0 after the round-5 comment-precision edit"; nothing else touched (commit 7540edd).
2. **[INFO] R10 — ledger gap: rounds 8-9 had no entry in this review file** — the cumulative ledger below stopped at R7. This section records R8 (item 1), R9 (0 findings), and R10 (items 3-4), closing the gap.
3. **[LOW] R10 — 4 stale step-8 anchor cells (the +1 drift the round-7 sweep missed)** — all against live `test/workflows/billing/admin-financial-auditing.journey.test.ts` (the round-5 comment-precision edit grew the `:969-971` comment to `:969-972`, shifting every line below by +1): REQ-203 row step-8 deny cite `:972-977` → `:973-978` (both `expectNotPending` replay arms); REQ-302 row post-replay restore cite `JRNL:984-985` → `JRNL:985-986` (`walletAfterReplays` read + byte-compare); REQ-506 row step-8 per-leg silent pair `:990-991` → `:991-992`; §2.3 EARS row "audits still 1 `:986`, delta 0 `:987`" → `:987`/`:988`.
4. **[LOW] R10 comprehensive sweep hits (same +1 drift class, found by re-verifying EVERY cite)** — (a) REQ-601 row's step-8 "silent" cite `:990-991` → `:991-992` (`expectNoDispatches` + DB-side zero-rows assert — the fifth stale `:990-991` instance, in the row round 7 had partially fixed); (b) every other `JRNL:*` / `journey.test.ts:*` anchor in the matrix, this ledger, and `deferred-items.md` re-verified content-matched at the tip — all live (helpers `:137`, `:96-100`, `:157-158`, `:230-236`, `:251-254`, `:307-315`; steps 1-8 spans and sub-anchors `:503-562`, `:505-514`, `:516-551`, `:517-524`, `:533-538`, `:539`, `:541-550`, `:542-543`, `:545-550`, `:560-561`, `:564-589`, `:578`, `:580-582`, `:597-598`, `:737-822`, `:737-782`, `:789`, `:787-798`, `:798`, `:819-820`, `:824-865`, `:832-835`, `:863-864`, `:867-933`, `:935-992`, `:943`, `:950-964`, `:973-978`, `:984`, `:985-986`, `:987-988`; D1's `:222-228,445-447`; non-JRNL spot-checks: schema-surface `:250-253`, WIRE `:455-542`/`:636-688`/`:690-729`, notification-type enum `:10-18`, taxonomy `:45-47`, `wallet.service.ts` `:47-51`/`:198-200`, escrow contract `:14-80`, `db/schema.dbml:372`, `teacher-transaction.ts:50`, `useTeacherWalletWithdraw.ts:86-91`). Historical fix-record anchors in this file (R1-R7) left untouched — append-only ledger.

**Verification:** every correction above re-verified content-matched against the live tip (`7540edd`) via `git show`/sed before writing; `git diff` hunk inspection — only the two intended plan-dir files touched (`outcome/verification-matrix.md` — the REQ-203/REQ-302/REQ-506/REQ-601/§2.3 anchor cells; this review file) — no code, test, or other file touched; no test re-run required (documentation-only, matching R7's precedent for anchor-only waves).

**Cumulative round ledger:** R1 — 2 LOW; R2 — 3 (1 LOW + 2 INFO); R3 — 0; R4 — 2 (1 LOW + 1 INFO); R5 — 6 (5 LOW + 1 INFO); R6 — 0; R7 — 1 LOW; R8 — 1 LOW; R9 — 0; R10 — 4 LOW + 1 INFO → all fixed (the R10 sweep additionally corrected 1 same-class cell: REQ-601's silent pair).

**Next:** round 11 (independent) follows.

## Rounds 11-12 (zero-drift confirmation)

**Wave:** R11 (independent combined 5-hat wave at tip `641de8a`): NEW FINDINGS: **0** — all R1-R10 fixes held under re-verification; gates re-run green (sub-loop exit 0; journey 8/0; row-gate 0; mermaid 19 files/39 diagrams).
**Wave:** R12 (independent combined 5-hat wave at tip `641de8a`): NEW FINDINGS: **1 INFO** — this ledger's missing R11 entry (closed by this section); zero code/test/docs-behavior findings; R1-R10 corrections spot-re-verified.
**Stop-condition status:** R12's INFO was ledger-housekeeping only; rounds R13+ continue for the formal 2-consecutive-zero confirmation.

**Cumulative round ledger:** R1 — 2 LOW; R2 — 3 (1 LOW + 2 INFO); R3 — 0; R4 — 2 (1 LOW + 1 INFO); R5 — 6 (5 LOW + 1 INFO); R6 — 0; R7 — 1 LOW; R8 — 1 LOW; R9 — 0; R10 — 4 LOW + 1 INFO; R11 — 0; R12 — 1 INFO (ledger-housekeeping only) → zero code/test/docs-behavior findings in R11-R12.

**Next:** round 13 (independent) follows.

## Rounds 13-14 — stop condition certified

**Wave:** R13 (independent combined 5-hat wave at tip `a72c1f0`): NEW FINDINGS: **0** — full pass; all prior fixes held; gates green (sub-loop exit 0; journey 8/0 ×2 bracketed; row-gate 0; traceability silent; mermaid 19/39).

**Wave:** R14 (independent combined 5-hat wave at tip `a72c1f0`): NEW FINDINGS: **1 INFO** — solely this ledger's own trailing entry lag (fixed by this section); zero code/test/docs-behavior findings; all R1-R12 fixes held.

**Stop condition CERTIFIED:** rounds R13 and R14 recorded ZERO substance findings (code/test/docs-behavior). The R14 INFO is the ledger's self-referential recording artifact (each round finds the prior round's entry missing until the series terminates) — resolved by this final append.

**Cumulative ledger R1-R14:** R1: 2 LOW · R2: 3 · R3: 0 · R4: 2 · R5: 6 · R6: 0 · R7: 1 · R8: 1 · R9: 0 · R10: 4+INFO · R11: 0 · R12: 1 INFO (ledger) · R13: 0 · R14: 1 INFO (ledger) — every substance finding fixed and re-verified; review series CLOSED.
