# Technical Design: Audit Trail Completeness Verification

## Document Information

- **Feature**: Audit Trail Completeness Verification (Sprint 4, Dev 2, 3 SP)
- **Spec**: `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/specs.md`
- **Plan Directory**: `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification`
- **Outcome Directory**: `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome`
- **Version**: 1.0 · **Date**: 2026-09-05

---

## Overview

Turn "every admin action is audited" from belief into a permanently enforced property. Three mechanisms: (1) a **machine-readable census** of all shipped admin mutations + expected audit shape; (2) **gap remediation** on the two verified unaudited surfaces (plan-catalog ×3 mutations, session-dispute arbitration) through the existing `AuditService.createAuditLog(tx)` contract at its pre-built seams; (3) **verification harness** — a static anti-drift test (census ↔ admin-gated mutation bijection) plus a cross-actor journey that performs every census action against the real stack and proves row shape, chronology, and zero-missing counts.

### Design Goals
- Completeness is computable: one typed catalog, one bijection scan, one journey oracle.
- Zero drift: shipping an unaudited admin mutation breaks CI.
- Remediation is surgical: existing seams, existing writer, existing gates — no schema or contract change.

### Key Design Decisions

#### Decision: Census lives in the test layer, not production code
**Context:** Where should the canonical admin-action catalog live?
**Options:** (a) production registry under `backend/services/admin/` — Pros: importable by code / Cons: it is not consumed at runtime; pollutes production surface. (b) test-layer module `test/workflows/admin/audit-completeness.catalog.ts` — Pros: verification-scope truth, free of prod coupling / Cons: duplicated knowledge if a runtime consumer ever appears.
**Decision:** (b). Revisit only when a runtime consumer exists.
**Rationale:** This ticket is verification infrastructure; YAGNI on runtime registries.

#### Decision: Remediate the two confirmed gaps in-scope rather than defer
**Context:** Census authoring proved plan-catalog (G-06) and dispute arbitration (G-07) emit zero audit rows.
**Options:** (a) defer both to new tickets; (b) fix here.
**Decision:** (b). Both seams are pre-built (`// audit hook seam` markers; `resolveSessionDispute` already has `withTransaction` + adminId + admin gate). Deferring would make the journey red at birth and violate the ticket's own definition of completeness.
**Rationale:** 3 SP ticket, seams designed for exactly this fill-in.

#### Decision: `setPlanActiveStatus` maps deactivate→Suspend, activate→Reactivate
**Context:** No dedicated plan-status verb exists in `audit_action_type`.
**Options:** (a) Update for both directions; (b) Suspend/Reactivate pair.
**Decision:** (b) — semantically exact (activation restores availability; suspension removes it) and satisfies PRODUCTION_READINESS §1.3.5 enum coverage without the unshipped categories.

#### Decision: Extend the immutability test's corpus-walk pattern as a NEW suite
**Context:** `audit-immutability.test.ts` already walks the backend production corpus.
**Options:** (a) add census assertions into that suite; (b) new sibling suite sharing only the walk pattern.
**Decision:** (b) `backend/db/test/logic/audit/audit-census-drift.test.ts`. The immutability suite locks the single-writer property; conflating concerns would blur both.

### UX/Navigation Specification (REQUIRED — resolved as N/A)

No routes, sidebar entries, tabs, screens, or role-rendering changes. No `app/` or `frontend/` files. The admin `/audit` frontend consumes the unchanged `adminAuditLogs` query; the journey proves display-ability at the service boundary (REQ-040.4). New census rows minted by remediation render through the existing read surface without frontend change (entity types `plan`, `session` flow through the existing generic renderer; row fields are the fixed seven).

### Concurrency & Race Condition Assessment (CONDITIONAL — included: shared mutable state = `audit_logs` append path)

| Risk | Assessment | Mitigation |
|---|---|---|
| Concurrent admin mutations minting rows | Rows are independent INSERTs; no uniqueness coupling | None needed — append-only is race-free by construction |
| Same-timestamp batch ordering | Two rows in one tx can share `created_at` | Canonical tiebreak `createdAt DESC, id DESC` (`docs/admin/audit-trail.md` §2); journey asserts with ids |
| Audit insert rolled back mid-mutation | Desirable — trail must not outlive the mutation | Emission inside caller tx; REQ-030.5/REQ-031.3 |
| Census drift scan racing future edits | Static CI-time scan | Not runtime — N/A |

