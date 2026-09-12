# Task 3 Outcome — Immutability & Trigger-Tier Probes

**Plan:** `ai/plans/sprint_4/financial-safety-verification/`
**Date:** 2026-09-12
**Status:** COMPLETE

## Summary

Created `backend/db/test/logic/billing/financial-immutability.test.ts` — a trigger-tier
verification suite proving financial-ledger immutability for `teacher_transaction`,
`student_payments`, and `audit_logs`. Production code and migrations were NOT modified;
this task created one test file only. **10 tests / 52 expects, all green** against the
real PostgreSQL `kottaby_test` instance (trigger-tier block RUNS, does not skip —
matching the Task 0 baseline prediction).

## Files Created / Modified

| File | Action |
|---|---|
| `backend/db/test/logic/billing/financial-immutability.test.ts` | CREATED (the only code file) |
| `ai/plans/sprint_4/financial-safety-verification/outcome/3-immutability-outcome.md` | CREATED (this file) |
| `ai/plans/sprint_4/financial-safety-verification/tasks.md` | MODIFIED (Task 3 checkboxes flipped) |

No production source, schema, migration, or other test file was touched.

## Probe Results

### Trigger-presence probes (Tier 1 — `pg_trigger`, pattern from `audit-immutability.test.ts`)

Probe shape: `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = '<table>'::regclass AND NOT tgisinternal`

| Table | Triggers found | tgenabled | Result |
|---|---|---|---|
| `teacher_transaction` | `prevent_teacher_transaction_update_trigger`, `prevent_teacher_transaction_delete_trigger` | `O` (both) | PASS — both present AND enabled |
| `student_payments` | `prevent_student_payments_update_trigger`, `prevent_student_payments_delete_trigger` | `O` (both) | PASS — both present AND enabled |
| `audit_logs` | `prevent_audit_logs_update_trigger`, `prevent_audit_logs_delete_trigger` | `O` (both) | PASS — both present AND enabled |

A fourth test asserts each table carries EXACTLY the two migration-installed triggers
(exactly 2 non-internal triggers, every name in the expected set).

### Adversarial tamper probes (Tier 2 — savepoint-bracketed, `expectRepoError` + cause-chain walk)

| Probe | Error text observed (deepest cause) | Result |
|---|---|---|
| `tx.update(teacher_transaction).set({ amount: "999.99" })` | `teacher_transaction is immutable — UPDATE is not permitted` | PASS — row read back, snapshot equal (unchanged) |
| `tx.delete(teacher_transaction)` | `teacher_transaction is immutable — DELETE is not permitted` | PASS — row still present |
| Idempotent re-probe (same UPDATE, 2 savepoints) | identical message both attempts | PASS |
| Compensating-row doctrine (corrective INSERT while mutation fails) | mutation raised `...is immutable`; INSERT succeeded | PASS — new row appended with distinct id |
| `tx.update(studentPayments).set({ amount: "999.99" })` on a PAID row | `student_payments is immutable — UPDATE is permitted only to transition a pending payment to paid or failed with all financial columns unchanged` | PASS — row still present (the full transition matrix is NOT duplicated from `student-payment.repository.test.ts:206-213`) |
| `tx.delete(studentPayments)` on a PAID row | `student_payments is immutable — DELETE is not permitted` | PASS — row still present |

Runtime gating: the trigger-tier blocks are wrapped in
`const describeTriggerTier = isPgliteProvider() ? describe.skip : describe;`
(exact precedent from `audit-immutability.test.ts:418`). Under PGlite the suites skip
wholesale via the gating const; in this environment they ran (no skip logged because no
skip occurred — `DB_PROVIDER=postgres`).

## Verification Results

