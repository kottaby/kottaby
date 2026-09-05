# Requirements & Specification: DEV2-021 — Audit Trail Completeness Verification

> **Date**: Sprint 4 (Milestone M4 — Verification & Hardening)
> **Target Ticket**: DEV2-021 — Audit Trail Completeness Verification (`docs/planning/TICKETS.md` §Sprint 4; Blocked By: DEV3-020 — satisfied)
> **Plan directory (verbatim — every header, ledger path, and self-reference in this document uses this exact string):** `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification`
> **Canonical anchors:** `docs/admin/audit-trail.md`, `docs/admin/user-management.md`, `docs/admin/cold-start-certification.md`, `docs/notifications/broadcast-notifications.md`, `docs/specs/open-decisions-and-gaps.md` (A.5), `docs/specs/functional-requirements.md` (FR-10.5), `docs/planning/PRODUCTION_READINESS.md` §1.3, `docs/specs/state-machine-invariants.md` (INV-U1, INV-U5), `docs/testing/workflow-journey-tests.md`, `test/workflows/AGENTS.md`.

---

## 1. Executive Summary & Problem Statement

**Purpose.** DEV3-016/018/019-era tickets built the immutable audit pipeline (append-only `audit_logs` table, `AuditService.createAuditLog` single writer, admin-gated read surface). DEV2-021 is the **verification ticket**: it proves — with automated, repeatable tests — that every admin action that commits ALSO mints exactly one `audit_logs` row with correct `actor_id`, `action_type`, `entity_type`, `entity_id`, `details`, and `created_at`, and that the trail shows a complete chronological history with no missing entries.

**Problem.** The audit-emission rule ("every admin mutation that commits MUST append exactly ONE `audit_logs` row inside the same transaction") is currently enforced by service-level discipline plus per-ticket tests. There is no single machine-checkable inventory of (a) which admin mutations exist, (b) which ones emit audit rows, (c) what action type / entity type each MUST emit, and (d) proof that no committed admin mutation path silently skips auditing. `docs/planning/PRODUCTION_READINESS.md` §1.3 rows 1.3.1/1.3.3/1.3.5 are unchecked (`☐`).

**What this ticket delivers.**
1. A code-level **admin audit action registry** — one canonical, typed module enumerating every admin mutation surface, its expected `AuditActionType`, its `entity_type`, and its audit-emitter call site (`path:line`).
2. A **static single-writer scan** test proving: `AuditService.createAuditLog` is the ONLY `audit_logs` insert site; every registered admin action actually calls it inside a `withTransaction` block; registered actions are the COMPLETE set of admin mutations in the codebase (fail-closed drift detection).
3. **Behavioral completeness tests**: real service calls that perform each admin action against the real test DB and assert the minted row's exact fields (actor = caller `ctx.user.id`, correct action type / entity type / entity id, `details` JSON parses and is ≤2000 chars, `createdAt` present and chronologically ordered).
4. A **no-missing-entries oracle**: row-count reconciliation (committed admin mutations == minted audit rows) and a complete chronological-history read through the real `AuditTrailService`.
5. Honest **gap reporting**: admin actions whose emitters are deferred to future tickets (e.g. `adjust`, `suspend` producers) are recorded in `deferred-items.md` with owner pointers — the completeness suite proves coverage of what exists and FAILS LOUDLY if a new admin mutation lands without registry registration.

**Persona workflows.**
- **Admin (producer)** — performs create/update/delete/reactivate user governance, teacher cold-start certification, and broadcast announcements; each committed action mints exactly one audit row.
- **Admin (observer, may be a different admin)** — reads the global trail, filters, paginates, and sees the complete chronological history.
- **Non-admin (student/parent/teacher/supervisor)** — is denied from admin mutation surfaces AND from the trail read surface; denials mint ZERO audit rows (JR-C-1).
- **System (future)** — action types lacking in-tree producers today (`adjust`, `suspend`) are represented in the registry as forward obligations, not silently skipped.

**Actors:** Admin producer, Admin observer, non-admin denied actor, System/future producers.

**Explicit non-goals (out of scope).**
- No new audit emitters are implemented here (emitters belong to their owning tickets; absence is a ledger row, not new code).
- No schema changes (append-only `audit_logs` + immutability triggers are DEV3-020 output).
- No frontend/UI changes (the admin audit-trail UI and its tests are already locked by `docs/admin/audit-trail.md` §10).
- No changes to `AuditService`, `AuditTrailService`, or any producer service beyond test-visible registry consumption.
- No `runInRollback` in journey tests; no mocking of the database.

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

