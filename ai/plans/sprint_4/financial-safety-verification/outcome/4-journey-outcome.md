# Task 4 Outcome — Cross-Actor Adversarial Journey (Financial Safety)

**Plan:** `ai/plans/sprint_4/financial-safety-verification/`
**Date:** 2026-09-12
**Status:** COMPLETE

## Deliverable

`test/workflows/billing/financial-safety-verification.journey.test.ts` — one journey file,
per-run prefix `jrn_billing_finsec_<8hex>` (`journeyPrefix("billing_finsec")`), 9 tests /
127 expects, all green against the real PostgreSQL `kottaby_test`
(`postgresql://postgres:postgres@127.0.0.1:5432/kottaby_test`).

## Files Touched

| File | Change |
|---|---|
| `test/workflows/billing/financial-safety-verification.journey.test.ts` | NEW — the journey (only production-adjacent artifact; no production code modified) |
| `ai/plans/sprint_4/financial-safety-verification/tasks.md` | Task 4 checkbox + 5 subtask checkboxes flipped to `[x]` |
| `ai/plans/sprint_4/financial-safety-verification/outcome/4-journey-outcome.md` | NEW — this outcome file |

## Journey Architecture

- **Cast (beforeAll, ONE committing `db.transaction`)**: 6 real actors via the
  `actor-context` factory — STUDENT, NON-PARTICIPANT (student), TEACHER, TEACHER2
  (certified), PARENT, ADMIN — each with `{ locale: "en", tracked: registry }`; STUDENT
  funded with exactly `balanceHifz: 1` (the trial lane stays 0 so the booking ladder
  debits the hifz lane → `heldBalanceLane = Hifz`).
- **Spy**: `NotificationEngine.publishReceipts` recording no-op installed in `beforeAll`,
  restored in `afterAll`; each publish asserted together with its `recipientUserIds`.