| Check | Result |
|---|---|
| `sub-loop.ts --lifecycle duplicates` (tsgo → oxlint → biome → lint:type-aware → check:duplicates) | **exit 0** — all 5 stages passed (check:duplicates skipped per `.jscpd.json` `**/*.test.ts` scope exclusion, as designed) |
| `run-test.ts backend/db/test/logic/billing/financial-immutability.test.ts` | **10 pass / 0 fail, 52 expect() calls** |
| Iterations | 3 (oxlint: `no-await-in-loop` + `no-unsafe-type-assertion` → `Promise.all` + `Set` membership; sonarjs `prefer-specific-assertions` → `toHaveLength`; idempotent re-probe message comparison — see Defect Findings) |

## Carry-Forward Knowledge

1. **Drizzle's "Failed query" wrapper embeds bind parameters** (including the
   wall-clock `updated_at` it adds for `$onUpdate` columns). Two otherwise-identical
   failed UPDATE attempts therefore produce DIFFERENT full error chains — the wrapper
   string differs in the timestamp parameter. Idempotence assertions on trigger
   messages must compare the **deepest cause message** (the DB-raised text), not the
   joined chain. Encoded in `deepestCauseMessage()` in the test file.
2. **A savepoint bracket is required around EVERY failed statement**, even when the
   next statement is only another failed probe: without `rollback to savepoint`, the
   second failure's error chain surfaces `current transaction is aborted, commands
   ignored until end of transaction block` (25P02) instead of the trigger text.
3. **Sandbox environment (pre-existing, NOT a plan defect):** the host has no `bunx`
   binary (`~/.bun/bin/` ships only `bun`), so any tooling that spawns `bunx`
   (sub-loop's oxlint/biome/jscpd stages) fails with `Executable not found in $PATH`.
   Local workaround: `ln -sf ~/.bun/bin/bun ~/.local/bin/bunx` (a `bunx` symlink; bun
   executes its own `x` subcommand when invoked as `bunx`). Additionally, sub-loop /
   tsgo / lint-service invocations must pin `DATABASE_URL` + `DB_PROVIDER` as OS-env
   inline (the `@/scripts/lib` barrel imports `resolve-notification-recipients.ts`
   which imports `@/backend/db` at module scope, and with no project `.env` present
   the db client throws before `.env.test` loading). This is the same bootstrap-order
   issue recorded in `0-baseline-outcome.md`, extended to the sub-loop path.
4. **`student_payments` UPDATE guard** is the AMENDED function from
   `4-student-payments-status-transition.sql` (one permitted exception: pending →
   paid|failed with all financial columns frozen). The tamper probe on a PAID row
   asserts the amended message (`...permitted only to transition a pending payment...`),
   which confirms the amended guard is live on `kottaby_test`.
5. `pg_trigger` probe rows report `tgenabled = 'O'` (origin) on this cluster — the
   enabled-check (`≠ 'D'`) passes.

## Cross-File Dependencies

None blocking. The test file depends only on pre-existing infrastructure:
`test-utils.ts` (`runInRollback`, `expectRepoError`), `entity-setup.ts` helpers
(`createTestUser`, `createTestStudent`, `createTestTeacherRow`, `createTestWallet`,
`createTestTeacherTransaction`, `createTestStudentPayment`), the billing/audit schema
tables, enum members (`PaymentStatus`, `TransactionType` — value imports), and
`isPgliteProvider` from `@/test/helpers/skip-when-pglite`.

## Defect Findings

- **No production defect found.** All observed trigger behavior matches the
  canonical migration DDL exactly (`3-immutability-triggers.sql` +
  `4-student-payments-status-transition.sql`).
- One test-authoring nuance (documented in Carry-Forward #1/#2): the task spec's
  suggested "errorMessageChain contains the message" comparison for the idempotent
  re-probe cannot use the joined chain verbatim because of Drizzle's parameter-bearing
  wrapper; the fix (compare deepest cause messages, keep savepoint brackets) asserts
  the same contract — identical DB-raised text on repeat — without weakening it.

## Requirements Covered

REQ-3 (immutability trigger tier), REQ-4(#3 constraint adjacency), REQ-6 (verification
matrix rows), REQ-0 (process compliance). Subtasks 3.QL / 3.TE / 3.SEC / 3.SR / 3.IV
all satisfied (checkboxes flipped in tasks.md).
