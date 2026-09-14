# Task 1 — Nullable payment owner + type ripple audit

- **Date:** 2026-09-14
- **Branch:** `feat/verification-plan-purchase-5-sessions`
- **Requirements:** REQ-3.2, REQ-3.4, REQ-9 · **Design:** plan.md §3.1, D3

## Summary of what was implemented

1. **Schema delta (plan §3.1, binding):** dropped `.notNull()` from `student_payments.student_id` in `backend/db/schema/billing/student-payments.ts`. The column keeps its `restrict` FK to `students.id` and its index; a production-grade comment explains the nullable owner (student id, or NULL for payments whose owner is the subscription's generic `subscriptions.user_id`). The table docblock's opening sentence was updated to match ("records every payment made against a subscription: a student's payment (`student_id` set) or a purchase by a user without a `students` row"). No plan artifacts referenced in code.
2. **`bun run db push`** applied the delta (SQL diff below, captured verbatim via a controlled `drizzle-kit push --force --verbose` re-run after temporarily restoring `SET NOT NULL`; the re-run applied exactly the single ALTER, proving the push diff contains nothing else). Post-push verification: `information_schema.columns.is_nullable = 'YES'`, 0 NULL-owner rows.
3. **Repository insert contract:** VERIFIED auto-widened — `StudentPaymentInsertType` is `typeof studentPayments.$inferInsert` (`backend/types/billing/student-payment.types.ts:6`), so `studentId` became `number | null | undefined` automatically. `StudentPaymentRepository.insertPayment` needed NO signature change (no hand-written contract exists).
4. **Type-ripple audit (tsgo-driven):** exactly 2 errors surfaced, both fixed:
   - `student-payment.repository.ts` — the admin-audit row mapper `toAdminPaymentRow` declared `studentId: number` while the tx-branch Drizzle projection now yields `number | null`. Fixed by widening the mapper input to `number | null` and adding a loud `ConflictError` guard on null (mirrors the file's existing unreachable-value posture used by the pgEnum narrowers): the admin listing resolves rows through an INNER join on `students`, so an owner-less row can never survive the join — reaching one means a broken join contract, not an empty render.
   - `admin-finance.pothos.ts` — `t.exposeID("studentId")` hard-errored because `AdminStudentPaymentRow.studentId` auto-widened to `number | null` via `Omit<StudentPaymentSelectType, …>`. Fixed at the canonical type (`backend/types/billing/admin-finance.types.ts`): `AdminStudentPaymentRow` now omits `studentId` from the base and re-declares `studentId: number`, documented as the view's inner-join invariant (owner-less rows are structurally excluded from the admin audit listing; the repo mapper enforces it). This keeps the GraphQL wire contract (`AdminStudentPayment.studentId: ID!`) and all codegen/frontend types unchanged — zero frontend ripple. The pothos file itself was NOT edited.
5. **Tests (1.TE):** 3 new cases in `backend/db/test/logic/billing/student-payment.repository.test.ts` under a dedicated `NULL student owner (verification-style rows)` block, with a `createNullOwnerPaymentPair` helper (user WITHOUT a `students` row + plan + pending subscription + `insertPayment({ studentId: null, … })` — the insert itself compiles only against the widened `StudentPaymentInsertType`):
   - insert with `studentId = NULL` succeeds; owner-less row round-trips null through `findBySubscriptionId`.
   - `pending→paid` decision permitted on a NULL-owner row; owner stays frozen (NULL); replay/opposite-decision zero-rows — proves REQ-3.4's "trigger behavior unchanged when student_id accepts NULL".
   - DELETE of a NULL-owner row still blocked by the append-only guard (savepoint-bracketed `expectRepoError`).
   - Existing non-null insert path and the full trigger matrix are untouched and stay green.

## Environment repair discovered by 1.TE (recorded as deferred-item D6 — ✅ resolved)

The first test run failed 4 trigger-pinning tests (pre-existing ones included). Root cause, proven before any fix: `kottaby_db` had been provisioned via `db push` only — the `drizzle.__drizzle_migrations` journal did not exist and NO immutability triggers/guard functions existed on ANY table (`student_payments`, `teacher_transaction`, `audit_logs` all empty of `prevent_%` triggers; my push touches only `student_payments`, so it cannot have dropped the others). Repair via the sanctioned mechanism: `bun run db migrate` applied all 9 drizzle folders (all idempotent per `ensureIdempotentMigrations`; no `SET NOT NULL` on `student_id` exists in any folder, so the push's nullability survived — re-verified `is_nullable = 'YES'` afterwards). Result: 6 immutability triggers installed and enabled (`tgenabled 'O'`), journal created, all suites green. **Carry-forward: any fresh environment must run `bun run db migrate` before DB-backed tasks (2, 4–6, 10).**

## Files created/modified

| File | Change |
|---|---|
| `backend/db/schema/billing/student-payments.ts` | `studentId` → nullable + owner comment + docblock first-sentence update |
| `backend/db/repo/billing/student-payment.repository.ts` | `toAdminPaymentRow` input widened to `studentId: number \| null` + explicit null guard (ConflictError) + narrowed re-assert in the return |
| `backend/types/billing/admin-finance.types.ts` | `AdminStudentPaymentRow` re-bases on `Omit<…, "studentId">` with `studentId: number` + inner-join invariant docblock |
| `backend/db/test/logic/billing/student-payment.repository.test.ts` | NULL-owner helper + 3 new trigger-matrix cases; header docblock updated |

**Files NOT modified (deliberately):** `backend/graphql/pothos/billing/admin-finance.pothos.ts` (compiles cleanly once the canonical type keeps `studentId: number`; wire contract unchanged), `backend/graphql/pothos/billing/student-payment.pothos.ts` (`StudentPayment` object does not expose `studentId` — no ripple), `backend/services/billing/subscription-purchase.service.ts` / `subscription-activation.service.ts` (insert sites pass non-null `studentId`, still assignable), `backend/db/repo/admin/platform-analytics-query-helpers.ts` (aggregates never touch `studentId`), `frontend/**` (codegen schema unchanged — zero generated-type drift), `backend/db/test/entity-setup.ts` (`createTestStudentPayment` keeps its explicit `studentId: number` parameter — existing callers unchanged; a NULL-owner factory belongs to the Task 5 verification service tests).

## db push SQL diff (verbatim)

```sql
ALTER TABLE "student_payments" ALTER COLUMN "student_id" DROP NOT NULL;
```

That single statement is the complete diff (the controlled `--verbose` re-run printed and applied exactly this; `bun run db push` itself is non-verbose under `--force`).

## Verification results

### Sub-loop (per edited file, `--lifecycle duplicates`) — all exit 0

| File | Result |
|---|---|
| `backend/db/schema/billing/student-payments.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `backend/db/repo/billing/student-payment.repository.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `backend/types/billing/admin-finance.types.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `backend/db/test/logic/billing/student-payment.repository.test.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |

### tsgo final count

`bun tsgo` → **0 errors** (baseline was 0; the 2 ripple errors found mid-task were fixed and the count returned to 0).

### Test runs (exact commands + counts)

| Command | Result |
|---|---|
| `bun run test/scripts/run-test.ts backend/db/test/logic/billing/student-payment.repository.test.ts` | **10 pass / 0 fail** (75 expects) — 7 pre-existing incl. full trigger matrix + 3 new NULL-owner cases |
| `bun run test/scripts/run-test.ts backend/db/test/repo/billing/student-payment.repository.admin.test.ts` | **14 pass / 0 fail** (42 expects) — no regression on the admin-audit surface |
| `bun run test/scripts/run-test.ts backend/db/test/logic/billing/financial-immutability.test.ts` | **12 pass / 0 fail** (64 expects) — post-repair confirmation of trigger presence + tamper guards |

## 1.SEC — Security review conclusion

**No read scope widened; no predicate changed.** `listForAdminAudit`/`countForAdminAudit` keep their INNER joins on `students`/`users`, so rows whose `student_id` IS NULL (verification purchases) are excluded from the admin audit listing exactly as any unmatchable row was before — and since the column was previously NOT NULL, the visible row set for existing data is bit-identical. The filter chains (`buildAdminPaymentFilterChain` / raw variant) are untouched: `studentId` filtering still applies `eq(student_payments.student_id, $1)` only when the filter is set, and NULL-owner rows can never match that (or any) student-scoped filter. No other read predicate exists on this table (`findBySubscriptionId` is subscription-keyed and unchanged; analytics aggregates are status/date-keyed and unchanged). The only new capability is the WRITE-side NULL owner (insert), which no read path exposes beyond what the joins already project. GraphQL wire contract unchanged (schema.graphql not regenerated; `AdminStudentPayment.studentId` remains non-null `ID!`).

## 1.SR — Semantic review checklist

- **db push SQL matches intent exactly:** yes — the single ALTER above, nothing else (see verbatim diff).
- **No cross-layer imports introduced:** none — the types file's imports are unchanged (backend enum + backend types only); no new imports anywhere.
- **Enums still value-imported where used at runtime:** unchanged — `PaymentGateway`/`PaymentStatus` remain value imports in the repo and test; no new enum usage added.
- **No module-level mutable state added:** none — the mapper guard is a pure function; no new module state anywhere.
- **No `console.*`:** none; no logging added at all.
- **No plan-artifact references in code:** verified — comments describe the schema/domain contract only.
- **No unrelated refactors:** confirmed — the diff touches only the nullability ripple surface.

## 1.IV — Instruction verification

Rule files printed by sub-loop.ts and read before/while validating: root `AGENTS.md`, `backend/AGENTS.md`, `backend/db/schema/AGENTS.md`, `backend/db/repo/AGENTS.md`, `backend/types/AGENTS.md`, `backend/db/test/AGENTS.md`, `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`. Validation per file:

- **Schema file:** Drizzle-only definition preserved; enum registry untouched; `db push` used per policy (not custom SQL); no structural additions → complies with `backend/db/schema/AGENTS.md`.
- **Repo file:** data-access only (the mapper guard is a data-contract assertion of the same kind as the two pre-existing pgEnum narrowers); no business logic/permission checks added; types from `@/backend/types`; no new user-facing strings (the guard message is a developer-facing unreachable-contract message matching the file's existing pattern); `tx` propagation untouched → complies with `backend/db/repo/AGENTS.md` + `backend.instructions.md`.
- **Types file:** single canonical type per entity maintained; `Omit`-rebase pattern per `backend/types/AGENTS.md`; the `studentId` override is a documented surface invariant, not a duplicate definition.
- **Test file:** `runInRollback` everywhere; `tx` passed to every repo call; `expectRepoError` + SAVEPOINT brackets (no `rejects.toThrow`); entity-setup helpers only (no seed queries); no `any`; suite-local helper shape per `backend/db/test/AGENTS.md` + `tests.instructions.md`.

## Carry-forward knowledge for future tasks

- `StudentPaymentSelectType.studentId` is now `number | null`; `StudentPaymentInsertType.studentId` is `number | null | undefined` (optional) — **Task 5's verification service passes `studentId: null`** to `StudentPaymentRepository.insertPayment` and must NOT attempt the `studentSubscriptions` junction insert (no `students` row exists).
- `StudentPaymentReturnType.studentId` is likewise `number | null`, but the canonical `StudentPayment` GraphQL object does NOT expose `studentId` — Task 7's payload exposure needs no nullability work.
- `AdminStudentPaymentRow.studentId` stays `number` BY CONTRACT (inner-join invariant, enforced by a loud `ConflictError` in `toAdminPaymentRow`). If a future task ever wants the admin audit view to list verification payments, that task must widen the join to LEFT JOIN, make `studentId`/`studentName` nullable end-to-end (type → pothos `nullable: true` → codegen → frontend), and re-run `bun run generate:gqlSchema && bun codegen` — a deliberate surface change, explicitly out of Task 1's "no behavior changes" scope.
- **Environment provisioning (D6):** `kottaby_db` now carries the full drizzle journal + immutability triggers. Fresh environments must run `bun run db migrate` before any DB-backed task; trigger-pinning suites fail otherwise.
- The gateway pre-tx seam (`PaymentCheckoutInput.studentId` as generic purchaser slot) and all `subscriptions.userId` touchpoints are untouched — Task 5/6 ride them verbatim.

## Cross-file dependencies discovered

- **Environment (resolved in-task):** missing migrations journal/triggers in `kottaby_db` — repaired via `bun run db migrate`; documented as D6 for the remaining DB-backed tasks.
- **None outstanding:** no file outside this task's scope requires changes; the ripple fixed here was fully contained (schema → repo mapper → canonical admin row type).
