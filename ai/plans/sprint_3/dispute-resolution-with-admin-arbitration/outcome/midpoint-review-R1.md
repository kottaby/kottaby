# Task 2.7 — Mid-Point Review Gate (backend-only, Round 1)

**Task ID:** 2.7 · **Plan:** `ai/plans/sprint_3/dispute-resolution-with-admin-arbitration/`
**Date:** 2026-09-12 · **Agent:** general-purpose subagent (review coordinator)
**Scope:** the Phase 2 diff `427c162..HEAD` (Tasks 2.1–2.6) · **Process:** SKILL.md §Mid-Point Review Gate
**Verdict:** **PASS — zero backend-specific findings remain** (2 findings found, 2 fixed, re-reviewed clean)

---

## Review Execution

Four structured passes over `git diff --name-only 427c162..HEAD` (30 code/test/locale files +
outcome/bookkeeping files; `backend/graphql/test/schema-surface.test.ts` carries only the
**expected, uncommitted 2.1 codegen-sync pin update** — excluded per the gate brief; Task 3.1's
regen closes it). Specs invariants re-read before review: REQ-1 (guarded student entry),
REQ-2/3/4 (outcome legs + audit contracts), REQ-5 (classification), REQ-6 (case read),
REQ-7 (waves), REQ-8 (audit), REQ-10 (races/atomicity/TOCTOU).

### PASS A — review-backend (architecture / races / dead code / layers)

Files: `session.repository.ts` + `session.repository.arbitration.helpers.ts`,
`wallet.repository.ts`, `session-arbitration.service.ts` + `.helpers.ts`,
`session-dispute-notification.service.ts`.

- **TOCTOU** ✅ — classification probe is read INSIDE the flow's transaction in both flows, and
  every write predicate RE-ASSERTS the classification: `openPostConfirmationDisputeOnce` folds
  `id ∧ student_id=<caller> ∧ status='completed' ∧ confirmed_by_student_at IS NOT NULL ∧
  fee_held=false` into one UPDATE (repo helpers :62-74); `resolveConsumedDisputeOnce` re-asserts
  `id ∧ status='disputed' ∧ fee_held=false` (:105-108) and fires BEFORE any money moves, so a
  concurrent-arbitration loser classifies as the state conflict with zero financial writes. A
  drifted probe cannot pass a write.
- **Atomicity** ✅ — `openPostConfirmationDispute` and `arbitrateDispute` are each ONE
  `withTransaction`: probe → amount policy → guarded completion leg → wallet debit (compensating
  `withdrawal`/`completed` ledger row + guarded balance decrement) → quantized lane credit →
  exactly ONE `Override` audit row → resolved wave → response re-read, all on the same `tx`. A
  wallet shortfall (`debitForArbitrationOnce` → `null`) throws the typed
  `WALLET_INSUFFICIENT_FUNDS` ConflictError on the flow's tx → the compensating ledger row, the
  completion flip, the lane credit, the audit row, and the wave receipts all roll back together
  (savepoint-proven by the wallet suite; insufficient-funds legs proven by service suite +
  journey). Publish happens strictly AFTER commit and only when the flow owns the tx.
- **Dead code (the Task 2.6 KNIP carry-forward — both findings fixed, see Fix Phase)** — knip
  re-run before fixes reported exactly 5 findings; after fixes: **0**.
- **Cross-layer imports** ✅ — services import only `@/backend/*` + `@/shared/locale/server-graphql`;
  repos only `@/backend/db*` + enums + types; no frontend/app/GraphQL-context reach-ins.
- **Module-level mutable state** ✅ — immutable `const` labels/pattern constants only; all
  functions pure; no `let` at module scope, no caches.
- **Error-class reuse** ✅ — `NotFoundError`/`ValidationError`/`ConflictError`/`DomainError` from
  `@/backend/lib/errors` + the shared classifiers (`rejectSessionNotFound`/`rejectStateConflict`);
  the funds conflict reuses the shipped `WALLET_INSUFFICIENT_FUNDS` code + `insufficientBalance`
  copy. The three raw `throw new Error(...)` sites are data-impossibility invariants — the same
  convention as the shipped `session-lifecycle.*` services (grep-verified).
- **Enum value imports** ✅ — `SessionStatus`, `DisputeResolution`, `AuditActionType`,
  `BroadcastAudienceType`, `NotificationType`, `UserRole`, `isDisputeResolution`,
  `isHeldBalanceLane` are value imports where runtime-used; `HeldBalanceLane` is type-only.
- **Mass-assignment** ✅ — every SET clause / `values({...})` / emit input is a closed object
  literal; zero spreads into Drizzle writes anywhere in the diff.

### PASS B — review-types

Files: `backend/types/classes/session-arbitration.types.ts` + `backend/types/classes/index.ts`.

