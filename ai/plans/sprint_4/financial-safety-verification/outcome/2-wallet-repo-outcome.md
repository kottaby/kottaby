# Task 2 Outcome — Wallet repository coverage & constraint probes

**Plan:** `ai/plans/sprint_4/financial-safety-verification/`
**Date:** 2026-09-12
**Status:** COMPLETE

## Summary

Created `backend/db/test/repo/billing/wallet.repository.test.ts` — a 14-test
suite achieving **100% lines AND 100% functions coverage** of
`WalletRepository` (verified via `bun test --coverage`), covering all 6
methods: `ensureWalletOnce`, `creditEarningOnce`, `findByTeacherId`,
`listTransactionsByWalletId`, `debitForWithdrawalOnce`, `listRecentTransactions`.

The production code was NOT modified — this is a verification-only task.

## What Was Implemented

### Tier 1 — branch/statement (all 6 methods)
- `ensureWalletOnce`: creates a zeroed wallet ("0.00"/"0.00") for a teacher
  without one; idempotent re-enter (ON CONFLICT DO NOTHING → same row id,
  exactly 1 wallet row per fixture teacher — scoped count, never global).
- `creditEarningOnce`: one ledger row inserted (type `Earning`, status
  `Completed`, amount "25.00" verbatim, `sessionId` FK populated) + additive
  wallet UPDATE (balance AND total_earning both "0.00" → "25.00"); additive
  across two credits ("25.00" + "12.50" → "37.50", each amount verbatim).
- `findByTeacherId`: hit (wallet row for the owning teacher) + miss (null
  for an absent teacher id derived from `max(id) + 1_000_000`).
- `listTransactionsByWalletId`: every ledger row for the wallet, newest
  first (id DESC), scoped ledger count of 3.
- `listRecentTransactions`: limit 2 respected (newest two ids) + limit
  beyond row count returns all rows newest-first.
- `debitForWithdrawalOnce` success: one `pending` `Withdrawal` row +
  guarded balance debit ("50.00" → "40.00") with total_earning untouched;
  ledger count 1 for the fixture wallet.

### Tier 2 — boundaries
- Exact withdrawal boundary: `balance == amount` ("25.00") succeeds and
  lands exactly on "0.00" with total_earning preserved.
- Decimal-string fidelity asserted via exact STRING comparisons only —
  no numeric arithmetic on money anywhere in the suite.

### Tier 2.5 — insufficient-funds zero-writes proof
- `debitForWithdrawalOnce` with `balance ("10.00") < amount ("25.00")`:
  returns null, wallet untouched, AND the pending ledger row the call
  inserted is verified to roll back — the probe runs inside a nested
  `tx.transaction` (savepoint) that asserts the pending row exists inside
  the probe (count 1), then throws to roll it back; after the rollback the
  outer transaction asserts count 0 and balance "10.00". This is the
  "orphan pending row dies with the transaction" guarantee.

### Tier 4 — constraint probes (savepoint-bracketed)
Three CHECK probes, each inside its own `savepoint` / `rollback to
savepoint` bracket so the outer transaction stays queryable:
- Direct `balance = "-1.00"` → `wallet_balance_check` (23514, constraint
  name asserted via `constraintNameOf` + cause-chain message).
- Direct `total_earning = "-1.00"` → `wallet_total_earning_check`.
- Direct negative ledger insert (amount "-5.00") →
  `teacher_transaction_amount_check`.

### Tier 4 — API-surface + namespace closure
- `Object.keys(WalletRepository)` exposes exactly the 6 documented methods;
  none named update/delete (the append-only ledger has no mutation
  primitive at this boundary).