### Cross-Actor Journey Design (REQUIRED — journey defined in specs)

**Shared-entity state machine:** `audit_logs` rows have no state machine (append-only inserts; no transitions). The machines that PRODUCE rows are covered by their owning journeys (user lifecycle, cold-start, broadcast, session dispute). The completeness journey's shared entity is the trail itself.

**Side-Effect Matrix (per census action):**

| Census action | Rows written | Audit row | Notifications | Idempotency |
|---|---|---|---|---|
| adminCreateUser | users + role child | Create/user | welcome (engine) | none (create) |
| adminUpdateUser | users gov fields | Update/user (changedFields) | none | none |
| adminSetUserDeleted | users governance flag | Delete or Reactivate/user | none | weak — repeats log |
| adminCertifyTeacherColdStart | teacher elevate + applicant finalize | Override/teacher | EvaluationResult | single-writer guard |
| adminBroadcastNotification | broadcast + fan-out rows | Create/notification_broadcast | cohort fan-out | engine idempotency |
| createPlan | plans insert | Create/plan | none | 23505→Conflict |
| updatePlan | plans update | Update/plan (changedFields) | none | none |
| setPlanActiveStatus | plans is_active flip | Suspend or Reactivate/plan | none | guarded once |
| resolveSessionDispute | session resolve (+ wallet refund on Cancel) | Override/session | none | guarded once (disputed-state guard) |
| Adjust (fixture, deferred producer) | — | Adjust/(fixture entity) | none | System-lane insert |

**Cross-Actor Visibility:** producer rows readable by any admin observer through `listAuditTrail`; non-admin actors receive FORBIDDEN/UNAUTHORIZED before the service and mint nothing; rows are never readable by non-admin participants.

### Outcome & Knowledge Transfer Protocol

- BEFORE any task: executing agent reads ALL of `ai/plans/sprint_4/dev2-021-audit-trail-completeness-verification/outcome/`.
- AFTER each task: write `outcome/<task-id>-outcome.md`; flip the `tasks.md` checkbox.
- AGENTS.md propagation restricted to permanent rules: census-before-admin-mutation. No implementation detail migration.

### Drizzle SQL Template Anti-Patterns (CRITICAL reminder for implementers)

- No `.update(auditLogs)` / `.delete(auditLogs)` anywhere (trigger would also block; static suite scans for it).
- `entityId` accepts `null` — never coerced to 0.
- Fixture-lane inserts use `db.insert(auditLogs).values({...})` with the raw enum string coerced per the existing journey helper (`rawActionType`).
- No string-built SQL for reads; the read path stays inside `AuditTrailService`.

---

## Architecture

### System Context

```text
Admin (via GraphQL) ──► mutation resolvers ──► services ──► AuditService.createAuditLog(tx) ──► audit_logs
                                                          └──► domain writes (users/plans/sessions)
Census module (test layer) ◄── consumed by ── static drift test + journey
adminAuditLogs query (AuditTrailService.listAuditTrail) ◄── journey observer reads
```

### High-Level Flow
1. Census authored → drift test binds it to the shipped GraphQL admin surface.
2. Remediation: plan-catalog + dispute arbitration emit via existing seams.
3. Journey executes every wired census row; oracles count exactly.
4. Observers read through the canonical read service; denials mint nothing.
5. Documentation + outcome propagation.

### Technology Stack
Bun runtime/tests, tsgo, Drizzle ORM (PostgreSQL), Pothos GraphQL (unchanged surface), MUI — NOT used (no UI).

---

## Components and Interfaces

### Component 1: `AuditService` / `AuditLogWriteContract` (CONSUMED, unchanged)
- `backend/services/admin/audit.service.ts` — insert-only writer, details truncation ≤2000, caller-tx.
- `backend/types/contracts/admin-audit.contract.types.ts:22` — `AuditLogWriteContract`. No modifications.