- Canonical naming ✅ (`SessionArbitrationProbeType` / `AdminDisputeCaseReturnType` — ReturnType
  read-shape convention; the probe is a `Pick<SessionSelectType, 8 members>` faithful to the
  real `$inferSelect`, matching the repo projection column-for-column); no duplicates (repo-wide
  grep); all-`import type` deep `@/` paths per `backend/types/AGENTS.md`; barrel keeps the
  relative `export *` purity line. One finding (below): `ArbitrateDisputeInput` had zero
  consumers.

### PASS C — review-tests

Files: the 5 new/updated suites + the 2 stale-pin updates
(`session-repository.admin.test.ts`, `notification-type.enum.test.ts`).

- **Tier 1-4 adequacy** ✅ — repo suites drive 100% branch coverage on all four primitives
  (miss branches per predicate clause, dual-confirmation + held/consumed boundaries,
  `Promise.allSettled` same-connection serialization races, SQL-injection-ish text as
  parameterized data, `total_earning` frozen); service suite covers probe chains, three
  outcomes, both mismatch directions, the full amount matrix, note-content exclusion, the
  insufficient-funds rollback, and a committed double-arbitration race; journey covers J1/J2/J3
  end-to-end, the denial matrix with byte-identical copy, and the real-PG race.
- **`expect.rejects` inside `runInRollback`** ✅ — zero actual `.rejects` assertions in any
  touched suite (all hits are the prohibition docblocks; denials go through the
  `expectRepoError`/try-catch helpers).
- **Journey runs WITHOUT `runInRollback`** ✅ — committed fixtures + tracked `afterAll`
  teardown; `runInRollback` appears only in the header's prohibition text.
- **Honest race semantics** ✅ — real-PG races (not skipped in this environment), exactly-one
  winner asserted across row/wallet/lane/ledger/audit/wave artifacts.
- **Fixture hygiene** ✅ — zero-residue re-probes; two consecutive journey runs documented clean
  in 2.4/2.6; registry-driven teardown in FK order.
- **All suites re-run GREEN in this gate** (matrix below).

### PASS D — review-config

- `git diff 427c162..HEAD -- backend/db/schema/` = **only `backend/db/schema/enums.ts`** (+2
  pgEnum values, append-only) → `bun run db push` was the correct mechanism (Postgres
  `ALTER TYPE ... ADD VALUE`; no table rewrite); `db/` migration dir: **zero changes** → no
  migration drift.
- **No env-config changes**: no `resolveEnvConfig` additions and no new `process.env` reads in
  the Phase 2 code diff; `.env.test` is local gitignored sandbox infra only.

---

## Findings (aggregated, deduplicated; pre-existing issues filtered)