### Defensive zero-row guards (coverage completeness)
The repos' `if (!ledger) throw` guards are unreachable through a live
PostgreSQL `INSERT … RETURNING` (which always yields one row per inserted
tuple) — consistent with the repo-wide pattern (the identical guard in
`SessionRepository.insertSession:99` is covered only via the service-tier
forced-failure chaos test). Covered here through a typed executor stub
(`insert().values().returning()` → `[]`) whose type is asserted via a type
guard (`isZeroRowInsertStub`) — never `as any`/`as unknown as` (oxlint
type-aware `no-unsafe-type-assertion` rejects narrowing assertions; the
type-guard route is the documented fix pattern). Both guard branches in
`creditEarningOnce` and `debitForWithdrawalOnce` now execute, closing the
100% lines/functions gap.

## Files Created / Modified

| File | Change |
|---|---|
| `backend/db/test/repo/billing/wallet.repository.test.ts` | **CREATED** (only file) |
| `ai/plans/sprint_4/financial-safety-verification/tasks.md` | checkbox flips for Task 2 + subtasks (documentation) |

No production file was modified. The new `repo/billing/` test sub-directory
contains no `index.ts` (test files are glob-discovered).

## Verification Results

| Check | Result |
|---|---|
| `sub-loop.ts --lifecycle duplicates` | **exit 0** (tsgo ✓ → oxlint ✓ → biome ✓ → lint:type-aware ✓ → duplicates ✓) |
| `bun run test/scripts/run-test.ts backend/db/test/repo/billing/wallet.repository.test.ts` | **14 pass / 0 fail** (62 expects, 290 ms) |
| `bun test --coverage` (`KOTTABY_TEST_RUNNER_OK=1`) | `backend/db/repo/billing/wallet.repository.ts` — **100.00 lines / 100.00 functions** |

First sub-loop iteration surfaced two fixable issues (both in the test file):
a missing `constraintNameOf` import (TS2304) and an oxlint
`no-unsafe-type-assertion` warning on the executor-stub cast — both fixed;
the re-run exited 0 with no remaining findings.

## Carry-Forward Knowledge

- `WalletRepository` methods all take `tx?: DBTransaction` as their LAST
  parameter; the test passes `tx` to every repo call, entity-setup helper,
  and direct Drizzle query inside `runInRollback`.
- The insufficient-funds zero-writes proof uses `tx.transaction` (a
  savepoint on the outer rollback harness) — a nested throw rolls back only
  the probe's own writes; the outer `runInRollback` transaction survives.
  This mirrors the service-tier savepoint pattern in
  `backend/services/billing/wallet.service.test.ts`.
- Executor stubs must satisfy oxlint's type-aware
  `no-unsafe-type-assertion`: `as unknown as DBTransaction` is rejected —
  use an `is X` type guard instead (the guard itself claims the seam).
- `insertLedgerRows` uses a recursive helper (the mandated
  `no-await-in-loop` pattern for sequential shared-transaction inserts).
- Sequential ledger inserts make the id sequence deterministic, which the
  ordering assertions rely on (`id DESC` newest-first).
- `constraintNameOf` resolves the CHECK constraint name through the
  Drizzle cause chain; combine with `hasPostgresErrorCode(err, "23514")`
  for defense in depth.

## Cross-File Dependencies Discovered

None. All fixtures came from the existing `backend/db/test/entity-setup.ts`
helpers (`createTestUser`, `createTestTeacherRow`, `createTestStudent`,
`createTestSession`, `createTestWallet`, `createTestTeacherTransaction`) and
`backend/db/test/test-utils.ts` (`runInRollback`, `expectRepoError`,
`constraintNameOf`). No production or shared file needed changes.

## Defect Findings

None. Every probe asserted against the shipped code matched it exactly:
- CHECK constraint names are exactly `wallet_balance_check`,
  `wallet_total_earning_check`, `teacher_transaction_amount_check`
  (schema ground truth `backend/db/schema/billing/wallet.ts:34-35`,
  `teacher-transaction.ts:45`).
- The insufficient-funds path commits zero writes as documented.
- `total_earning` is untouched by withdrawals as documented.