- **REQ-001** WHEN implementation begins THEN the plan SHALL record baseline counts (`bun tsgo` exit+count, `bun run biome:check` count, lint-service count), the verbatim `git diff --name-only` set, and SHALL initialize `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/deferred-items.md` before any code change.
- **REQ-002** WHEN any test asserts on error text THEN it SHALL use the compile-time i18n system only: `getServerTranslations("en").errorsTranslations` from `@/shared/locale/server-graphql` (single argument), translated SUBSTRING matching (never raw key echoes), and enum VALUES imported from `@/backend/enum/audit/audit-action-type.enum` (never string literals of enum values).
- **REQ-003** WHEN any test or helper references audit row shapes THEN it SHALL import canonical types from `@/backend/types` (`AuditLogWriteContract`, `AuditLogSelectType`, `DBTransaction`) and SHALL NOT define local duplicates or service-layer `.types.ts` files.

### 2.2 Core Feature Logic / Happy Paths

- **REQ-010** WHEN the admin audit action registry module is created THEN it SHALL enumerate every admin mutation surface as a typed const (operation key, expected `AuditActionType`, `entity_type`, emitter file path) with zero hardcoded duplicates, and export it for tests.
- **REQ-011** WHEN a static single-writer scan runs THEN it SHALL prove `AuditService.createAuditLog` (`backend/services/admin/audit.service.ts:82-90`) is the sole `audit_logs` insert site and that every registered admin action's emitter actually invokes it inside a `withTransaction(...)` block (source-level or runtime-instrumented proof).
- **REQ-012** WHEN an admin CREATES a user via `AdminUserManagementService.createUser` and the transaction commits THEN exactly one `audit_logs` row SHALL exist with `actionType = AuditActionType.Create`, `entityType = "user"`, `entityId = <created user id>`, and `actorId = <calling admin id>`.
- **REQ-013** WHEN an admin UPDATES a user via `AdminUserManagementService.updateUser` and it commits THEN exactly one row SHALL exist with `actionType = AuditActionType.Update`, `entityType = "user"`, and `details` containing the changed field NAMES.
- **REQ-014** WHEN an admin SOFT-DELETES a user via `AdminUserManagementService.setUserDeleted(id, true)` and it commits THEN exactly one row SHALL exist with `actionType = AuditActionType.Delete`.
- **REQ-015** WHEN an admin REACTIVATES a user via `setUserDeleted(id, false)` and it commits THEN exactly one row SHALL exist with `actionType = AuditActionType.Reactivate`.
- **REQ-016** WHEN an admin certifies a teacher via `ColdStartCertificationService.certifyTeacherColdStart` and it commits THEN exactly one row SHALL exist with `actionType = AuditActionType.Override` and `entityType = "teacher"`.
- **REQ-017** WHEN an admin broadcasts via `AdminBroadcastService.broadcast` and it commits (fresh, non-replay) THEN exactly one row SHALL exist with `actionType = AuditActionType.Create`, `entityType = "notification_broadcast"`, and `entityId = null`.
- **REQ-018** WHEN a broadcast idempotency replay is detected THEN zero ADDITIONAL audit rows SHALL be minted for the replay.
- **REQ-019** WHEN `adjust` or `suspend` action types lack an in-tree producer THEN the registry SHALL mark them as producer-absent forward obligations (ledger-backed), and the completeness suite SHALL assert they are absent-or-registered — never silently skipped.
- **REQ-020** WHEN any audit row is asserted THEN `details` SHALL be a string ≤ 2000 chars that parses as JSON and SHALL contain field NAMES/metadata only (no email/phone/credential/passwordHash/pre-post value pairs — scanned by denylist assertion).
- **REQ-021** WHEN multiple admin actions commit in sequence THEN their audit rows SHALL be readable via `AuditTrailService.listAuditTrail` in a single chronological history with monotonic ordering (`createdAt DESC, id DESC` per canonical contract) and honest `totalCount`.
- **REQ-022** WHEN the completeness oracle runs for a test window THEN the number of committed admin mutations SHALL equal the number of minted audit rows attributable to those mutations (row-count reconciliation; no-missing-entries).
- **REQ-023** WHEN a producer transaction ROLLS BACK (e.g. handler throws after the insert point or zero-row guarded update) THEN zero audit rows SHALL survive from that attempt (co-fate proof).
- **REQ-024** WHEN the audit rows are asserted THEN every NOT NULL column SHALL be populated and `createdAt` SHALL be within the test window.

