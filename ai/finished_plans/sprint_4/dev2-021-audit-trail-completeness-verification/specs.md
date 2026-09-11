# Requirements & Specification: Audit Trail Completeness Verification

## Document Information

- **Feature Name**: Audit Trail Completeness Verification
- **Ticket**: `docs/planning/TICKETS.md:2838` (Owner Stream: Dev 2, Sprint 4, 3 SP, Blocked By: the audit-emission foundation ticket)
- **Target Directory**: `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification`
- **Outcome Directory**: `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome`
- **Version**: 1.0
- **Date**: 2026-09-05
- **Author**: Dev 2 stream (spec authored by planning agent)
- **Stakeholders**: Platform Auditor / Compliance (consumer), Dev 2 (author), Dev 3 (owner of the audit-emission contract), launch-checklist executor (PRODUCTION_READINESS §1.3)
- **Related Canonical Documents**: `docs/admin/audit-trail.md` (read surface + two-tier immutability proof) · `docs/admin/user-management.md` §2.4 (audit-emission contract) · `docs/workflows/05-admin-governance-override.md` §7 (audit trail requirements + action catalog) · `docs/specs/open-decisions-and-gaps.md` decision A.5 · `docs/planning/PRODUCTION_READINESS.md` §1.3 · `docs/testing/workflow-journey-tests.md` · `test/workflows/AGENTS.md`

---

## Introduction

The platform's governance story (FR-10.5, Workflow 05 §7.1) rests on one claim: **every administrative action is permanently logged in `audit_logs`**. The audit-emission foundation and admin user-management work built the write primitive (`AuditService.createAuditLog`) and the admin user-management emitters; cold-start teacher certification, the broadcast surface, and earlier admin work added more emitters; `docs/admin/audit-trail.md` documents the read surface and the two-tier immutability proof. What has never existed is the **completeness proof**: an automated, self-maintaining verification that every shipped admin action actually mints its audit row — and that any future admin mutation silently shipped without one fails CI immediately.

Verified on disk (Phase-0 table below): three admin surfaces — plan-catalog (`createPlan` / `updatePlan` / `setPlanActiveStatus`, each carrying an explicit `// audit hook seam` comment) and session-dispute arbitration (`resolveSessionDispute`) — are shipped admin mutations with **zero audit emission**. A verification-only ticket that ignores them would ship a red suite; this ticket therefore both (a) closes the two confirmed gaps at their pre-built seams, and (b) delivers the standing verification harness: a machine-readable census of every admin action plus journey coverage proving row-shape, chronology, and zero-missing oracles.

### Feature Summary

Ship (1) a typed **admin action census** — the single machine-readable catalog of all shipped admin mutations with their expected audit row shape; (2) **gap remediation** wiring audit emission into plan-catalog and session-dispute services through the existing `AuditService.createAuditLog(tx)` contract; (3) a static **anti-drift test** proving census ↔ `authScopes: role: [UserRole.Admin]` mutation bijection; (4) a **completeness journey** (`test/workflows/admin/audit-completeness.journey.test.ts`) that performs every census action against the real service/DB stack and proves the audit trail is complete, correctly shaped, and chronological; and (5) propagated documentation.

### Business Value

- Converts PRODUCTION_READINESS §1.3 from assertion to evidence — the launch checklist cannot sign off audit-trail completeness without it.
- Catches audit drift permanently: adding an admin mutation without extending the census fails the static test.
- Closes real compliance holes (plan-catalog, dispute arbitration) found *by* the census — the ticket pays for itself at authoring time.
- Immutable + complete + chronological = the trail a compliance review actually needs.

### Scope

**In scope:** census module + static drift test; audit emission remediation for plan-catalog (3 mutations) and session-dispute arbitration (1 mutation); one new cross-actor journey covering every census action; enum-coverage accounting for all 7 `audit_action_type` values; denial-isolation oracles; knowledge propagation.