### Component 2: Census module (CREATE) — `test/workflows/admin/audit-completeness.catalog.ts`

```ts
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";

export interface AdminActionCensusEntry {
  /** GraphQL mutation field name, e.g. "adminCreateUser". */
  readonly mutationField: string;
  /** Service entry for reference/documentation, e.g. "AdminUserManagementService.createUser". */
  readonly serviceEntry: string;
  /** Expected action types (a mutation may map to >1, e.g. setUserDeleted → Delete|Reactivate). */
  readonly expectedActionTypes: readonly AuditActionType[];
  readonly expectedEntityType: string;
  /** wired = journey must execute it; deferred = no shipped producer (ledger row required). */
  readonly kind: "wired" | "deferred";
  /** deferred rows must name their deferred-items ledger id (e.g. "D-001"). */
  readonly deferredRef?: string;
}

export const ADMIN_ACTION_CENSUS: readonly AdminActionCensusEntry[] = [
  { mutationField: "adminCreateUser",              serviceEntry: "AdminUserManagementService.createUser",                 expectedActionTypes: [AuditActionType.Create],            expectedEntityType: "user",                    kind: "wired" },
  { mutationField: "adminUpdateUser",              serviceEntry: "AdminUserManagementService.updateUser",                 expectedActionTypes: [AuditActionType.Update],            expectedEntityType: "user",                    kind: "wired" },
  { mutationField: "adminSetUserDeleted",          serviceEntry: "AdminUserManagementService.setUserDeleted",             expectedActionTypes: [AuditActionType.Delete, AuditActionType.Reactivate], expectedEntityType: "user", kind: "wired" },
  { mutationField: "adminCertifyTeacherColdStart", serviceEntry: "ColdStartCertificationService.certifyTeacherColdStart", expectedActionTypes: [AuditActionType.Override],          expectedEntityType: "teacher",                 kind: "wired" },
  { mutationField: "adminBroadcastNotification",   serviceEntry: "AdminBroadcastService.broadcast",                       expectedActionTypes: [AuditActionType.Create],            expectedEntityType: "notification_broadcast",  kind: "wired" },
  { mutationField: "createPlan",                   serviceEntry: "PlanCatalogService.createPlan",                         expectedActionTypes: [AuditActionType.Create],            expectedEntityType: "plan",                    kind: "wired" },
  { mutationField: "updatePlan",                   serviceEntry: "PlanCatalogService.updatePlan",                         expectedActionTypes: [AuditActionType.Update],            expectedEntityType: "plan",                    kind: "wired" },
  { mutationField: "setPlanActiveStatus",          serviceEntry: "PlanCatalogService.setPlanActiveStatus",                expectedActionTypes: [AuditActionType.Suspend, AuditActionType.Reactivate], expectedEntityType: "plan", kind: "wired" },
  { mutationField: "resolveSessionDispute",        serviceEntry: "SessionLifecycleService.resolveSessionDispute",         expectedActionTypes: [AuditActionType.Override],          expectedEntityType: "session",                 kind: "wired" },
  // Deferred producers (ledger-backed):
  { mutationField: "(future) adminExtendSubscription / adminCancelSubscription", serviceEntry: "subscription management surface — unshipped", expectedActionTypes: [AuditActionType.Update, AuditActionType.Suspend], expectedEntityType: "subscription", kind: "deferred", deferredRef: "D-001" },
  { mutationField: "(future) adminAdjustWallet / withdrawal approval",           serviceEntry: "financial adjustment surface — unshipped",    expectedActionTypes: [AuditActionType.Adjust],                                                    expectedEntityType: "wallet", kind: "deferred", deferredRef: "D-002" },
  { mutationField: "(future) adminResetUserPassword",                            serviceEntry: "credential administration — unshipped",         expectedActionTypes: [AuditActionType.Override],                                                  expectedEntityType: "user", kind: "deferred", deferredRef: "D-003" },
  { mutationField: "(future) adminRescheduleSession / adminReassignSession",     serviceEntry: "session governance extensions — unshipped",   expectedActionTypes: [AuditActionType.Update, AuditActionType.Override],                         expectedEntityType: "session", kind: "deferred", deferredRef: "D-004" },
];
```

