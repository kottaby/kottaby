# Requirements & Specification: Admin Session Governance (View/Filter/Reschedule/Cancel/Reassign/Join)

> **Sprint:** 3 · **Owner Stream:** Dev 3 · **Effort:** 5 SP
> **Target ticket:** (docs/planning/TICKETS.md §Sprint 3; decision refs FR-10.3, A.5)
> **Plan directory (verbatim):** `ai/plans/sprint_3/dev3-021-admin-session-governance`
> **Blocking dependency:** session lifecycle — shipped; canonical refs `docs/sessions/session-lifecycle.md`, `docs/specs/state-machine-invariants.md` INV-S1..S8.

---

## 1. Executive Summary & Problem Statement

- **Feature:** An admin-only governance surface over session entities: a filterable/paginated directory of ALL sessions and five admin operations — reschedule, cancel (releasing held funds), reassign teacher, and join a live (status='started') session as an observer — with every action audit-logged atomically in the same transaction (A.5).
- **Problem from the user perspective:**
  - **Admin** today can only view disputed sessions (arbitration surface) — there is NO directory of all sessions, no reschedule/cancel/reassign operator tooling, no live-observation hook.
  - **Student / Teacher** are affected by admin interventions; they must observe state changes consistently and receive notification waves on cancel/reschedule/reassign.
  - **Other roles** (student/teacher/parent/supervisor) must be denied byte-identically (BFLA 401/403 split per existing session resolvers).