**Out of scope (explicit non-goals):**
1. No changes to the `audit_logs` schema, enum, triggers, or read surface (all verified adequate).
2. No UI/frontend work — verification is a test-layer concern; the admin `/audit` UI already renders every row type.
3. No new admin surfaces (subscription management, financial adjustment, admin password reset, session reschedule/reassign/join-live) — Workflow 05 §7.2 categories with **no shipped producer** are census rows of kind `deferred`, tracked in `deferred-items.md`, NOT implemented here.
4. No changes to `AuditService` / `AuditLogWriteContract` — they are consumed as-is.
5. No modifications to existing emitters (user-management, cold-start, broadcast) beyond what the journey needs — their emission is verified, not rewritten.

---

## ⚠️ Phase-0 Ground-Truth Verification (verify-then-claim, ruled against the live tree 2026-09-05)

Every claim below was probed against the live tree before authoring. Prose-only findings are treated as CREATE.

| # | Item probed | Evidence | Result | Disposition |
|---|---|---|---|---|
| G-01 | `audit_logs` schema | `backend/db/schema/audit/audit-logs.ts` — `actorId` FK `restrict`, `actionType` enum NOT NULL, `entityType` varchar(100), `entityId` nullable int, `details` varchar(2000), `createdAt` defaultNow; no `updated_at`; indexes `audit_logs_actor_id_idx`, `audit_logs_entity_type_entity_id_idx` | EXISTS, adequate | CONSUME |
| G-02 | Action enum | `backend/db/schema/enums.ts:66-74` — pgEnum `audit_action_type` = create/update/delete/override/adjust/suspend/reactivate; runtime enum `AuditActionType` in `@/backend/enum/audit/audit-action-type.enum` | EXISTS, 7 values | CONSUME |
| G-03 | Canonical writer | `backend/services/admin/audit.service.ts` — `AuditService.createAuditLog(input, tx)`, insert-only, details truncated ≤2000, failure throws (rolls caller tx) | EXISTS | CONSUME as-is |
| G-04 | Write contract | `backend/types/contracts/admin-audit.contract.types.ts:22` — `AuditLogWriteContract` (actorId ctx-derived, actionType, entityType, entityId nullable, details ≤2000 JSON-string) | EXISTS | CONSUME as-is |
| G-05 | Shipped emitters | `user-management.service.ts:313` (Create), `:374` (Update), `:438` (Delete/Reactivate) via `buildAuditContract` (`user-management.helpers.ts:334-348`, entityType `"user"`); `cold-start-certification.service.ts:204` (Override, entityType `"teacher"`); `admin-broadcast.service.ts:397` (Create, entityType `"notification_broadcast"`) | EXISTS | VERIFY via journey |
| G-06 | GAP — plan catalog | `backend/services/billing/plan-catalog.service.ts:229` (createPlan), `:264` (updatePlan), `:314` (setPlanActiveStatus) each carry `// audit hook seam` with NO emission; mutations admin-gated at `backend/graphql/mutation/plan-catalog.mutation.ts` (`createPlan`, `updatePlan`, `setPlanActiveStatus`, `authScopes: { role: [UserRole.Admin] }`, resolvers have `ctx.user` available) | SHIPPED, UNAUDITED | REMEDIATE (in scope) |
| G-07 | GAP — session dispute | `SessionLifecycleService.resolveSessionDispute(adminId, sessionId, resolution, note, locale, outerTx?)` at `backend/services/classes/session-lifecycle.service.ts:418`; admin-gated `resolveSessionDispute` mutation (`backend/graphql/mutation/classes/session-lifecycle.mutation.ts`, `$all: { authenticated, role: [UserRole.Admin] }`); NO audit emission in the `withTransaction` block | SHIPPED, UNAUDITED | REMEDIATE (in scope) |
| G-08 | Admin mutation inventory | grep `role: [UserRole.Admin]` over `backend/graphql/mutation/**` → `admin-users` (3 fields), `admin-teachers` (1), `admin-broadcast` (1), `plan-catalog` (3), `session-lifecycle` (1) — 9 admin mutations total | ENUMERATED | Census basis |
| G-09 | Unshipped Workflow-05 categories | No admin subscription management, financial adjustment, password-reset, session reschedule/reassign mutations exist anywhere in `backend/graphql/mutation/**`; `wallet.service.ts` has zero admin paths | NOT SHIPPED | DEFER (ledger D-301+) |
| G-10 | Enum coverage by producer | `toAuditActionType` switch at `admin-gate.helpers.ts:29-39` covers all 7; shipped producers emit only Create/Update/Delete/Reactivate/Override — **Suspend, Adjust have no shipped producer** | PARTIAL | Suspend+Reactivate covered by remediation (plan status toggle); Adjust stays census `deferred` + fixture-lane coverage |
| G-11 | Census/drift-test substrate | `backend/db/test/logic/audit/audit-immutability.test.ts:150-220` already walks the whole `backend/` production corpus with regex scanners (corpus-population guard ≥250 files) | EXISTING PATTERN | EXTEND pattern (new sibling suite, do NOT edit the immutability suite) |
| G-12 | Journey harness | `test/workflows/helpers/` (`provisionAdminActor`, `TrackedFixtures`), `withAuditDeleteTriggersSuspended` teardown helper, row-count oracles — all as used by `test/workflows/admin/audit-trail.journey.test.ts` | EXISTING | REUSE |
| G-13 | Existing audit journey | `test/workflows/admin/audit-trail.journey.test.ts` (647 lines) covers user-management produce/observe/filter/deny + fixture lanes; does NOT cover plan-catalog, dispute, broadcast produce path | PARTIAL | New sibling journey; existing suite untouched |
| G-14 | i18n / locale | Translation access in service layer = `getServerTranslations(locale).errorsTranslations` (`@/shared/locale/server-graphql`); services take `locale: string` param. No `Translation.` enum exists | CONFIRMED | Follow existing |
| G-15 | Audit-emission plan dir | Absent from `ai/plans/sprint_3/` — emission shipped in code without a plan dir | N/A | No blocking reads |