Plus a typed exhaustiveness map `ACTION_TYPE_COVERAGE: Record<AuditActionType, "wired" | "fixture" | "deferred">` so a future enum member fails compile.

### Component 3: Anti-drift test (CREATE) — `backend/db/test/logic/audit/audit-census-drift.test.ts`
- Reuses the corpus-walk pattern (`listSourceFiles` over `backend/graphql/mutation/**/*.ts`).
- Regex extracts `mutationField("<name>"` and nearby `UserRole.Admin` within the same field block; ALSO matches `$all` conjunction blocks.
- Asserts: extracted admin-mutation set ≡ set of census `wired` mutationFields (bijection both directions); corpus sanity ≥9; every census `wired` row has distinct field names; every `deferred` row names an existing `D-0xx` ledger row (string check against `deferred-items.md`).
- Intentionally NOT in the immutability suite (single-concern files).

### Component 4: Plan-catalog remediation (MODIFY) — `backend/services/billing/plan-catalog.service.ts` + `backend/graphql/mutation/plan-catalog.mutation.ts`

New signatures (matching the file-local convention from `createUser(input, actorId, locale, outerTx?)` at `user-management.service.ts:265-269`):
```ts
createPlan(input: PlanSubmitInput, actorId: number, locale?: string, tx?: DBTransaction): Promise<PlanReturnType>
updatePlan(id: number, patch: PlanUpdateInput, actorId: number, locale?: string, tx?: DBTransaction): Promise<PlanReturnType>
setPlanActiveStatus(id: number, isActive: boolean, actorId: number, locale?: string, tx?: DBTransaction): Promise<PlanReturnType>
```
Flow per method: `assertActorAdmin(actorId, locale, tx)` first → existing body → on success, inside the same transaction, `AuditService.createAuditLog(...)` with the shapes in REQ-030 → return. Mutations thread `ctx.user.id` (resolver asserts `ctx.user` non-null as in session-lifecycle mutations). The three seam comments are replaced by the emission. Reuses a local `buildPlanAuditContract` helper (mirrors `user-management.helpers.ts:334` pattern).

### Component 5: Dispute remediation (MODIFY) — `backend/services/classes/session-lifecycle.service.ts`
Inside `resolveSessionDispute`'s `withTransaction` block, after the guarded update succeeds (and after the refund slice when Cancel): one `AuditService.createAuditLog({ actorId: adminId, actionType: AuditActionType.Override, entityType: "session", entityId: sessionId, details: JSON.stringify({ resolution, notePresent: resolutionNote !== null }) }, tx)`. AdminId/gate already exist — zero signature change.

### Component 6: Completeness journey (CREATE) — `test/workflows/admin/audit-completeness.journey.test.ts`
Per specs step-list: cast via `provisionAdminActor` ×2 + denial cast; steps 1–12; whole-table oracles (`db.$count(auditLogs)`), `rawActionType` anchor inserts for the Adjust fixture lane via `withAuditDeleteTriggersSuspended` teardown (pattern proven in `audit-trail.journey.test.ts:1-647`); observer reads via `AuditTrailService.listAuditTrail` with every filter axis; denial steps per non-admin actor; final zero-residue probes.

### Component 7: Documentation (MODIFY)
- `docs/admin/audit-trail.md`: new "Completeness Verification" section (census, drift test, journey = PRODUCTION_READINESS §1.3 evidence).
- `docs/admin/user-management.md` §2.4: note the two remediated surfaces now emitting per contract.
- Root `AGENTS.md` Important References: keep existing audit-trail entry; add one line only if a NEW canonical doc is created (none planned — propagation lands in the existing doc).

## API Contracts (GraphQL Surface — schema unchanged)

No SDL changes: zero new types/fields/args; codegen (`bun codegen`) is NOT required. The surface touched is four existing mutations' **resolvers** (internal wiring only):