### 2.3 Security, Authorization & Tenancy

- **REQ-030** WHEN an anonymous caller (`actorId = 0`) hits any admin mutation or the trail read surface THEN it SHALL receive `UNAUTHENTICATED`/`UNAUTHORIZED` and mint ZERO audit rows.
- **REQ-031** WHEN a non-admin actor (student/parent/teacher/supervisor) attempts an admin mutation or a trail read THEN it SHALL receive `FORBIDDEN` and mint ZERO audit rows (JR-C-1).
- **REQ-032** WHEN services source `actorId` THEN it SHALL come from `ctx.user.id` ONLY — never from client input (BOLA/BOPLA proof via contract inspection + a tampered-input chaos test that cannot smuggle an actor id).
- **REQ-033** WHEN `details` payloads are constructed THEN they SHALL be whitelisted field-name/metadata JSON (BOPLA) — never a spread of client input.
- **REQ-034** WHEN multi-tenant surface applies THEN tenant isolation SHALL hold for any tenant-scoped admin action in scope (asserted per owning ticket's tenancy tests; re-verified here at the trail level).
- **REQ-035** WHEN denial paths (self-deactivation, unknown-id, tamper-role, corrupt-state) execute THEN they SHALL mint ZERO audit rows (JR-C-1 enumeration covered by existing suites; this ticket re-asserts at least the tamper/unknown-id representatives through real service calls).

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040** WHEN a producer commits THEN the audit insert SHALL share the SAME `withTransaction` handle as the mutation (in-tx assertion via transaction-identity oracle).
- **REQ-041** WHEN concurrent admin mutations commit in parallel THEN each SHALL mint its own row and the trail read (snapshot) SHALL show both with a consistent `totalCount` (repeatable-read pair).
- **REQ-042** WHEN UPDATE/DELETE is attempted on `audit_logs` outside the sanctioned suspension helper THEN the DB immutability trigger SHALL reject it (defense-in-depth re-proof; existing `audit-immutability.test.ts` remains the lock — this ticket re-verifies, does not re-implement).
- **REQ-043** WHEN tests create and destroy fixtures THEN `afterAll` SHALL hard-delete tracked rows in FK-safe order using `withAuditDeleteTriggersSuspended` from `@/test/helpers/db-cleanup` and SHALL re-probe to assert ZERO residue (whole-table oracle).

### 2.5 Validation & Localized Error Contracts

- **REQ-050** WHEN tests assert denials THEN they SHALL use a try/catch helper (NEVER `expect(...).rejects.toThrow()`) and match translated substrings from `getServerTranslations(...).errorsTranslations` — never hardcoded English strings and never raw key echoes.
- **REQ-051** WHEN filter/pagination misuse is probed on the trail read surface THEN malformed values SHALL reject with `ValidationError` pre-DB (existing surface contract; re-asserted at the boundaries the completeness suite exercises).
- **REQ-052** WHEN a corrupt stored `action_type` is encountered during read projection THEN the surface SHALL fail closed (plain runtime error masked to generic internal at transport) — re-verified, not re-implemented.

### 2.6 GraphQL & Frontend Contracts

- **REQ-060** WHEN the wire surface is referenced THEN this ticket SHALL NOT add/modify any GraphQL operation, SDL, or frontend code; the existing `adminAuditLogs` query (`backend/graphql/query/admin/audit-trail.query.ts`, `backend/graphql/pothos/admin/audit-trail.pothos.ts`) and its locked tests remain the canonical wire contract, and the registry SHALL reference (not duplicate) the committed schema-surface SDL inventory.
- **REQ-061** WHEN journey tests hit service layer directly THEN they SHALL use real services + committed DB fixtures (service-level contract), documenting that wire-level denial tiers are already locked by `backend/graphql/test/audit-trail.query.test.ts` and `admin-broadcast.integration.test.ts`.

### 2.7 Test Coverage Requirements

- **REQ-070** WHEN tests are authored THEN they SHALL follow the 4-Tier framework: Tier 1 branch (each action type's expected row), Tier 2 boundary (replay no-double-write, 2000-char details ceiling, empty-vs-populated filters), Tier 3 chaos (rollback co-fate, concurrent producers, tampered actor input), Tier 4 security (denial audiences mint zero rows; PII denylist scan of `details`).
- **REQ-071** WHEN tests touch the DB directly outside the service layer THEN `runInRollback` SHALL be used and `tx` SHALL be passed to every repository call (backend/db/test rule); journey tests are the documented exception (committed fixtures, no rollback wrapper).
- **REQ-072** WHEN workflow tests run THEN committed fixtures SHALL be created in ONE committing transaction in `beforeAll`, tracked in `TrackedFixtures`, and hard-deleted in `afterAll` with mandatory post-teardown residue re-probes (`test/workflows/AGENTS.md` rules 1–5).
- **REQ-073** WHEN any test file is executed THEN it SHALL be run via `bun run test/scripts/run-test.ts <test-path>` (never raw `bun test`).
- **REQ-074** WHEN the suite completes THEN it SHALL leave the database clean (row-count oracles return to baseline) and SHALL be safe to run repeatedly (unique per-run UUID prefixes).

### 2.8 Documentation & Knowledge Gates

- **REQ-080** WHEN verification results land THEN `docs/admin/audit-trail.md` §10 "Test Locks" SHALL be updated to register the new completeness suites (pointer amendment only — canonical-defining tickets remain the doc owners).
- **REQ-081** WHEN the PRODUCTION_READINESS §1.3 rows (1.3.1, 1.3.3, 1.3.5) are covered by passing tests THEN the plan's outcome docs SHALL record evidence; flipping the `☐` checkboxes in `docs/planning/PRODUCTION_READINESS.md` is explicitly deferred to the release-manager pass (ledger row; pointer amendment not made here).
- **REQ-082** WHEN each task completes THEN an outcome doc SHALL be written under `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome/`.
- **REQ-083** WHEN Phases 1–6 begin THEN a passed Phase-1.5 plan-review gate SHALL exist (`outcome/plan-review-R1.md`).

### 2.9 Cross-Actor Workflow Scenarios (Journeys)

**Actor Table**

| Actor | Role | Permissions here | Restrictions |
|---|---|---|---|
| Admin Producer A | `admin` | all admin mutations in registry | cannot mint >1 row per commit; cannot audit denials |
| Admin Observer B | `admin` (DIFFERENT user id) | full trail read (filter/paginate) | read-only; reads mint zero rows |
| Non-admin (student/parent/teacher/supervisor) | non-admin | none on admin surfaces | always `FORBIDDEN`; zero audit rows |
| Anonymous | none | none | `UNAUTHENTICATED`; zero audit rows |
| System (future producers) | — | forward obligations for `adjust`/`suspend` emitters | must register on landing or suite fails |

**Journey 1 — Produce → Observe → Reconcile (completeness).** Ordered steps:
1. Admin A -> `createUser` -> user row committed + audit row {create, user}.
2. Admin A -> `updateUser` on that user -> changed field NAMES logged + audit row {update, user}.
3. Admin A -> `setUserDeleted(id, true)` -> soft-delete + audit row {delete, user}.
4. Admin A -> `setUserDeleted(id, false)` -> reactivate + audit row {reactivate, user}.
5. Admin A -> `certifyTeacherColdStart` on a teacher fixture -> certification + audit row {override, teacher}.
6. Admin A -> `broadcast` a cohort announcement -> notifications emitted + audit row {create, notification_broadcast, entityId null}.
7. B (different admin) -> `listAuditTrail` unfiltered then filtered per action type -> sees all six rows in chronological order; `totalCount` equals rows attributable to the run.
8. Observer -> reconcile -> number of committed admin mutations (6) == minted audit rows (6). Expected shared-state change: `audit_logs` grows by exactly 6; side effects: notifications sent (spied), no audit rows from reads.

**EARS (observer-perspective):**
- **REQ-090** WHEN Admin Observer B reads the trail after Journey 1 THEN they SHALL see exactly the six rows with correct `(actorId = A.id, actionType, entityType, entityId)` tuples and chronological ordering.
- **REQ-091** WHEN Observer B counts vs producer commits THEN the totals SHALL reconcile exactly (no missing entries, no extra rows).
- **REQ-092** WHEN the `details` of each row is inspected THEN it SHALL be parseable JSON ≤ 2000 chars with field names/metadata only.

**Journey 2 — Denial & Zero-Write (JR-C-1).**
1. Anonymous -> `createUser` / `listAuditTrail` -> `UNAUTHENTICATED`/`UNAUTHORIZED`; audit row count unchanged.
2. Non-admin (student) -> `createUser` and `listAuditTrail` -> `FORBIDDEN`; audit row count unchanged.
3. Admin -> `setUserDeleted(unknownId)` and `setUserDeleted` with tamper-role input -> `USER_NOT_FOUND`/`ADMIN_ROLE_CREATION_FORBIDDEN`; zero audit rows.
- **REQ-093** WHEN any denial path executes THEN the `audit_logs` row count SHALL be unchanged and no notification side-effects SHALL fire for audit purposes.
- **REQ-094** WHEN a tampered actor-id input is supplied on an audited mutation THEN the minted row's `actorId` SHALL be the real caller `ctx.user.id`, never the input value (or the call is denied before write).

**Journey 3 — Rollback & Replay (co-fate and idempotency).**
1. Admin A -> invoke `broadcast` with an idempotency key twice -> single audit row; replay mints none.
2. Producer tx fails post-insert point (test forces failure after the audit insert within the same tx) -> whole tx rolls back; zero audit rows survive.
- **REQ-095** WHEN a committed mutation's transaction rolls back THEN its audit row SHALL roll back with it (co-fate).
- **REQ-096** WHEN an idempotent replay is detected THEN no additional audit row SHALL be minted.

---

## 3. System Decisions & State-Machine Invariant Alignment

- **A.5 / FR-10.5** (`docs/specs/open-decisions-and-gaps.md`, `docs/specs/functional-requirements.md`): audit trail table + `audit_action_type` enum are the settled mechanism; this ticket verifies them, does not alter them.
- **INV-U1 / INV-U5** (`docs/specs/state-machine-invariants.md`): history and balances survive governance — audit rows must survive user soft-delete/reactivation; verified by reading the trail across governed states.
- **JR-C-1** (from `docs/admin/user-management.md` / services AGENTS): denial paths mint ZERO audit rows — elevated here to a first-class journey.
- **Append-only enforcement** (two-tier: single-writer scan + DB immutability triggers): re-verified, not duplicated.
- **Snapshot read consistency** (`repeatable read` when service owns tx): relied on for the reconcile oracle.

## 4. Cross-Layer Traceability Matrix

| REQ | Invariant/Decision | Service | Resolver/Surface | UI | Tests |
|---|---|---|---|---|---|
| REQ-001..003 | — | — | — | — | baseline + outcome docs |
| REQ-010,011 | A.5 | `AuditService` | registry module | — | `audit-completeness.registry.test.ts` |
| REQ-012..017 | FR-10.5 | `AdminUserManagementService`, `ColdStartCertificationService`, `AdminBroadcastService` | mutation surfaces (existing) | — | service/journey tiers |
| REQ-018,095,096 | idempotency engine | `AdminBroadcastService` | broadcast mutation | — | Tier 2/3 |
| REQ-019 | forward obligation | registry ledger | — | — | registry + ledger rows |
| REQ-020,033,092 | BOPLA | emitters | — | — | PII denylist assertions |
| REQ-021,022,090,091 | snapshot contract | `AuditTrailService` | `audit-trail.query` | — | journey reconstruction |
| REQ-023,040,095 | atomicity | `AuditService` | — | — | Tier 3 chaos |
| REQ-030..035,093,094 | JR-C-1 / BOLA | admin-gate helpers | mutation surfaces | — | Journey 2 |
| REQ-041 | concurrency | `AuditTrailService` | — | — | Tier 3 |
| REQ-042 | two-tier immutability | triggers | — | — | re-verify existing lock |
| REQ-050..052 | error contract | services | error taxonomy | — | try/catch + translations |
| REQ-060,061 | wire locks | — | existing query/mutation | unchanged | reference existing locks |
| REQ-070..074 | testing rules | — | — | — | 4-tier + workflow rules |
| REQ-080..083 | docs/knowledge | — | — | — | docs + outcome docs |
| REQ-090..096 | journey contract | all above | — | — | `test/workflows/admin/audit-trail-completeness.journey.test.ts` |