---

## Requirements

### REQ-000: Pre-Implementation Baseline & Execution Protocol

**User Story:** As the executing agent, I need a recorded quality baseline and outcome ledger so new issues are distinguishable from pre-existing ones and no analysis is re-done.

#### Acceptance Criteria
1. WHEN implementation begins THEN `bun tsgo`, `bun biome:check`, and `bun run scripts/lint-service.ts --json --id baseline` baselines SHALL be recorded into `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome/phase0-baseline.md`.
2. WHEN implementation begins THEN the ledger `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/deferred-items.md` SHALL exist (pre-seeded D-001..D-004 at planning time) and every deferred decision SHALL have a ledger row before its task may close.
3. WHEN an agent starts any task THEN it SHALL read ALL files under `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome/` first.
4. WHEN a task completes THEN the agent SHALL write `outcome/<task-id>-outcome.md` with findings and carry-overs, and flip its `tasks.md` checkbox `[ ]` → `[x]`.
5. WHEN any file is modified THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 before the next file is touched.
6. WHEN any subtask is marked complete THEN the semantic-review checklist SHALL have been executed (no REQ/task/phase references in code comments; no dead code; no cross-layer imports).

#### Additional Details
- **Priority**: High · **Complexity**: Low · **Dependencies**: none · **Assumptions**: quality tooling is green or baselined on the working branch.

### REQ-000.5: Translation System & Enum Import Compliance

#### Acceptance Criteria
1. WHEN new code raises user-facing errors THEN it SHALL use `getServerTranslations(locale, ...)` / `ctx.t(...)` per layer convention — never hardcoded strings; services take `locale: string` parameters (there is NO `LocaleType` — verified G-14).
2. WHEN enums are used at runtime (`AuditActionType`, `UserRole`, `DisputeResolution`) THEN they SHALL be value imports from `@/backend/enum/...` — never `import type`, never string literals.
3. WHEN new/modified files are grepped THEN `next-intl`, `getBackendTranslations`, `shared/messages/`, and any `Translation.` (enum) reference SHALL be absent (grep-verifiable).
4. WHEN test suites assert denial messages THEN they SHALL use translated substrings from `getServerTranslations("en").errorsTranslations` — never raw key echoes, never `expect(...).rejects.toThrow()`.

#### Additional Details
- **Priority**: Medium · **Complexity**: Low · **Dependencies**: REQ-000

---

## Core Requirements: The Census (REQ-010, REQ-020)

### REQ-010: Admin Action Census (Machine-Readable Catalog)

