# Mid-Point Review Gate — Round 1 (midpoint-review-R1)

**Plan:** `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/`
**Gate:** Mid-Point Review (SKILL.md steps 4–6) · **Task:** 6.5-fixes · **Agent:** Midpoint Fix Subagent
**Scope reviewed:** all `backend/` files landed by tasks 2.1–6.2 (schema deltas + trigger amendment + seeds, types/enums, billing repos + extensions, gateway port + signature helper, purchase service) — reviewed by `review-backend`, `review-types`, `review-config` against the feat worktree (`/home/z/feat-wt`).

## Round 1 findings (aggregated + disposition)

| # | Severity | Finding (source) | Disposition |
|---|---|---|---|
| R1-1 | CRITICAL | "Missing" `backend/db/migration/4-student-payments-status-transition.sql` + `-sqlite.sql` (review-config) | **PHANTOM** — unstable-tree artifact. Verified present in the feat worktree (both files, 2625/3624 bytes). |
| R1-2 | CRITICAL | "Missing" `backend/drizzle/20260907182455_ancient_scarecrow/` + `20260907182426_custom_4-student-payments-status-transition/` (review-config) | **PHANTOM** — both folders exist with `migration.sql` (+ `snapshot.json` for the schema folder). |
| R1-3 | HIGH | "Missing" `creditLaneBalance` + `CREDIT_LANE_BALANCE_COLUMNS` in `backend/db/repo/students/student.repository.ts` (review-backend) | **PHANTOM** — both present (map def line 81, method line 465, 4 references total). |
| R1-4 | HIGH | "Missing" `balanceLane` in `backend/db/seeds/billing/seed-plans.ts` (review-backend) | **PHANTOM** — present on all 4 plan specs + create path + reconcile path (9 references). |
| R1-5 | HIGH | "Missing" test suites `subscription.repository.test.ts` / `student-payment.repository.test.ts` / `subscription-purchase-idempotency.repository.test.ts` (review-backend) | **PHANTOM** — all three exist under `backend/db/test/logic/billing/` and pass with exactly the pinned counts (see Verification). |
| R1-6 | HIGH | "Missing" outcome files 2.1–6.2 (reviewers) | **PHANTOM** — all 13 outcome files (2.1–6.2) plus 0.1 and plan-review-R1 exist in the plan outcome dir. |
| R1-7 | LOW | Defensive plain `throw new Error(...)` in the three billing repos violates the REQ-050 DomainError discipline ("Plain `new Error(...)` PROHIBITED") if ever surfaced (review-backend) | **REAL — FIXED** (see FIX-1). |
| R1-8 | LOW | Stale header on `backend/db/schema/billing/student-payments.ts`: still describes the table as fully IMMUTABLE ("UPDATE and DELETE are blocked by a trigger; corrections via compensating payment row") — the amended truth allows the guarded `pending → paid\|failed` status transition with frozen financial/identity columns (review-backend) | **REAL — FIXED** (see FIX-2). |
| R1-9 | LOW | Stale inventory counts in `backend/db/schema/index.ts` header ("22 tables … 15 pgEnums") (review-types) | **REAL — FIXED** (see FIX-2). Recount from the schema tree: **25 tables / 17 pgEnums / 8 domain sub-directories**. |
| R1-10 | MEDIUM | Service-level junction insert into `student_subscriptions` in `purchase` — no `StudentSubscriptionRepository` exists (review-backend) | **ACCEPTED with reason** — the plan defines no junction repository; the service-mediated insert is the documented design and is recorded in the 6.1 outcome (purchase tx order). NOT refactored (explicit dispatch instruction). |
| R1-11 | LOW | Unused exports pending consumers (types/enums/helpers from 3.1/3.2/5.x awaiting 7.1/8.1/9.x) | **ACCEPTED with reason** — consumers land in the remaining tasks (7.1 activation, 8.1 webhook route, 9.x GraphQL); expected mid-plan state, not a defect. |

Phantom root cause: the reviewers ran against the unstable sandbox tree that force-flips `/home/z/my-project` to `main` at tool-call boundaries (documented in worklog Task 6.5-env); every "missing artifact" was present on the feat branch in the stable worktree `/home/z/feat-wt` and was re-verified by this subagent with direct greps/`ls`.

## Fixes applied

### FIX-1 — DomainError discipline in billing repos (R1-7)

`backend/lib/errors.ts` exports no internal-invariant error class, so per the fix directive the closest sanctioned match was used: **`ConflictError`** (a `DomainError` subclass, default code `CONFLICT`) with the invariant message kept verbatim. No new error classes invented. The invariant JSDoc was kept/extended — comments describe domain behavior only (no plan artifacts).

| File | Change |
|---|---|
| `backend/db/repo/billing/subscription.repository.ts` | `insertSubscription` no-row invariant: `throw new Error(...)` → `throw new ConflictError(...)`; added `@throws ConflictError` JSDoc line (append invariant unreachable → broken driver contract); `ConflictError` value import added. |
| `backend/db/repo/billing/student-payment.repository.ts` | Same conversion in `insertPayment` + `@throws` JSDoc + import. |
| `backend/db/repo/billing/subscription-purchase-idempotency.repository.ts` | Same conversion in `insertClaim` (new `@throws` line) and `updateClaimSubscriptionId` (existing `@throws` note updated to name `ConflictError`); import added. Messages unchanged, so the 4.3 suite's message assertions (`"update matched no rows"`) and `toBeInstanceOf(Error)` assertions remain valid (`GraphQLError extends Error`). |