| # | Severity | File:line | Finding | Resolution |
|---|---|---|---|---|
| 1 | **MEDIUM** | `backend/services/classes/session-arbitration.service.helpers.ts:69,78,92,127` | 4 dead EXPORTS (knip, Task 2.6 carry-forward): `disputeRefundLedgerDescription`, `rejectResolutionFamilyMismatch`, `rejectPartialAmountInvalid`, `isPartialAmountShape` | **FIXED** — all four are LIVE internal functions (called by the module's wired exports at :118/:153/:166/:167/:272/:327), not dead code; de-exported (module-private), matching the sibling-helpers convention (`session-admin-governance.helpers.ts` keeps the same alias/function pattern non-exported). Zero behavior change. |
| 2 | **MEDIUM** | `backend/types/classes/session-arbitration.types.ts:65` | Dead exported type (knip): `ArbitrateDisputeInput` — zero consumers repo-wide | **REMOVED** — genuinely dead: the landed service binds the plan Component-1 **positional** signature (plan.md:176), which the journey + service tests pin byte-for-byte; Task 3.1's resolver binds GraphQL args to that positional call and Pothos declares its own input shapes, so the DTO is NOT required downstream (the "forward-consumed" ruling does not apply — verified against plan.md Component 4 + tasks.md 3.1). The now-unused `DisputeResolution` type import removed with it. Deviation from tasks.md 2.2's "ArbitrateDisputeInput-shaped input type" wording is deliberate and recorded here; recoverable from plan history if a future consumer wants it. |
| 3 | LOW (note, no action) | `session-arbitration.service.helpers.ts:51` | `ArbitrationErrorsTranslations` was the only *exported* errors-alias in the layer (siblings keep it module-private) | De-exported together with finding 1 (now referenced only by the module's own functions) — aligns with the established convention. |
| 4 | NOTE (out of scope) | `backend/graphql/test/schema-surface.test.ts` | Uncommitted 2.1 codegen-sync pin update (anticipated red) | Pre-existing per the gate brief — **excluded**; Task 3.1's `generate:gqlSchema && codegen` closes it. |
| 5 | NOTE (out of scope) | — | `worklog.md` +19 in the 2.1–2.6 diff is orchestrator bookkeeping; `session-lifecycle.service.ts:626-646` held-family binary dispatch is SHIPPED code outside the Phase 2 diff (the 2.1 behavior-drift note stands) | Not Phase 2 authorship — logged, not blocking. The **3.1-blocking** requirement is re-stated below. |
| 6 | NOTE (known ledger) | `session-dispute-notification.service.ts:269` | Admin cohort resolved unpaged inside the open-dispute tx | Pre-existing **D4** ledger item, explicitly deferred to Task 6.1 by plan-review R1 (#10) — not a new finding. |

**Severity totals:** CRITICAL 0 · HIGH 0 · MEDIUM 2 (both fixed) · LOW/notes 4 (documented).

## Fix Phase (applied)

Per-file cluster fix, then per-file verification:

1. `bun run scripts/health/sub-loop.ts backend/services/classes/session-arbitration.service.helpers.ts --lifecycle duplicates` → **exit 0** (tsgo/oxlint/biome/lint:type-aware/duplicates all ✅)
2. `bun run scripts/health/sub-loop.ts backend/types/classes/session-arbitration.types.ts --lifecycle duplicates` → **exit 0**
3. `bun run check:unused` (knip, strict flags) → **0 findings** (was 5)
4. `bun tsgo` project-wide → **0 errors** (baseline preserved)

## Re-Review Verdict

**Round 2 re-review of the fixed files: CLEAN — zero backend-specific findings.**
De-exports are behavior-preserving (verified: no external importers existed); the removed DTO had
zero references; knip/tsgo/lint/sub-loop all pass; every affected suite re-ran green.

## Test Green Matrix (all re-run in this gate, post-fix)

| Suite | Result |
|---|---|
| `backend/db/test/repo/classes/session.repository.test.ts` | **83 pass / 0 fail** (587 expect) |
| `backend/db/test/repo/billing/wallet.repository.test.ts` | **10 pass / 0 fail** (56 expect) |
| `backend/services/classes/session-arbitration.service.test.ts` | **21 pass / 0 fail** (294 expect) |
| `backend/services/classes/session-dispute-notification.service.test.ts` | **13 pass / 0 fail** (106 expect) |
| `test/workflows/sessions/post-confirmation-dispute.journey.test.ts` | **13 pass / 0 fail** (168 expect) — fully GREEN (2.6's waves landed; no `runInRollback`) |
| `backend/enum/scheduling/dispute-resolution.enum.test.ts` | 29 pass / 0 fail |
| `backend/enum/notifications/notification-type.enum.test.ts` | 25 pass / 0 fail |
| `shared/locale/notifications-namespace.parity.test.ts` | 127 pass / 0 fail |
| `shared/locale/errors-namespace.parity.test.ts` | 21 pass / 0 fail |
| `backend/types/classes/{session,report-home-work,recitation}.types.static-assertions.test.ts` | 9 + 10 + 6 pass / 0 fail |
| `bun run check:unused` (knip) | **0 findings** |
| `bun tsgo` (project-wide) | **0 errors** |

## Files Modified by This Gate

- `backend/services/classes/session-arbitration.service.helpers.ts` — 5 de-exports (findings 1+3)
- `backend/types/classes/session-arbitration.types.ts` — removed the unconsumed
  `ArbitrateDisputeInput` interface + its docblock + the now-unused `DisputeResolution` import
  (finding 2)
- `outcome/midpoint-review-R1.md` (this file) + the tasks.md 2.7 checkbox flip
- NOT touched: `worklog.md`, `schema-surface.test.ts` (2.1 leftover), everything else. Nothing committed.

## Carry-Forward for Task 3.1 (GraphQL surface — NOT started here)

1. **BLOCKING pairing (2.1 behavior-drift note, still open):** the schema regen
   (`bun run generate:gqlSchema && bun codegen` — this also resolves the excluded
   `schema-surface.test.ts` codegen-sync pin) MUST ship in the same change as the resolver
   dispatch `Cancel|Complete → SessionLifecycleService.resolveSessionDispute`;
   `Refund|PartialRefund|Uphold → SessionArbitrationService.arbitrateDispute`. Shipping the
   widened `DisputeResolution` on the wire without the dispatch would route `Refund`-family
   members into the shipped held-family Complete semantics.
2. Resolver binds the services WITHOUT an outer tx; the flows own commit + publish-after-commit
   (`NotificationEngine.publishReceipts(receipts, locale)` internal, one dispatch per wave) — the
   resolver shell needs no publish call and no try/catch for push outages.
3. Bind `adminDisputeCase` → `getAdminDisputeCase(adminId, id, ctx.locale)`; Pothos object bound
   to `AdminDisputeCaseReturnType` with `nullable: true` on `report`/`homework`/`recitation`;
   the positional Component-1 signatures remain the canonical call surface (the gate removed the
   unused DTO that had duplicated them).
4. Known ledger: D4 (admin fanout paging) closes in 6.1; D5 doc updates in 6.2.