**User Story:** As a compliance auditor, I want a single typed module listing every admin action with its expected audit row shape, so "complete" is a computable claim, not a belief.

#### Acceptance Criteria
1. WHEN the census module (`test/workflows/admin/audit-completeness.catalog.ts`, CREATE) is read THEN it SHALL contain exactly one entry per shipped admin mutation: `{ mutationField, serviceEntry, expectedActionTypes: AuditActionType[], expectedEntityType: string, kind: "wired" | "deferred", tier: "journey" | "fixture" }`.
2. WHEN the census is authored THEN its `wired` rows SHALL be exactly: `adminCreateUser`→Create/user; `adminUpdateUser`→Update/user; `adminSetUserDeleted`→Delete+Reactivate/user; `adminCertifyTeacherColdStart`→Override/teacher; `adminBroadcastNotification`→Create/notification_broadcast; `createPlan`→Create/plan; `updatePlan`→Update/plan; `setPlanActiveStatus`→Suspend (deactivate)+Reactivate (activate)/plan; `resolveSessionDispute`→Override/session (row-shapes per G-05..G-08).
3. WHEN Workflow 05 §7.2 lists a category with NO shipped producer (subscription management, financial adjustment, password reset, session reschedule/reassign/join-live, and the `Adjust` verb) THEN the census SHALL carry a `kind: "deferred"` row naming the owning future surface, and each such row SHALL map to a `deferred-items.md` ledger row.
4. IF the census and the shipped mutation inventory diverge THEN the anti-drift test (REQ-020) SHALL fail — divergence is a build error, not a warning.

#### Additional Details
- **Priority**: High · **Complexity**: Medium · **Dependencies**: REQ-000 · **Assumptions**: catalog lives in the test layer (it is verification infrastructure, not production code); admin-dispute UI (`AdminDisputesContainer`) is consumer-only.

### REQ-020: Anti-Drift Static Census Test

**User Story:** As a maintainer, I want adding an unaudited admin mutation to break CI immediately, so the trail can never silently regress again.

#### Acceptance Criteria
1. WHEN `backend/db/test/logic/audit/audit-census-drift.test.ts` (CREATE) runs THEN it SHALL scan the production corpus (`backend/graphql/mutation/**`, mirroring the corpus-walk pattern of `audit-immutability.test.ts:150-220`) and extract every mutation field whose authScopes gate on `UserRole.Admin` (including `$all` conjunctions).
2. WHEN the extracted field names are compared with the census catalog THEN the sets SHALL be bijective — a shipped admin mutation missing from the census, or a census `wired` row with no shipped mutation, SHALL fail the test.
3. WHEN the scan runs THEN it SHALL assert corpus-population sanity (≥9 admin-gated mutation fields found at authoring time) so a broken scanner can never fake green.
4. WHEN a new admin mutation is shipped later THEN the author SHALL be forced to add a census row (wired or deferred) before CI passes.

#### Additional Details
- **Priority**: High · **Complexity**: Medium · **Dependencies**: REQ-010

---

## Core Requirements: Gap Remediation (REQ-030, REQ-031)

### REQ-030: Plan-Catalog Audit Emission

**User Story:** As an auditor, I want plan create/update/activate/deactivate recorded, so financial-product changes are reconstructible.

#### Acceptance Criteria
1. WHEN `PlanCatalogService.createPlan` succeeds THEN exactly ONE `audit_logs` row SHALL be appended in the same transaction: `actionType=Create`, `entityType="plan"`, `entityId=created.id`, `details` = JSON of non-PII field names/values (title, sessionCount, price, currency, intervalDays).
2. WHEN `PlanCatalogService.updatePlan` succeeds THEN exactly ONE row SHALL be appended: `actionType=Update`, `entityType="plan"`, `entityId=id`, `details` = `{ changedFields: [...] }` (field names only, mirroring the user-management convention at `user-management.service.ts:374`).
3. WHEN `PlanCatalogService.setPlanActiveStatus` succeeds THEN exactly ONE row SHALL be appended: `actionType=Suspend` when deactivating, `Reactivate` when activating (enum semantics: activation restores availability, deactivation suspends it), `entityType="plan"`, `entityId=id`, `details` = `{ isActive }`.
4. WHEN any plan-catalog mutation fails (validation, PLAN_NOT_FOUND, conflict, already-in-target-status) THEN ZERO audit rows SHALL be minted (row-count oracle).
5. WHEN the mutations are invoked THEN `actorId` SHALL be threaded from `ctx.user.id` (resolver change in `backend/graphql/mutation/plan-catalog.mutation.ts`), `assertActorAdmin`-style re-assertion SHALL run per the canonical gate (`admin-gate.helpers.ts:59`), and the audit insert SHALL share the mutation's transaction (`withTransaction` discipline).
6. WHEN the service signatures change THEN the three `// audit hook seam` comments SHALL be replaced by the real emission — the seam is consumed, not preserved.