- **Teardown (afterAll)**: ledger rows + wallets deleted for both teachers under
  `withImmutabilityTriggersSuspended(["teacher_transaction"], ...)`, then
  `registry.cleanup()` (18 tracked rows: 6 users + 6 role-children + 4 sessions + 2
  idempotency claims), then zero-residue probes (sessions gone, both wallets 0, both
  ledgers 0, both students' inboxes 0) — a leak fails the suite.

## Step-by-Step Probe Results (all PASS)

| Step | Probe | Result |
|---|---|---|
| A | Double-spend race: 4 concurrent `createSession`, each its OWN key, over 1 funded hifz unit | exactly 1 fulfilled / 3 rejected; every rejection code ∈ {INSUFFICIENT_BALANCE, DUPLICATE_REQUEST}; `balanceHifz` 1 → 0; exactly ONE `feeHeld=true` session for the pair; won row: `heldBalanceLane=Hifz`, `fee="25.00"`; exactly 1 of the 4 idempotency claims survived (losers' claims rolled back) |
| B | Escrow cancel release | status Cancelled; `feeHeld` false; `balanceHifz` restored 0 → 1 exactly once; lane STILL `Hifz`; 0 teacher transactions; 0 wallets; 0 new publishes; re-cancel → `SESSION_INVALID_TRANSITION` (ConflictError); lane unchanged after |
| C | Dual-confirm credit | re-book (fresh key) succeeds, unit 1 → 0; `startSession` then `completeSession` (the completion predicate requires the `started` pre-state) → Completed, teacher stamp set; exactly ONE publish post-commit, `recipientUserIds == [student.userId]`; student confirm → exactly ONE ledger row (Earning/Completed/"25.00"/sessionId=C); wallet `balance="25.00"`, `totalEarning="25.00"`; `feeHeld` false; lane stays 0 |
| D | Withdrawal drain race | 2 concurrent `requestWithdrawal("25.00")`: exactly 1 fulfilled / 1 rejected (`WALLET_INSUFFICIENT_FUNDS`, ConflictError); `balance="0.00"` exact; ledger = 2 rows (1 Earning Completed + 1 Withdrawal Pending "25.00"); identity `"25.00" − "25.00" == "0.00"` on exact decimal strings (`toCents` bigint helper — never `Number()`) |
| D2 | Input fuzz (9 amounts: "", " ", "abc", "0.00", "-5", "1e9", "12.345", "99999999.00", "1,000") | all 9 rejected pre-DB with `WALLET_INVALID_AMOUNT` + exact `t().walletInvalidAmount` copy; `balance="0.00"` after every rejection; ledger count still 2 |
| E | Wallet-first-earning race | wallet2 pre-ensured (`ensureWalletOnce`); 2 completed fixture sessions ("10.00"/"15.00"); 2 concurrent `creditEarningOnce` → both fulfilled; exactly 1 wallet row; `balance="25.00"`, `totalEarning="25.00"`; exactly 2 earning ledger rows |
| F | Adversarial immutability | direct `tx.update(teacherTransaction)` inside its own transaction → throws; error cause-chain contains `"teacher_transaction is immutable"`; row reads back byte-identical (amount/description/type) |
| G | Denials | non-participant `confirmSessionCompletion` → `SESSION_NOT_FOUND` + exact `t().sessionNotFound`; non-participant `cancelSession` → same; owner row byte-identical after both (status/stamps); parent `getMyWallet` → `WALLET_TEACHER_PROFILE_MISSING` + exact `t().walletTeacherProfileMissing` |
| H | Teardown worklist | 18 tracked rows (6 users + 6 role-children + 4 sessions + 2 claims); registry counts asserted per table |

## Verification Results

| Check | Command | Result |
|---|---|---|
| Quality gate | `DATABASE_URL=… DB_PROVIDER=postgres ~/.bun/bin/bun run scripts/health/sub-loop.ts test/workflows/billing/financial-safety-verification.journey.test.ts --lifecycle duplicates` | **exit 0** — tsgo ✓, oxlint ✓, biome:check ✓, lint:type-aware ✓, check:duplicates ✓ (auto-printed rule files: `tests.instructions.md`, root `AGENTS.md` — read and validated) |
| Journey suite | `~/.bun/bin/bun run test/scripts/run-test.ts test/workflows/billing/financial-safety-verification.journey.test.ts` | **9 pass / 0 fail** (127 expects) — green on repeated runs |
| Layer-wide | `~/.bun/bin/bun run test/scripts/run-test.ts test/workflows` | 250 pass / 12 fail — **all 12 failures are PRE-EXISTING**: verified by `git stash -u` (removing the new file) and re-running the three failing suites, which fail identically without it |

### Pre-existing layer failures (NOT attributable to this task)

| Suite | Fails with & without the new file |
|---|---|
| `test/workflows/sessions/session-state-machine.journey.test.ts` | 2 (concurrent admin resolves race + follow-on) |
| `test/workflows/classes/session-report-homework.journey.test.ts` | 9 (notification fan-out count expectations: received 4/expected 2, etc.) |
| `test/workflows/admin/audit-completeness.journey.test.ts` | 1 (verb-filter `totalCount` received 8 / expected 4) |

The fan-out/count failures are consistent with suites sharing one database and observing
each other's committed notification rows when run in one process — an environment/suite-
isolation issue in existing tests, out of this task's authority.

## Defect Evidence (recorded, not fixed — out of authority)

1. **`registry.register` requires a `PgTable`** — the registry is table-generic with a
   physical-name default key; journeys must pass the table object, not a string.
2. **Drizzle wraps driver errors** — step F's trigger RAISE surfaces as
   `DrizzleQueryError` ("Failed query: …"); the immutable message lives in `.cause`.
   The journey walks the cause chain. Existing probe suites (`backend/db/test/logic/billing/financial-immutability.test.ts`)
   may want the same treatment if they assert on top-level messages.
3. **`createSession` has no `outerTx`-visible idempotency-key return** — the winner's
   claim is located post-race by querying all attempted keys (exactly 1 row survives).
4. **Layer-wide pre-existing failures** listed above — logged for the matrix
   ratification task (5), not re-routed here.

## Carry-Forward Knowledge

- Sub-loop for journey files needs `DATABASE_URL` + `DB_PROVIDER` as OS-env inline (the
  `@/scripts/lib` barrel pulls `@/backend/db` at module scope with no project `.env`);
  the test runners load `.env.test` themselves.
- The booking ladder tries the **trial lane first** — to exercise a hifz-lane hold, the
  student's `balanceTrial` must stay 0 while `balanceHifz` is funded.
- `completeSessionOnce` requires `status = Started` — a journey must call
  `startSession` before `completeSession` (the fabricate-expired path bypasses this with
  a committed fixture write instead).
- Race cells: N=4 booking attempts + 2 withdrawals + 2 credits — all within the N ≤ 8 cap.
- Money assertions use a bigint cents helper (`toCents`/`subtractMoney`); no `Number()`
  on any amount anywhere in the file.