Deliberately NOT touched: identical plain-`Error` throws in pre-existing repos (session, notification, wallet, plan, user, teacher, parent, admin, students) — pre-existing Phase-0 baseline, out of mid-point scope (SKILL: filter pre-existing issues; scope boundary rule).

### FIX-2 — Stale schema header comments (R1-8, R1-9)

| File | Change |
|---|---|
| `backend/db/schema/billing/student-payments.ts` | Header rewritten to the amended truth: DELETE remains blocked (compensating-row corrections preserved); UPDATE is permitted ONLY for the guarded `pending → paid \| failed` status decision with every financial/identity column (`student_id`, `subscription_id`, `amount`, `currency`, `payment_gateway`, `created_at`) frozen — enforced by the amended `prevent_student_payments_update()` guard (shipped via `4-student-payments-status-transition.sql`); every other UPDATE still raises; decided payments are terminal. Domain language only. |
| `backend/db/schema/index.ts` | Inventory counts corrected from "22 tables … 15 pgEnums" to **"25 tables across 8 domain sub-directories + 17 pgEnums"** — recounted from the actual schema tree (25 `pgTable` declarations; 17 `pgEnum` declarations in `enums.ts`, including the two additions from the purchase-plan schema work). |

## Verification results

### Per-file quality loop — `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`

All five edited files: **EXIT 0, all five checks green** (tsgo, oxlint, biome:check, lint:type-aware, check:duplicates):

| File | Result |
|---|---|
| `backend/db/repo/billing/subscription.repository.ts` | ✅ EXIT 0 |
| `backend/db/repo/billing/student-payment.repository.ts` | ✅ EXIT 0 |
| `backend/db/repo/billing/subscription-purchase-idempotency.repository.ts` | ✅ EXIT 0 |
| `backend/db/schema/billing/student-payments.ts` | ✅ EXIT 0 |
| `backend/db/schema/index.ts` | ✅ EXIT 0 |

(First pass hit intermittent `ErrnoError errno 20` crashes inside the lint:type-aware service — diagnosed as the environment anomaly below, not a code issue; all files subsequently passed clean in a single uninterrupted pass.)

### Whole-repo typecheck

- `bun run tsgo` → **EXIT 0, 0 errors** (run after all edits).

### Repo test suites (serialized; PGlite lock respected)

| Suite | Result | Pinned count |
|---|---|---|
| `backend/db/test/logic/billing/subscription.repository.test.ts` | **6 pass / 0 fail / 44 expect()** | 6/44 (4.1) ✓ |
| `backend/db/test/logic/billing/student-payment.repository.test.ts` | **7 pass / 0 fail / 52 expect()** | 7/52 (4.2) ✓ |
| `backend/db/test/logic/billing/subscription-purchase-idempotency.repository.test.ts` | **6 pass / 0 fail / 37 expect()** | 6/37 (4.3) ✓ |

The trigger matrix (pending→paid/failed allowed; tamper/re-decide/DELETE blocked), the raw-23505 escape, and the defensive-invariant assertions all remain green after the error-class conversion.

### Scope check

`git status --short` shows exactly the five files above (plus the gitignored `.env`/`.env.test` env-wiring change below); no commits made (orchestrator commits).

## Environment fix discovered during verification (carry-forward for ALL DB-running tasks)

**PGlite cannot open a dataDir through a symlink in this environment** — every DB process in the worktree failed with `ErrnoError errno 20` (ENOTDIR): sub-loop's lint service crashed intermittently, `bun run tsgo` logged the warning, and all repo tests failed at `BEGIN` (`DrizzleQueryError: Failed query: begin, cause: ErrnoError errno 20`). Proven by direct probe: `dataDir="./db/pglite"` (symlink) → init fails; `dataDir="/home/z/my-project/db/pglite"` (realpath) → SELECT/BEGIN/ROLLBACK all succeed.

**Fix applied (worktree-local, gitignored):** added `PGLITE_DATA_DIR=/home/z/my-project/db/pglite` to `/home/z/feat-wt/.env` and `.env.test` (the pool reads `process.env.PGLITE_DATA_DIR ?? "./db/pglite"` — `backend/db/pglite-pool.ts:110`). The symlink itself was left in place. After the fix: sub-loop stable (no flakes), tsgo clean, all three suites green. **Any future task running DB commands/tests in the worktree inherits this via the env files — do not remove; keep DB runs serialized as before.**

## Verdict

- All CRITICAL/HIGH reviewer findings: phantoms of the unstable tree, re-verified as present (R1-1…R1-6).
- All real findings (2× LOW header comments, 1× LOW DomainError discipline): **fixed and verified** (R1-7…R1-9).
- Remaining findings are accepted-with-reason (R1-10 junction insert — plan-defined design; R1-11 unused exports — consumers land in 7.1/8.1/9.x).
- Zero feature-specific findings remain open.

**Gate: PASSED** — backend phases may proceed to the frontend/GraphQL phases.