#### Additional Details
- **Priority**: High · **Complexity**: Medium · **Dependencies**: REQ-010 · **Assumptions**: service tests for plan-catalog live under `test:services`; the mutations keep their existing public GraphQL signatures (input/args unchanged; actor threading is resolver-internal).

### REQ-031: Session-Dispute Arbitration Audit Emission

**User Story:** As an auditor, I want dispute arbitration recorded, so money-moving decisions are accountable.

#### Acceptance Criteria
1. WHEN `SessionLifecycleService.resolveSessionDispute` successfully resolves a dispute THEN exactly ONE `audit_logs` row SHALL be appended **inside the same `withTransaction` block** (`session-lifecycle.service.ts:418` region): `actionType=Override`, `entityType="session"`, `entityId=sessionId`, `details` = JSON `{ resolution, notePresent: boolean }` (note CONTENT excluded — free-text must not land in the trail).
2. WHEN arbitration is denied (non-admin, governed actor, bad session state, invalid resolution) THEN ZERO audit rows SHALL be minted (the existing deny paths already throw before/inside the tx — the oracle asserts their isolation).
3. WHEN the refund path executes (resolution=Cancel) THEN the refund and the audit row SHALL commit atomically — a rollback SHALL lose both.
4. WHEN the emission is added THEN the existing session-lifecycle tests and journeys (`test/workflows/classes/session-lifecycle*.test.ts`) SHALL still pass unchanged except for explicit audit-side-effect updates where a suite already counts audit rows.

#### Additional Details
- **Priority**: High · **Complexity**: Low · **Dependencies**: REQ-010

---

## Core Requirements: Completeness Verification (REQ-040..REQ-043)

### REQ-040: Audit-Completeness Journey (Cross-Actor)

**User Story:** As the release gate, I want one test that performs EVERY shipped admin action and verifies the matching row, so PRODUCTION_READINESS §1.3.1/§1.3.3 is proven, not asserted.

#### Acceptance Criteria
1. WHEN `test/workflows/admin/audit-completeness.journey.test.ts` (CREATE) runs THEN it SHALL perform every census `wired` row through the REAL service path against the real test DB (committed fixtures in `beforeAll`, tracked teardown, NO `runInRollback` — per `test/workflows/AGENTS.md`).
2. WHEN each action completes THEN the journey SHALL assert the minted row's FULL shape: `actorId` = acting admin's users.id, `actionType` ∈ expected set, `entityType` exact, `entityId` = affected row id, `details` parses as JSON and contains the contract keys, `createdAt` present.
3. WHEN two rows share a `createdAt` tick (same-tx batches) THEN ordering assertions SHALL use the `createdAt DESC, id DESC` tiebreak contract from `docs/admin/audit-trail.md` §2.
4. WHEN a second admin (observer) reads the trail through `AuditTrailService.listAuditTrail` THEN the producer's rows SHALL be visible to them and filtered reads (by actorId, actionType, entityType, entityId, from/to window) SHALL return exactly the minted subset.
5. WHEN a non-admin actor performs the same read THEN it SHALL be denied and SHALL mint ZERO rows.

#### Additional Details
- **Priority**: High · **Complexity**: High · **Dependencies**: REQ-010 (census), REQ-030/REQ-031 (remediations green) · **Assumptions**: session fixtures for the dispute step reuse the patterns of `test/workflows/classes/session-lifecycle.journey.test.ts`.

### REQ-041: Zero-Missing & Confusion Oracles