| Mutation | authScopes (unchanged) | Args (unchanged) | Returns | Change |
|---|---|---|---|---|
| `createPlan` | `role: [UserRole.Admin]` | `input: CreatePlanInput!` | `Plan!` | resolver threads `ctx.user.id` |
| `updatePlan` | `role: [UserRole.Admin]` | `id: ID!, input: UpdatePlanInput!` | `Plan!` | resolver threads `ctx.user.id` |
| `setPlanActiveStatus` | `role: [UserRole.Admin]` | `id: ID!, isActive: Boolean!` | `Plan!` | resolver threads `ctx.user.id` |
| `resolveSessionDispute` | `$all: { authenticated, role: [UserRole.Admin] }` | `id, resolution, note` | `Session!` | service-internal audit insert only; resolver untouched |

**Permission matrix** (post-change behavior, all enforced pre-DB by scope gate + service gate):

| Actor | createPlan/updatePlan/setPlanActiveStatus | resolveSessionDispute | Audit minted on denial |
|---|---|---|---|
| Anon | UNAUTHORIZED | UNAUTHORIZED | no |
| Student/Parent/Teacher | FORBIDDEN | FORBIDDEN | no |
| Admin (governed) | FORBIDDEN (assertActorAdmin / governance gate) | FORBIDDEN (`assertAdminGovernanceClean`) | no |
| Admin (clean) | allowed → 1 audit row on success | allowed → 1 audit row on success | n/a |

## Data Models

No schema changes. `audit_logs` shape (verified): `id` identity PK; `actor_id` int FK→users (restrict); `action_type` pgEnum(7); `entity_type` varchar(100); `entity_id` int NULL; `details` varchar(2000); `created_at` timestamp defaultNow. New `details` payloads:

| Action | details JSON |
|---|---|
| createPlan | `{ "title", "sessionCount", "price", "currency", "intervalDays" }` |
| updatePlan | `{ "changedFields": string[] }` |
| setPlanActiveStatus | `{ "isActive": boolean }` |
| resolveSessionDispute | `{ "resolution": "cancel"|"complete", "notePresent": boolean }` |

## Security Considerations
- actorId never from input (REQ-070.1); admin re-assertion pre-tx (assertActorAdmin).
- details excludes notes/PII; truncation safety inherited from AuditService.
- BFLA: authScopes unchanged on mutations; service-level gate added = defense in depth.
- Immutability unaffected: remediation inserts only.

## Error Handling
- Plan/catalog domain errors unchanged (PLAN_NOT_FOUND, conflicts, validation); audit failure → throws → whole mutation rolls back (zero partial trail).
- Dispute arbitration error taxonomy unchanged (VALIDATION on bad state, conflict on miss via `rejectTransitionMiss`).

## Performance Considerations
- One extra INSERT per audited mutation — negligible; no new indexes (existing entity/actor indexes cover read patterns).

## Testing Strategy
- **Drift test**: logic test (`backend/db/test/logic/audit/`), runs under `bun run test/scripts/run-test.ts`.
- **Service tests**: plan-catalog new/updated tests (success mints row; denials mint zero; rollback atomicity via forced post-emission failure — simulate by catching and re-throwing through a tx that aborts, or by triggering a post-emission constraint failure path where one exists; otherwise assert emission order & tx identity via a failing stub). Keep using the layer's existing conventions (mocked repositories optional, real `AuditService` against tx where integration-style suites already exist).
- **Journey**: `bun test test/workflows/admin/audit-completeness.journey.test.ts`.
- **Regression**: existing audit suites + session workflow journeys.

## Migration and Compatibility
- No migrations. Breaking change ONLY to internal service signatures (plan-catalog); GraphQL schema unchanged → no codegen needed. Callers updated in the same diff.

## Design Review Checklist (author self-certification)
- [x] All requirements addressed (traceability in specs.md)
- [x] Component responsibilities defined with exact paths
- [x] Interfaces/signatures concrete
- [x] Error handling covers expected failures (denials, conflict, rollback)
- [x] Security addressed (actor sourcing, BOPLA, PII exclusion)
- [x] UX/Navigation resolved (explicit N/A + rationale)
- [x] Cross-actor journey design present (state machine N/A ruling + side-effect matrix + visibility)
