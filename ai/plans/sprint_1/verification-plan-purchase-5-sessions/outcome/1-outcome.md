# Task 1 — Nullable payment owner + type ripple audit — Outcome

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`
**Environment**: sandbox, `DB_PROVIDER=pglite` (in-process PG via WASM, data dir `./db/pglite`)

## Summary

`student_payments.student_id` is now a nullable owner column: a payment row's owner is either a
`students.id` (student purchases) or `NULL` (purchases whose owner is the subscription's generic
`user_id` — the verification-plan purchase path lands in Task 5). The FK→`students.id`
`ON DELETE RESTRICT` posture, both indexes, the `amount` CHECK, and the immutability trigger
(`pending → paid|failed` only, NULL-safe column freeze via `IS NOT DISTINCT FROM`) are untouched.
`StudentPaymentRepository.insertPayment` now accepts `studentId: number | null`, and the whole repo
was audited for NULL-context consumers of `StudentPaymentSelectType.studentId`.

## db push — what was run and what happened (honest record)

1. **`bun run db push` (the binding convention) — FAILED, environment-caused.**
   `scripts/dbActions/actions.ts` action 6 runs `ensureExtensions()` (a real `pg.Pool`) +
   `drizzle-kit push` against `drizzle.config.ts`, whose credentials come from `DATABASE_URL`.
   With `DB_PROVIDER=pglite` there is no TCP postgres: `ensureExtensions` died with
   `connect ECONNREFUSED 127.0.0.1:5432`. `dbActions` cannot reach a pglite data dir at all.
2. **Fallback: drizzle-kit push with a `driver: "pglite"` config (temporary, deleted after use).**
   drizzle-kit 1.0.0-rc.4 supports `driver: "pglite"` for the postgres dialect; a throwaway config
   (`drizzle.config.pglite.tmp.ts`, url `file:./db/pglite`, same schema barrel) was used to run
   `bunx drizzle-kit push --force` → exit 0, `[✓] Changes applied`. **No new migration files were
   generated** (push writes no folders; custom SQL migrations were not used).
3. **Exact SQL captured and verified.** A probe on a throwaway COPY of the data dir
   (column forced back to `SET NOT NULL`, then `drizzle-kit push --force --verbose` dry-target)
   printed exactly the generated diff statement; the real data dir was verified afterwards:

   ```sql
   ALTER TABLE "student_payments" ALTER COLUMN "student_id" DROP NOT NULL;
   ```

   Matches intent exactly (nullable `integer` FK, restrict delete preserved).
   Live verification: `information_schema.columns` → `student_id` → `is_nullable = YES`,
   `data_type = integer`. Temp config/probe files were deleted; the repo diff contains none of them.

## Files modified

| File | Change |
|---|---|
| `backend/db/schema/billing/student-payments.ts` | Dropped `.notNull()` on `studentId` (line 38) + one trailing domain comment (nullable owner: student id, or NULL for verification purchases). Nothing else. |
| `backend/db/repo/billing/student-payment.repository.ts` | `insertPayment` JSDoc now documents the widened contract: the type comes from `StudentPaymentInsertType` (`$inferInsert`), which auto-widened to `studentId?: number \| null` the moment the column became nullable — no signature change was needed or made. Docblock-only change. |
| `backend/db/test/logic/billing/student-payment.repository.test.ts` | 3 new tests (see Verification); file header tiers updated to describe NULL-owner coverage. |
| `ai/plans/.../tasks.md` | Task 1 checkbox lifecycle. |
| `ai/plans/.../deferred-items.md` | New row D6 (sandbox bootstrap gap, see below). |

## Files NOT modified (and why)

- **All NULL-context consumers — zero compile errors to fix.** `bun tsgo` stayed at **0 errors**
  after the schema change (baseline 0). Audit findings:
  - `backend/graphql/pothos/billing/student-payment.pothos.ts` does NOT expose `studentId` at all
    (id, subscriptionId, amount, currency, paymentGateway, status, createdAt, updatedAt) → the
    GraphQL SDL / codegen `StudentPayment` type is unaffected; no regeneration needed in this task.
  - `backend/services/billing/subscription-purchase.service.ts:450` writes `studentId: studentUserId`
    (a number — assignable to the widened type). The student flow is byte-for-byte unchanged.
  - `backend/services/billing/subscription-activation.service.ts` reads `subscription.userId`,
    never `payment.studentId`.
  - Admin analytics (`backend/db/repo/admin/platform-analytics-query-helpers.ts`) selects only
    `currency/amount/created_at/status` — no `student_id` projection, no join that could hide
    NULL-owner rows.
  - `backend/db/test/entity-setup.ts` `createTestStudentPayment(tx, studentId: number, …)` — a
    number argument remains valid; only insert paths in the repo are
    `insertPayment` + this factory (verified by grep for `.insert(studentPayments)`).
- `backend/types/billing/student-payment.types.ts` — types are `$infer`-derived; widened automatically.
- `scripts/pglite-bootstrap.ts` — its missing-4-file gap is recorded as deferred D6, fixing the
  hand-rolled sandbox bootstrap script is outside this plan's file scope.
- Root AGENTS/instruction files — hand-curated, never edited (per plan protocol).

## Verification results

| Check | Result |
|---|---|
| 1.QL sub-loop `backend/db/schema/billing/student-payments.ts` | **exit 0** (tsgo/oxlint/biome/lint:type-aware/duplicates all pass; printed rule files read) |
| 1.QL sub-loop `backend/db/repo/billing/student-payment.repository.ts` | **exit 0** |
| 1.QL sub-loop `backend/db/test/logic/billing/student-payment.repository.test.ts` | **exit 0** (duplicates out of jscpd scope — skipped by the tool itself) |
| `bun tsgo` (project-wide) | **0 errors** (baseline 0; sanity-checked that tsgo really compiles the touched files by planting + reverting a deliberate type error) |
| `bun biome:check` | 0 warnings (baseline 0) |
| 1.TE repo test run | `bun run test/scripts/run-test.ts backend/db/test/logic/billing/student-payment.repository.test.ts` → **10 pass / 0 fail** (77 expect calls): 7 pre-existing + 3 new. All assertions run inside `runInRollback` with `tx` propagation; denials via `expectRepoError` + savepoint brackets. No pglite skip was needed — every assertion runs honestly on pglite. |

New test coverage:
1. `insertPayment accepts a NULL owner — a purchaser with no students row` (Tier 1): insert with
   `studentId: null` succeeds, row echoes financial columns, `findBySubscriptionId` round-trips NULL.
2. `pending→paid on a NULL-owner row` (Tier 3): the allowed decision works on a NULL-owner row and
   keeps the owner NULL; replay → zero rows.
3. `NULL-owner rows live under the same trigger` (Tier 4): owner assignment smuggled into the
   permitted transition (NULL→value) is BLOCKED by the NULL-safe freeze; plain owner edit BLOCKED;
   DELETE BLOCKED; row survives with pending status and NULL owner. (Regression for non-null
   inserts is the pre-existing Tier 1 test, unchanged and green.)

## 1.SEC — NULL owner never widens read scope

- No predicate changed anywhere: the only SQL executed against the DB is the single
  `ALTER … DROP NOT NULL` recorded above.
- Admin revenue analytics filter on `status = 'paid'` only — future NULL-owner paid rows are
  INCLUDED in those aggregates (not hidden), exactly as before (no join on `student_id` exists).
- `findBySubscriptionId` is subscription-scoped; `markPaidOnce`/`markFailedOnce` are
  status-guarded single UPDATEs — semantics untouched. No tenant/role filter exists in the touched
  methods; nothing to re-verify beyond that.

## 1.SR — semantic checklist

- No cross-layer imports (no import changes at all; shared/ untouched).
- No read-then-write; no module-level mutable state; no env keys added.
- No enum/string-literal changes; no dead branches; no noisy comments; comments describe domain
  behavior only (no plan-artifact references in code/JSDoc).
- `git diff --name-only` = exactly: tasks.md, deferred-items.md is separate-but-intended,
  schema file, repo file, test file — plus the outcome file (new). No stray files.

## 1.IV — rule files read and honored

Read in full: root `AGENTS.md`, `backend/AGENTS.md`, `backend/db/schema/AGENTS.md`,
`backend/db/repo/AGENTS.md`, `backend/db/test/AGENTS.md`,
`.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`.
Compliance highlights: schema edits via Drizzle only; repo stays data-access-only (docblock-only
change); tests use `runInRollback` + `tx` everywhere, `expectRepoError` (never `rejects.toThrow`),
entity-setup factories (never seed data), savepoint brackets opened AFTER the probe row exists.

## Carry-forward knowledge for Tasks 5–7 (and beyond)

1. **Task 5** can insert the verification payment pair with
   `StudentPaymentRepository.insertPayment({ studentId: null, subscriptionId, amount: plan.price,
   currency: plan.currency, paymentGateway: provider }, tx)` — contract already accepts NULL; the
   immutable trigger permits the later `markPaidOnce` on NULL-owner rows (proven by test).
   The paired `studentSubscriptions` junction insert must NOT be attempted for applicants
   (no `students` row exists — FK restrict would raise).
2. **Task 6** probes applicant-owned payments via `subscription.userId` — `payment.studentId` is
   `number | null` now; any new code MUST treat the payment owner as possibly NULL (the
   students-row-first → applicants-row probe order in plan §4.4 is the discriminator).
3. **GraphQL surface** (`StudentPaymentPothosObject`) deliberately does NOT expose `studentId` —
   no SDL/codegen change is required by this nullability. If a future task exposes it, it must be
   `nullable: true` (Pothos default is non-null).
4. **Admin revenue analytics** (`getRevenueStats`/`getRevenueDailyTrend`) include NULL-owner rows
   automatically (status-only filter) — verification revenue will surface there; no query change
   wanted.
5. **db push under pglite**: `bun run db push` cannot reach the sandbox DB (TCP-only credentials in
   `drizzle.config.ts` + `ensureExtensions`). Working pattern for THIS sandbox: a temporary
   drizzle-kit config with `driver: "pglite"`, `url: "file:./db/pglite"` and the same schema barrel,
   run with `--force --verbose` (prints the applied SQL); delete the config afterwards. Canonical
   schema-reconciliation path that works over pglite: `bun run backend/db/scripts/migrate.ts`
   (auto-bundles custom SQL + applies the drizzle journal via the pglite shim).
6. **Sandbox env fix applied this session**: the fresh pglite data dir had the STRICT
   `student_payments` guard (bootstrap gap D6 — `4-student-payments-status-transition.sql` never
   applied), which broke every `pending→paid|failed` test. Repaired by running
   `bun run backend/db/scripts/migrate.ts` (applied both `*_custom_4-student-payments-status-transition`
   folders). Recorded as deferred D6; the bootstrap script itself remains unfixed (out of scope).

## Cross-file dependencies discovered

- `StudentPaymentInsertType` / `StudentPaymentSelectType` are pure `$infer` derivations
  (`backend/types/billing/student-payment.types.ts`) — schema nullability propagates automatically;
  consumers compile against the widened types with zero edits.
- The immutability trigger's NULL-safe freeze (`4-student-payments-status-transition.sql`,
  `IS NOT DISTINCT FROM`) is what makes NULL-owner rows safe — it lives in custom SQL, NOT in the
  Drizzle schema, so its correctness depends on the migration journal being fully applied (D6).
- `subscription-purchase.service.ts` and `subscription-activation.service.ts` are the two production
  writers/readers of payment rows; both are nullability-clean without changes (student path writes a
  number; activation keys off `subscription.userId`).