#### Acceptance Criteria
1. WHEN the journey finishes THEN a whole-table oracle SHALL assert: audit rows minted by the journey === number of successful census actions executed (whole-table count deltas, per the existing journey convention).
2. WHEN the producer history is read back THEN every executed action SHALL resolve to EXACTLY ONE audit row (1:1 mapping asserted by entity-type+entity-id+action-type anchors), and every minted row SHALL map back to exactly one executed action (no phantom rows).
3. WHEN a census action is executed twice (idempotency-unprotected mutations like `updatePlan`) THEN two rows SHALL exist and both SHALL be asserted (append-only honesty: repeats are logged, not deduped).
4. WHEN the suite ends THEN teardown SHALL delete journey audit rows via `withAuditDeleteTriggersSuspended` FIRST, and post-teardown probes SHALL restore the whole-table baseline (zero residue).

### REQ-042: Enum Coverage Accounting (PRODUCTION_READINESS §1.3.5)

#### Acceptance Criteria
1. WHEN the journey completes THEN every `audit_action_type` enum value SHALL be accounted for at least once: Create, Update, Delete, Override, Reactivate, Suspend via `wired` rows; Adjust via either a `wired` row or a census `deferred` row PLUS a System fixture lane (backdated insert, per the existing journey's fixture pattern) so the read surface exercises it.
2. WHEN a `deferred` enum value is fixture-covered THEN the census entry SHALL name the owning deferred ledger row so auditors can trace the gap.
3. IF a future enum value is added to `audit_action_type` THEN the census type SHALL fail to compile until the value is accounted (exhaustive-record typing, not a runtime list).

### REQ-043: Denial Isolation

#### Acceptance Criteria
1. WHEN any admin action is attempted by a non-admin actor (parent/student/teacher/anonymous) via the service layer THEN the call SHALL throw the canonical denial error AND mint ZERO audit rows (row-count oracle per step).
2. WHEN an admin action fails domain validation mid-flight (e.g. `setPlanActiveStatus` on an already-inactive plan) THEN ZERO audit rows SHALL be minted.
3. WHEN denial assertions are written THEN they SHALL use the try/catch helper + translated substrings (never `.rejects.toThrow()`, never raw keys).

---

## Quality & Process Requirements

### REQ-060: Test Coverage & Layering

#### Acceptance Criteria
1. WHEN remediation code is written THEN each file SHALL pass `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` (exit 0) before the next file is touched.
2. WHEN remediation code lands THEN coverage SHALL exist at: Tier 1 (100% branches of new lines), Tier 2 (boundaries — empty patch, unknown plan id, already-in-status), Tier 3 (chaos — concurrent mutations via `Promise.allSettled` do not corrupt the trail), Tier 4 (security — anon/non-admin, input-spread attempts).
3. WHEN journey tests run THEN they SHALL execute via `bun test test/workflows/...` (committed-transaction layer) and backend suites via `bun run test/scripts/run-test.ts` where applicable; raw `bun test` inside `backend/db/test/**` SHALL NOT be used.
4. WHEN the work is complete THEN the FULL affected suites SHALL pass: `backend/db/test/logic/audit/*`, `test/workflows/admin/*`, `test/workflows/classes/session-lifecycle*` (regression), plan-catalog service tests (existing + new).

### REQ-070: Security & Tenancy

#### Acceptance Criteria
1. WHEN `actorId` is sourced THEN it SHALL come from `ctx.user.id` / the verified actor id — never from mutation input (grep-assertable).
2. WHEN `details` payloads are composed THEN they SHALL contain field NAMES and enum values only — no emails, phone numbers, note free-text, or credentials (reviewed per the `AuditLogWriteContract` header rules).
3. WHEN new emission code is reviewed THEN BOLA/BOPLA/BFLA checks SHALL pass: caller-tx atomicity, admin re-assertion, no input spreads into the audit contract.

### REQ-080: Documentation & Knowledge Propagation

#### Acceptance Criteria
1. WHEN the journey is green THEN `docs/admin/audit-trail.md` SHALL gain a "Completeness Verification" section naming the census module, the drift test, and the journey as the §1.3 evidence.
2. WHEN propagation runs THEN the canonical emission contract in `docs/admin/user-management.md` §2.4 SHALL note REMEDIATED status for plan-catalog & dispute arbitration.
3. WHEN propagation completes THEN root `AGENTS.md` Important References and affected layer AGENTS.md files SHALL be updated only where a permanent rule emerged (census-before-admin-mutation rule), 1–2 lines each, with doc references — no implementation details.
4. WHEN all tasks finish THEN `outcome/` SHALL contain per-task outcome files plus `plan-review-R1.md` and the post-implementation review summary.

---

## Cross-Actor Workflow Scenarios (Journeys)

The feature's core IS a cross-actor workflow: a producer admin writes, a distinct observer admin reads, and non-admin actors are denied. One journey implements it: `test/workflows/admin/audit-completeness.journey.test.ts`.

### Actor Table

| Actor | Role | Can Do | Cannot Do |
|---|---|---|---|
| Producer Admin (A) | `UserRole.Admin`, governance-clean | Execute every census action; mint audit rows | Skip audit emission (enforced by test) |
| Observer Admin (B) | `UserRole.Admin` | Read producer's rows via `listAuditTrail` with all six filters | See other actors' private data (n/a on this surface); mutate the trail |
| Student / Parent / Teacher (denial cast) | non-admin | — | Execute any admin action; read the admin trail; mint rows |
| Anonymous | none | — | Execute admin actions (401-class denial) |

### Ordered Step List (journey spine)

1. **System** → provision cast in ONE committing transaction; capture `audit_logs` + `notifications` baselines → zero deltas.
2. **Admin A** → `adminCreateUser` path → row{Create, user, newId} minted.
3. **Admin A** → `adminUpdateUser` on same target → row{Update, user, targetId, changedFields}.
4. **Admin A** → `adminSetUserDeleted(delete)` → row{Delete, user, targetId}; then `(reactivate)` → row{Reactivate, user, targetId}.
5. **Admin A** → `adminCertifyTeacherColdStart` on a fresh teacher → row{Override, teacher, userId}.
6. **Admin A** → `adminBroadcastNotification` → row{Create, notification_broadcast, entityId=null}.
7. **Admin A** → `createPlan` → row{Create, plan, planId}  · `updatePlan` → row{Update, plan, planId, changedFields} · `setPlanActiveStatus(false)` → row{Suspend, plan, planId} · `setPlanActiveStatus(true)` → row{Reactivate, plan, planId}.
8. **Admin A** → set up disputed-session fixture → `resolveSessionDispute(Cancel)` → row{Override, session, sessionId} + refund atomically committed.
9. **System** → Adjust fixture lane: one backdated insert `{actionType: Adjust}` (census `deferred` row) with run-prefix marker; asserted visible in reads.
10. **Admin B (observer)** → reads full trail → producer rows visible, order = `createdAt DESC, id DESC`; filtered reads by actor/actionType/entityType/entityId/time-window each return exactly the expected subset.
11. **Student / Parent / Teacher / Anonymous** → attempt each admin action → denied, ZERO audit rows minted per attempt.
12. **System** → whole-table count oracle: deltas == successful actions count → no missing, no phantom. Teardown with `withAuditDeleteTriggersSuspended`; baselines restored.

### Cross-Actor EARS Criteria

1. WHEN Admin A performs any census action THEN the system SHALL mint exactly one `audit_logs` row observably readable by Admin B (REQ-040, REQ-041).
2. WHEN Admin B reads the trail THEN he SHALL observe the complete producer history in canonical newest-first order with deterministic id tiebreak (REQ-040.4).
3. WHEN a non-admin actor attempts any census action THEN the system SHALL deny it AND the trail SHALL remain byte-identical (REQ-043).
4. WHEN the journey completes THEN the count of minted rows SHALL equal the count of successful actions — no missing entries (REQ-041).

---

## UX / Navigation Requirements (MANDATORY section — resolved as N/A)

**Ruling: NO UX/Navigation surface in this ticket.** Verification is test-layer infrastructure; remediation threads an existing actor context through existing resolvers. No routes, pages, sidebars, tabs, or role-based rendering change. The existing admin `/audit` read view (documented in `docs/admin/audit-trail.md`) already renders all entity types and action types — a planned-schema assertion in the journey (step 10 reads) covers display-ability at the service boundary. No `frontend/` or `app/` files are created or modified.

## Non-Functional Requirements

### Performance
- Drift test = pure file scan (<1s). Journey adds one file to `test/workflows/admin/` — order-of-seconds locally, no production impact.
### Security
- All REQ-070 invariants; denied actors mint zero rows; no PII in `details`.
### Usability
- The census module is the human-readable audit catalog: a maintainer answers "is action X audited?" by reading one typed table.
### Reliability
- Zero-missing and confusion oracles are whole-table, making false greens structurally impossible (a dropped emission fails the count).

## Constraints and Assumptions

### Technical Constraints
- Bun + tsgo quality gates; `sub-loop.ts` per-file loop mandatory.
- Journey layer rules (`test/workflows/AGENTS.md`): no `runInRollback`, tracked teardown, no spies on audit writes (real rows observed through the real read service).
- Journey suites in `test/workflows/**` are NOT wrapped by `run-test.ts`; backend logic/repo tests route through `bun run test/scripts/run-test.ts`.

### Business Constraints
- PRODUCTION_READINESS §1.3 rows are launch-gate — the harness must be green for launch-checklist sign-off.

### Assumptions
- The prior emission foundation (`AuditService`, contract, triggers) is final — verified present.
- Admin session-governance read queries (`session-lifecycle.query.ts`) are read-only and need no audit rows (reads are not audited by design).

## Success Criteria

### Definition of Done
- [ ] Census module + drift test green; drift test fails when a seeded fake mutation is added (mutation check).
- [ ] Plan-catalog (3 mutations) and dispute arbitration audited; denial paths mint zero rows.
- [ ] Completeness journey green end-to-end on the real DB; all 7 enum values accounted.
- [ ] All pre-existing suites still green (audit immutability, existing admin journeys, session lifecycle).
- [ ] All four artifacts reviewed per Phase 1.5; R1 outcome recorded; checkboxes all `[x]`.

### Acceptance Metrics
- Census: 9 `wired` mutation rows + `deferred` rows each mapped to a ledger entry.
- Oracle: successful actions == minted rows (exact integer equality, every run).

## Glossary

- **Census**: typed catalog module enumerating shipped admin mutations and expected audit shapes.
- **Fixture lane**: System-actor backdated audit inserts covering enum values without shipped producers (existing journey pattern).
- **Row-count oracle**: whole-table count delta assertion (no spies) proving mint/no-mint.

## Cross-Layer Traceability Matrix

| REQ | Design (plan.md) | Tasks (tasks.md) | Test Surface |
|---|---|---|---|
| REQ-000, REQ-000.5 | §Outcome & Knowledge Transfer | 0.1 | `outcome/phase0-baseline.md` |
| REQ-010 Census | §Component 2 | 2.1 | catalog module itself |
| REQ-020 Drift | §Component 3 | 2.2 | `backend/db/test/logic/audit/audit-census-drift.test.ts` |
| REQ-030 Plan emission | §Component 4 | 3.1, 3.2 | service tests + journey step 7 |
| REQ-031 Dispute emission | §Component 5 | 4.1 | service tests + journey step 8 |
| REQ-040..043 Journey/oracles | §Component 6 + Journey Design | 5.1 | `test/workflows/admin/audit-completeness.journey.test.ts` |
| REQ-060 Test layering | §Testing Strategy | all (QL/TE subtasks) | per-file sub-loop |
| REQ-070 Security | §Security Considerations | per-task SEC subtask | journey step 11 + tier-4 tests |
| REQ-080 Docs | §Component 7 | 6.x | `docs/admin/audit-trail.md`, outcomes |

## Requirements Review Checklist (author self-certification)

- [x] All user roles identified (producer/observer/denied/system)
- [x] Normal, edge, and error cases covered (denials, repeats, same-tick order)
- [x] Requirements testable (each AC maps to an executable assertion)
- [x] No conflicting requirements
- [x] EARS format used consistently
- [x] Cross-actor workflow journeys captured (actor table + ordered steps + observer-perspective criteria)