- **Business value:** FR-10.3 (Session Governance) is a launch-critical admin capability ("the Admin can view all sessions ... reschedule, cancel, reassign teachers, join live sessions"). Prevents DB surgery for operational support.
- **Actors involved:** Admin (operator); Student & Teacher (side-effect receivers); Supervisor/Parent (denial probes); system (audit, notification, refund).
- **Explicit non-goals:**
  - NO dispute arbitration changes (owns resolveSessionDispute; disputed sessions are excluded from this ticket's mutation writes per D2).
  - NO schema changes (session table verified to already have startedAt/endedAt and no meeting/scheduled columns).
  - NO meeting-URL bridging for admin join (no meetingUrl column exists) — observation is audit + detail access only.
  - NO real-time WebSocket fan-out for admin dashboards (deferred).
  - NO financial payouts/withdrawals (separate stream).

---

## 2. Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation

- **REQ-001 (Error baseline & ledger):** WHEN implementation begins THEN the executor SHALL record baseline counts for `bun tsgo`, `bun run biome:check`, `bun oxlint`, and `bun run scripts/lint-service.ts --json --id baseline`, initialize `deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md`, and write `outcome/0.1-baseline-outcome.md` — distinguishing pre-existing errors from new ones is MANDATORY for every later quality gate.
- **REQ-002 (Reuse verify-then-claim):** WHEN domain work begins THEN the executor SHALL verify and REUSE — never reimplement — the following EXISTING artifacts (verified against the tree in Phase 0 with `path:line` anchors): the same-lane refund primitive `refundHeldLaneToProvenance` in `backend/services/classes/session-lifecycle.transitions.ts:207`; the guarded-transition patterns in `session-lifecycle.transitions.ts` and `session-lifecycle.guards.ts`; the admin BFLA gate `assertActorAdmin` in `backend/services/admin/admin-gate.helpers.ts`; the append-only audit writer `AuditService.createAuditLog(input, tx)` in `backend/services/admin/audit.service.ts:82`; the `AuditLogWriteContract` type in `backend/types/contracts/admin-audit.contract.types.ts`; enum values of `AuditActionType` (Override/Create/Update/Delete/Adjust/Suspend/Reactivate) in `backend/enum/audit/audit-action-type.enum.ts`; the `withTransaction` helper precedent; the `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }` conjunction in `backend/graphql/mutation/classes/session-lifecycle.mutation.ts` (`resolveSessionDispute`); the `SessionPothosObject` and `SessionPagePothosObject` in `backend/graphql/pothos/classes/session.pothos.ts`; the side-effect registration barrels `backend/graphql/query/classes/index.ts` and `backend/graphql/mutation/classes/index.ts`; the journey harness `test/workflows/AGENTS.md` + helpers barrel; the admin `disputes` page (`app/(dashboard)/disputes/page.tsx`) and its view assembly (`frontend/views/admin/disputes/AdminDisputesChrome.tsx`...); the `SessionListFilterPothosInput` in `backend/graphql/pothos/classes/session-filter-input.pothos.ts`.
- **REQ-003 (Compile-time i18n & enum imports):** All NEW user-facing copy SHALL flow through the compile-time system: resolvers/services use `ctx.t("errorsTranslations")`-style service access (following `getServerTranslations(locale)` one-arg precedent in `admin-gate.helpers.ts`); server components use `getTranslations(locale)` (one arg); client components use `useAppTranslation(<NamespaceHandle>)` with a `defineNamespace` handle const — string literals, `next-intl`, `getBackendTranslations`, `shared/messages/` are FORBIDDEN. All runtime enums MUST be VALUE imports (e.g. `AuditActionType.Override`), never raw strings.
- **REQ-004 (Canonical types discipline):** All new types SHALL live under `backend/types/classes/` (new file `admin-session-governance.types.ts`) with `{Input,ReturnType,...}` suffixes; imported via `@/backend/types` barrels. NO `.types.ts` under services/graphql layers; Pothos files import types only.
### 2.2 Core Feature Logic / Happy Paths

- **REQ-010 (Admin sessions directory query):** WHEN an admin calls `adminSessions(input)` THEN the system SHALL return a page of session rows supporting filters: `teacherUserId`, `studentUserId`, `type` (SessionType enum), `status` (SessionStatus enum), and `dateFrom`/`dateTo` over `createdAt` with half-open semantics (`>= dateFrom`, `< dateTo`, UTC), plus cursor/page pagination field name conventions already used by `listMyStudentSessions`; rows SHALL include `id`, `studentId`, `teacherId`, `type`, `status`, `createdAt`, `startedAt`, `endedAt`, `confirmationDeadline`, `durationMinutes`, `meetingSnapshotFieldsPresent`-free projection (no N+1; joins resolved by select only).
- **REQ-011 (Directory total count honesty):** WHEN `adminSessions` returns THEN it SHALL include an honest `total` computed by the SAME filtered query (count over filter), and pagination SHALL be accurate across pages (no next-button phantom empties).
- **REQ-012 (Admin session detail):** WHEN an admin requests the session detail view THEN the system SHALL return the row for ANY id regardless of lifecycle state (view is read-only); nonexistent id SHALL be a nullable result (null-not-error per admin conventions), NOT a thrown NOT_FOUND — preserving distinction between id-probing discovery errors on participant queries and admin browse reads.
- **REQ-020 (Reschedule):** WHEN an admin submits `adminRescheduleSession({ sessionId, startedAt, endedAt })` and the row is in `scheduled` or `started` state (the two states with mutable timing per the INV-S analysis and the session-lifecycle doc) THEN the system SHALL: (1) in a single transaction, guard-update the row `WHERE id=? AND (status='scheduled' OR status='started')`; (2) audit the action with `AuditActionType.Override`, payload `{from:{startedAt,endedAt},to:{...},...}`; (3) emit a `session.rescheduled` notification wave to student + teacher (same-lane publish-after-commit). Guard-update returning 0 rows SHALL throw a localized conflict (NO silent no-op).
- **REQ-021 (Reschedule validation):** WHEN the reschedule payload arrives THEN `startedAt < endedAt` SHALL be enforced, both MUST be ISO-8601/DateTime scalar values, and `startedAt` MUST NOT be in the past by more than a 5-minute grace window; violations SHALL produce localized validation errors BEFORE any read.
- **REQ-022 (Cancel with hold refund):** WHEN an admin calls `adminCancelSession({ sessionId, reason? })` and the session is in a pre-terminal state THEN the system SHALL, inside ONE transaction: flip status to `cancelled`, call the EXISTING same-lane refund primitive `refundHeldLaneToProvenance` for the recorded hold lane (exactly-once — the primitive's idempotent guard enforces this), tolerate a "no recorded lane" row as a no-refund no-op, write ONE audit row (`AuditActionType.Override`, entityType `session`, entityId sessionId, details JSON `{action:"cancel", reason}` ≤2000 chars), and commit; post-commit publishes a `session.cancelled` notification wave to student+teacher with recipient-locale copy.
- **REQ-023 (Cancel idempotency):** WHEN the same admin-cancel mutation is retried with the same `X-Idempotency-Key` THEN the second call SHALL be a no-op returning the same idempotent response shape (canonical claim via existing mechanism), and SHALL NOT write duplicate audit rows nor double-refund.
- **REQ-024 (Teacher reassignment):** WHEN an admin calls `adminReassignTeacher({ sessionId, newTeacherId })` and the session is in `scheduled` state (NOT `started`/`completed`/etc. — live/arbitration sessions are out of scope here) THEN the system SHALL in one transaction: assert the candidate row is a teacher with `is_approved = true` (echoing INV-S5 certification constraint at rescheduled-creation equivalent time), guard-update `teacher_id` only (no other column), audit with old/new teacher ids, and publish a `session.teacherReassigned` notification wave to student + old teacher + new teacher with recipient-locale copy. A candidate failing the certification check SHALL throw a localized FK-VIOLATION-class error and leave the row untouched.
- **REQ-025 (Teacher reassignment conflict policy):** WHEN a reassignment is attempted for a session already in `disputed` state THEN the surface SHALL refuse with a localized conflict error (dispute ownership belongs to arbitration). (Teacher reassignment on live row and teacher-driven proposal/accept flows are OUT OF SCOPE.)
- **REQ-026 (Join live session — observation only):** WHEN an admin calls `adminJoinSession({ sessionId })` for a session in `started` state THEN the system SHALL write EXACTLY ONE audit row (`AuditActionType.Override`, details `{action:"join_observe"}`) and return the SAME Session object the participant read path returns (data reuse), enabling the admin UI to render a read-only live view. No new columns are introduced for join semantics; NO meeting provider credential or token column is exposed to the resolver context.
- **REQ-027 (Join gating):** WHEN `adminJoinSession` is called on a session NOT in `started` state THEN it SHALL throw a localized conflict error and write ZERO audit rows.
- **REQ-028 (Directory badge "needsAttention"):** WHEN the directory returns rows THEN each row SHALL include a derived boolean computed server-side — `true` iff status is `disputed` OR the row is in `scheduled` state with `confirmationDeadline < now` — used only for badge styling, NOT authorization.
- **REQ-029 (Admin directory must remain read-only):** WHEN the directory query executes THEN it SHALL NOT mutate session state, audit-logs, or notification tables (no lazy side effects inside queries).
### 2.3 Security, Authorization & Tenancy

- **REQ-030 (BFLA + BOLA-mirror denial semantics):** WHEN any of the five admin mutations or the directory/detail queries are called THEN anonymous callers SHALL receive the localized error of `UnauthorizedError`/`401-unauthorized` (401-anonymous semantics) and authenticated non-admin roles SHALL receive the localized `forbidden` message with 403 — byte-identical to `resolveSessionDispute`'s split semantics. (`authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }` in Pothos; redundant service-side `assertActorAdmin(ctx.user.id, ctx.locale, tx)` invoked at the top of each service mutation.)
- **REQ-031 (BOPLA whitelist):** WHEN reschedule/cancel/reassign payloads are applied THEN ONLY the whitelisted columns (timing pair; teacher_id) SHALL be written. Any client-supplied extra field SHALL be ignored — never spread into Drizzle `set()`.
- **REQ-032 (Error confidentiality):** WHEN errors fire THEN no resolver or service SHALL expose internal SQL, stack traces, hashed secrets, or raw constraint details to the client; all localized text SHALL come from the i18n tree.
- **REQ-033 (Rate limiting posture):** The new mutations SHALL inherit the platform fail-open/fail-closed rate-limit posture (no bespoke limiter in this ticket — recorded as deferred item D-03).
### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040 (Transaction boundaries):** WHEN any of the four mutating operations executes THEN the guard UPDATE and ALL dependent writes (refund, audit) SHALL reside inside ONE `withTransaction` block, and every repository call SHALL receive the SAME `tx` — mixing `tx`/`db` paths is PROHIBITED.
- **REQ-041 (Guarded transitions):** WHEN mutating a session THEN the UPDATE SHALL carry a `WHERE status IN (...)` eligibility clause that makes concurrent same-target writes fail closed: a row taken out of the eligible set between read and write yields 0 affected rows → error.
- **REQ-042 (No TOCTOU on eligibility):** WHEN the reschedule/reassign validation runs THEN eligibility is re-asserted in the same guard UPDATE (no read-then-write gap); no `SELECT FOR UPDATE` is required on the session row because the state eligibility clause is the atomic gate; the TEACHER candidate read CAN tolerate a read-then-write gap because certification denial is enforced again at the guard-update by the FK assertion on `teachers.is_approved`. Via `createGraphQLContext` absence of automatic denial filter, service-side activity checks SHALL be applied via the existing service-side pattern.
- **REQ-043 (Append-only audit):** WHEN an audit row is written THEN it SHALL follow the append-only contract: NO update, NO upsert; `details` JSON is metadata only (≤2000 chars, no secrets, no verbatim end-user free text beyond admin-supplied `reason` truncated).
- **REQ-044 (Refund same-lane rule):** WHEN the cancel path releases funds THEN it SHALL use `refundHeldLaneToProvenance`, which routes funds to the SAME provenance lane as the hold — never crossing lanes (trial/subscription/wallet) — matching the boxed contract.

### 2.5 Validation & Localized Error Contracts

- **REQ-050 (DomainError subclasses):** Service SHALL throw `UnauthorizedError`, `ForbiddenError`, `NotFoundError`-equivalent (`SESSION_NOT_FOUND` for directory detail null → `null` result instead per REQ-012), and a validation-class error carrying a `code` extension; mapping to GraphQL SHALL propagate via `extensions.code` exactly per `docs/graphql/error-handling-contract.md`.
- **REQ-051 (Localized messages):** WHEN any error returns THEN its message SHALL come from the locale tree (`errorsTranslations` via `ctx.t("errorsTranslations")`/service-level `getServerTranslations(ctx.locale)`), ZERO hardcoded English strings.
### 2.6 GraphQL & Frontend Contracts

- **REQ-060 (SDL & Pothos registration):** New operations SHALL register as side-effect module imports via `backend/graphql/query/classes/index.ts` + `backend/graphql/mutation/classes/index.ts`: queries `adminSessions(filter: AdminSessionListFilterInput!, page: Int, pageSize: Int): SessionPage!` and `adminSession(id: ID!): Session`, mutations `adminRescheduleSession`, `adminCancelSession`, `adminReassignTeacher`, `adminJoinSession`. `authScopes` per REQ-030. Object types reuse `SessionPothosObject`/`SessionPagePothosObject` — NO sibling object types introduced.
- **REQ-061 (Input object reuse):** The filter input SHALL be a NEW `AdminSessionListFilterInput` Pothos input object in `session-filter-input.pothos.ts` (mirrors `SessionListFilterPothosInput` job-by-job; no extension of the participant input — distinct shape over filter keys, per architecture guidance that filter inputs are point-and-shoot scalars).
- **REQ-062 (DateTime scalar):** All date-typed fields and input args SHALL use the registered `DateTime` scalar from `backend/graphql/pothos/shared/scalar.pothos.ts`.
- **REQ-063 (Apollo documents):** Frontend documents SHALL live in `frontend/graphql/sharedDocuments/adminSessions.documents.ts` with `{X}QueryDocument`/`{X}MutationDocument` naming; EVERY object selection SHALL include `id` for cache normalization; hooks via `@apollo/client/react`; documents are NOT co-located with components.
- **REQ-064 (Frontend quality):** UI SHALL honor MUI v9 (`sx`-only styling), theme palette colors only, `*Outlined` icons, no hardcoded hex, keyboard-focusable dialogs, aria labels on all actions.

### 2.7 Test Coverage Requirements (4-Tier Framework)

- **REQ-070 (Tier 1 branch/statement):** Every new function SHALL reach 100% branch coverage; every guard clause and every eligibility matrix cell SHALL have a dedicated test.
- **REQ-071 (Tier 2 boundary):** Empty filter combos; `pageSize` bounds (1, 50); `dateFrom == dateTo` zero-width window; target ids that don't exist; candidate teachers not `is_approved`.
- **REQ-072 (Tier 3 chaos):** Concurrent cancel + confirm of the SAME session (Promise.allSettled — only one survives); retry-doubles of the idempotent cancel; transactions interrupted mid-flight (assert rollback restores pre-state — verified ONLY inside `runInRollback` with `tx` injected).
- **REQ-073 (Tier 4 security):** Non-admin role tokens against ALL seven new operations (expect 403 each, zero writes).
- **REQ-074 (Journey tests):** Cross-actor journeys SHALL be REAL-DB per `test/workflows/AGENTS.md`: fixtures committed in `beforeAll`, deleted in `afterAll` — NO `runInRollback` at the journey level; inside DB tests, repo/service unit tests DO use `runInRollback` and pass `tx`.
- **REQ-075 (No `.rejects.toThrow()` inside `runInRollback`):** Error assertions use the existing try/catch error-inspection helper.

### 2.8 Documentation & Knowledge Gates
- **REQ-080 (Canonical doc):** A new canonical doc SHALL be created under `docs/admin/` (`admin-session-governance.md`) covering: the state-eligibility matrix; single-transaction discipline; audit shape; notification waves; join semantics; join-read-vs-observe decision; i18n & roles; rate-limit posture; pointer to arbitration boundary; testing posture; deferred items.
- **REQ-081 (Nav registration):** The admin nav block in `frontend/views/dashboard/nav/navItems.ts` gains EXACTLY ONE entry `{ route: "/admin/session-governance", labelKey: "sessionGovernance", Icon: <appropriate MUI icon> }` placed adjacent to `/audit`.
### 2.9 Cross-Actor Workflow Scenarios (Journeys)

**Actor Table:**

| Actor | Role | Allowed on this surface | Explicitly denied |
|---|---|---|---|
| Admin | admin | directory, detail, reschedule, cancel, reassign, join | none on this surface |
| Student | student | NONE | all 7 operations (403) |
| Teacher | teacher | NONE | all 7 operations (403) |
| Parent | parent | NONE | all 7 operations (403) |
| Supervisor | supervisor | NONE | all 7 operations (403) |

**Journey W-1: Admin discovery, filter, and cancel with refund propagation**

1. `admin → adminSessions filter status='scheduled'` → directory returns matching rows (with `needsAttention` badge flags where applicable).
2. `admin → adminSession(id)` → read returns the row (no side effects).
3. `admin → adminCancelSession({sessionId, reason:"..."})` on a `scheduled` row with a recorded hold lane → single tx: status flips `cancelled`, same-lane refund posts, audit row written; post-commit: student + teacher notifications.
4. `student → mySessions` → sees `cancelled` and receives the recipient-locale notification.
5. `admin → adminSessions filter status='cancelled'` → same row appears under the new filter.

**Journey W-2: Reassign with certification gate (observer-perspective EARS)**

- WHEN admin reassigns session S from teacher T1 to certified teacher T2 THEN the session row SHALL have `teacherId = T2.id` AND student SHALL observe the new teacher via `myStudentSessions` AND BOTH teachers SHALL receive localized notifications.
- IF candidate teacher lacks `is_approved=true` THEN the mutation SHALL fail localized AND the row SHALL be byte-identical to its pre-call state.

**Journey W-3: Join as observer**

- WHEN admin calls join on a `started` session THEN EXACTLY ONE audit row exists with `{action:"join_observe"}` and the returned session is byte-equivalent to participant read.
- WHEN admin calls join on a non-`started` session THEN zero audit rows and a localized conflict error.

---

## 3. System Decisions & State-Machine Invariants Alignment

- **A.5 (`audit_logs`)** — full conformance: every mutation writes exactly one row via `AuditService.createAuditLog`; reads produce zero rows.
- **INV-S1..S5** — respected: no new states introduced; `cancelled` remains terminal (INV-S2); reassignment honors INV-S5 (certified-teacher invariant) at mutation time; status changes are strictly per the eligibility matrix in plan §3.
- **INV-S6..S8** — no impact (live-session presence, completed-only reports, homework) — no behavior change on those axes.
- **Workflow 05 (`docs/workflows/05-admin-governance-override.md`)** — this ticket implements the session-arbitration complement to the disputes surface; both roads stay independent: arbitration only sees disputed rows, governance directory sees every row.
- **`docs/sessions/session-lifecycle.md`** — the four-phase creation invariant is untouched; this ticket is a consumer surface over the lifecycle writes.
- **`docs/graphql/error-handling-contract.md`** — `DomainError` → `extensions.code` mapping follows the registry verbatim; no new code values without registry entry.

---

## 4. Cross-Layer Traceability Matrix

| REQ | Invariant/Decision | Services | Resolvers | UI | Tests |
|---|---|---|---|---|---|
| REQ-001 | plan hygiene | — | — | — | outcome/0.1 |
| REQ-002..004 | D-01 reuse, barrelling | services/classes/admin-session-governance | — | — | tsgo |
| REQ-010..012 | FR-10.3 view/filter | SessionAdminGovernanceService.list/detail | adminSessions/adminSession | Directory+Drawer | Tier1..4 |
| REQ-020..027 | state guards, A.5 | reschedule/cancel/reassign/join svc fns | 4 mutations | dialogs, join action | Tier1..4 |
| REQ-030..033 | BFLA/BOPLA/error confidentiality | assertActorAdmin, whitelist mapping | authScopes | — | Tier4 |
| REQ-040..044 | atomicity, INV-S2 | withTransaction + refunds | — | — | Tx + chaos |
| REQ-050..051 | graphql error contract | error class mapping | extensions.code | error UI | tests |
| REQ-060..064 | D-02 Pothos, D-04 frontend | — | query/mutation registration | Apollo docs | codegen, tsgo |
| REQ-070..075 | 4-tier tests | — | — | — | test suite |
| REQ-080,081 | knowledge gates | — | — | nav | doc + nav |
