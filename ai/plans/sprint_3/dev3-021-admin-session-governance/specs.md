# DEV3-021 — Admin Session Governance (View/Filter/Reschedule/Cancel/Reassign/Join) — specs.md

**Plan directory**: `ai/plans/sprint_3/dev3-021-admin-session-governance/`
**Ticket**: DEV3-021 (docs/planning/TICKETS.md) — Sprint 3, Dev 3, 5 SP, Blocked By DEV3-004.
**Decision Refs**: FR-10.3, A.5 (audit_logs).
**Consumes**: DEV3-004 session lifecycle (`docs/sessions/session-lifecycle.md`), DEV3-017 audit trail (`docs/admin/audit-trail.md`), DEV3-018 cold-start certification.

---

## 1. Executive Summary & Problem Statement

Admins currently have read access to disputed sessions only (`listAdminDisputedSessions`, DEV3-022). There is **no admin surface** to (a) list/filter ALL sessions, (b) reschedule a session, (c) cancel any session with refund of held funds, (d) reassign the teacher, or (e) join a live session as an observer. Every governance action must be audit-logged (A.5) inside the SAME transaction as the state change.

### Personas & Workflows

| Actor | Workflow |
|---|---|
| **Admin** (only actor) | Lists/filters sessions; opens a session detail; reschedules it; cancels it (funds released); reassigns a certified teacher; joins a live (`started`) session as observer. |
| **Student / Teacher** (side-effect receivers) | See updated timing / cancellation refund / new teacher via session feeds; receive notification waves per `docs/notifications/session-request-notifications.md`. |

### Business Value
Unblocks operational intervention without DB surgery; provides FR-10.3 admin ergonomics with full auditability.

### Non-Goals
- Payments/payouts settlement (DEV3-005 surface; we only reverse the HOLD lane).
- Dispute arbitration (DEV3-022) — sessions in `disputed` state are OUT of scope for reschedule/reassign (join-observe allowed).
- Real-time WebSocket push beyond the existing notification engine (deferred, §Deferred).
- Meeting URL storage schema change (no `meeting_url` column exists — join returns the SSR-fetchable session detail; live-URL exposure is deferred).

---

## 2. Acceptance Criteria (EARS)

### 2.1 Baseline & Foundational Preparation

- **REQ-001** WHEN implementation starts THEN the repo SHALL pass a baseline `bun quality-gate` (or pre-existing failures SHALL be recorded in `deferred-items.md` before any edit).
- **REQ-002** WHEN any user-facing copy or error message is authored THEN it SHALL use the compile-time i18n system in `shared/locale/` (`getTranslations(locale)` single-arg on server, `useAppTranslation(NamespaceHandle)` on client, `ctx.t("namespace")` in resolvers) and SHALL import enum VALUES from `backend/enum/` barrels, never string literals.
- **REQ-003** WHEN any type is needed THEN it SHALL be declared in `backend/types/<domain>/` (`AdminSessionListFilterInput`, `AdminSessionPage`, `AdminSessionRescheduleInput`, `AdminSessionReassignInput`, `AdminSessionJoinResult`) and imported by services/resolvers; no local `.types.ts` in service or Pothos layers.

### 2.2 Core Feature Logic (Happy Paths)

- **REQ-010** WHEN an admin calls `adminSessions(filter, page, pageSize)` THEN the system SHALL return ONLY admin-visible rows with `totalCount` and `hasMore`, filtering by `teacherId?`, `studentId?`, `type?`, `status?`, `dateFrom`/`dateTo` (half-open `>= from` / `< to` on `created_at` UTC per audit-trail convention).
- **REQ-011** WHEN the admin-shape query runs THEN it SHALL be executed in a single Drizzle round-trip (CTE/aggregate…no N+1) and include `id` plus student/teacher display names.
- **REQ-012** WHEN `adminSession(sessionId)` is called THEN the system SHALL return full session detail or an admin-safe `null` (null-not-error not-found).
- **REQ-013** WHEN an admin calls `adminRescheduleSession(sessionId, startedAt, endedAt?)` on a `scheduled`/`started` session and `startedAt < endedAt` (when provided) THEN the system SHALL update `started_at`/`ended_at` in ONE guarded transaction AND write an `audit_logs` row (action `Override`) atomically.
- **REQ-014** WHEN an admin calls `adminCancelSession(sessionId, reason)` on a non-terminal session (`scheduled`, `started`, or `ending`) THEN `session.status` SHALL become `cancelled`, held-side funds SHALL be refunded by calling the EXISTING `refundHeldLaneToProvenance` (same-lane refund, SessionLifecycleService) inside the same transaction, and an audit row SHALL be written.
- **REQ-015** WHEN the session is already `cancelled`, `completed`, `ended`, `expired`, or `disputed`-settled THEN `adminCancelSession` SHALL throw `SessionStateError` (i18n, `extensions.code="SESSION_INVALID_STATE"`).
- **REQ-016** WHEN an admin calls `adminReassignTeacher(sessionId, newTeacherId)` THEN the system SHALL load the session FOR UPDATE, assert the new teacher exists AND `is_approved=true stall-dangerous check via TeacherRepository (certified teacher per DEV3-018 ruling), update `session.teacher_id` in the same transaction, and write an audit row recording previous→new teacher ids.
- **REQ-017** WHEN `adminReassignTeacher` targets a `completed`/`cancelled`/`ended`/`expired` session or an unapproved/missing teacher THEN it SHALL throw `ValidationError`/`SessionStateError` with localized message and make ZERO writes (including ZERO audit rows — JR-C-1 convention).
- **REQ-018** WHEN an admin calls `adminJoinSession(sessionId)` and `session.status == 'started'` THEN the system SHALL return an `AdminSessionJoinResult { session, joinedAt }`, take NO write on the session row, and write ONE audit row (`Override`, details `{action:"joined_observation"}`) — observe-only.
- **REQ-019** WHEN `adminJoinSession` targets a non-`started` session THEN it SHALL throw `SessionStateError` and write NO audit row.
- **REQ-020** WHEN a successfully rescheduled/cancelled/reassigned session has student/teacher recipients THEN the existing notification emitters of `SessionRequestNotificationService` SHALL be invoked with the recipient-locale copied payloads, publishing after commit (persist-first/push-second per `docs/notifications/realtime-engine.md`).

### 2.3 Security, Authorization & Tenancy

- **REQ-030** WHEN any `admin*` session operation is invoked THEN the Pothos `authScopes` SHALL require admin (same scope scheme as DEV3-016 admin mutations; service layer SHALL assert `ctx.user.role === ADMIN` as layered defense).
- **REQ-031** (BFLA) WHEN a non-admin (student/teacher/parent/supervisor) calls any `adminSession*` field THEN the resolver SHALL fail with `FORBIDDEN` and ZERO service work AND ZERO audit rows.
- **REQ-032** (BOLA/BOPLA) WHEN persisting reschedule/reassign payloads THEN only whitelisted columns (`started_at`, `ended_at`, `teacher_id`) SHALL be touched — explicit Drizzle `.set({...})`; no `...input` spreads.
- **REQ-033** WHEN errors surface to the client THEN they SHALL be `DomainError` subclasses mapped to `extensions.code` per `docs/graphql/error-handling-contract.md`; stack traces and raw SQL SHALL never leave the server.

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040** WHEN cancel executes THEN the status guard-UPDATE, `refundHeldLaneToProvenance`, and audit insert SHALL share ONE transaction (`tx` propagated to every repo call); failure of any step SHALL roll back all.
- **REQ-041** WHEN reschedule or reassign executes THEN the session row SHALL be locked via SessionRepository (SELECT … FOR UPDATE semantics used by existing guarded transitions) BEFORE mutation, preventing TOCTOU races with teacher-driven confirm/start/complete.
- **REQ-042** WHEN a concurrent participant transition already moved the session out of an admin-actionable state THEN the guarded UPDATE … WHERE status IN (...) SHALL affect 0 rows and the service SHALL throw `SessionStateError` (INV-S guarded-transition pattern).
- **REQ-043** WHEN funds are released on cancel THEN the refund SHALL use the SAME lane the hold was taken from (hold-as-debit + same-lane refund, per DEV3-004 §refundHeldLaneToProvenance).
- **REQ-044** WHEN the DB schema needs the new surface THEN NO new columns are required BY THIS TICKET for reschedule (existing `started_at`/`ended_at` reuse decision, see plan §2); `regenerate-sessions-uid-idx` partial index on non-terminal statuses SHALL remain valid because cancel retains a non-null `status` column.

### 2.5 Validation & Localized Error Contracts

- **REQ-050** WHEN any admin mutation receives invalid input THEN `ValidationError` SHALL be thrown BEFORE touching the DB, message via `ctx.t("errors")` / new `sessionGovernance` error keys; `extensions.code` values: `VALIDATION_FAILED`, `SESSION_INVALID_STATE`, `NOT_FOUND`, `FORBIDDEN`.
- **REQ-051** WHEN audit emission runs THEN the audit write SHALL use `AuditService.createAuditLog(contract, tx)` (EXISTING, `backend/services/admin/audit.service.ts`) with `actionType` drawn ONLY from `AuditActionType` enum (`backend/enum/audit/audit-action-type.enum.ts`), never string literals; `details` JSON SHALL carry `{sessionId, previous, next, reason?}` — metadata-only, no verbatim user PII beyond ids.

### 2.6 GraphQL & Frontend Contracts

- **REQ-060** WHEN codegen runs (`bun run generate:gqlSchema && bun codegen`) THEN the new fields SHALL be present: `AdminSessionListFilterInput`, `AdminSessionPage { items, totalCount, hasMore }`, `adminSessions`, `adminSession`, `adminRescheduleSession`, `adminCancelSession`, `adminReassignTeacher`, `adminJoinSession`; all timestamps typed `DateTime` (scalar in `shared/scalar.pothos.ts`).
- **REQ-061** WHEN Apollo documents are authored THEN they SHALL live in `frontend/graphql/sharedDocuments/adminSessions.documents.ts`, include `id` on every object, and use the generated TypedDocumentNode types.
- **REQ-062** WHEN the admin Sessions page renders THEN route `/[locale]/admin/sessions` SHALL exist under `app/(dashboard)/admin/sessions/` gated by the existing with-page-auth wrapper, and the nav entry in `frontend/views/dashboard/nav/navItems.ts` section `admin` SHALL gain a `sessions` child (with i18n label; no coming-soon stub exists to retarget — verified ground truth).
- **REQ-063** WHEN data loads on the page THEN the UI SHALL use `useQuery` (no `useLazyQuery`) and show MetricCard/StatusBadge/AppDataGrid states for loading/empty/error per existing admin views.

### 2.7 Test Coverage Requirements (4-Tier)

- **REQ-070** WHEN tests are authored THEN Tier-1 branch + Tier-2 boundary + Tier-3 chaos (mid-transition failure, concurrent cancel/reschedule) + Tier-4 security (non-admin 403, BOLA) cases SHALL cover every REQ; repo/service tests SHALL use `runInRollback` and pass `tx` to every repo call; `rejects.toThrow` inside `runInRollback` is FORBIDDEN (try/catch helper).
- **REQ-071** WHEN cross-actor journeys exist THEN `test/workflows/admin/admin-session-governance.test.ts` SHALL commit fixtures in `beforeAll`, delete in `afterAll`, and call REAL services against a REAL DB (no rollback) per TEST-FIRST mandate.
- **REQ-072** WHEN UI tests exist THEN component tests (Happy DOM + MockedProvider) SHALL cover filter application, dialog flows (reschedule/cancel/reassign), disabled Join button on non-live rows; one Playwright e2e SHALL cover the admin cancel happy path.

### 2.8 Documentation & Knowledge Gates

- **REQ-080** WHEN the ticket completes THEN `docs/admin/session-governance.md` shall be authored as the canonical reference (filters contract, transition matrix, audit shapes), `docs/sessions/session-lifecycle.md` §consumer-guidance SHALL gain a DEV3-021 anchor, and root `AGENTS.md` Important References list SHALL gain the doc.

### 2.9 Cross-Actor Workflow Scenario (Admin ↔ System)

| Actor | Permissions | Restrictions |
|---|---|---|
| Admin | All 6 operations | Must be `ACTIVE` (assertUserActive); disputed sessions excluded from reschedule/reassign/cancel (join allowed in `started` only) |
| Student | Receives notifications/refund effects | Cannot invoke admin surface (403) |
| Teacher | Receives reassignment effects | Same |

--- Workflow: Admin cancels a `started` session
1. Admin (UI) → `adminCancelSession(id)` → service guard-checks state (`started`) → reads holds (lane).
2. System → guard-UPDATE `status='cancelled'` in `tx`; refund via `refundHeldLaneToProvenance(tx)`; audit row written in `tx`.
3. EARS: **WHEN** the transaction commits **THEN** the Student's balances SHALL show refunded funds **AND** Student/Teacher SHALL receive a `sessionCancelled` notification event persisted first.

--- Workflow: Admin reassigns teacher on `scheduled` session
1. Admin → `adminReassignTeacher` → lock FOR UPDATE → validate certified teacher → set `teacher_id` → audit.
2. **WHEN** commit succeeds **THEN** old & new teachers SHALL receive notification events; the session row SHALL show the new teacher; student visible feed unchanged except teacher label.

--- Workflow: Admin joins `started` session
1. Admin → `adminJoinSession` → assert `status='started'` → NO row mutation → audit row `joined_observation` → returns `{session, joinedAt}` (server time).
2. **WHEN** the mutation returns **THEN** the front-end SHALL display the session detail (view-only) with an indicator the observation was logged.

---

## 3. Decisions & Invariants Alignment

- **A.5** audit_logs table consumed via `AuditService` — no new audit table.
- **INV-S1..S8** (session lifecycle): new transitions `admin_cancel` and `admin_reassign` follow the SAME guarded-UPDATE pattern (`UPDATE … WHERE id=? AND status IN (...)`); no new terminal states introduced; INV-S game of statuses preserved (existing `sessionStatus` enum unchanged, values `scheduled|started|ending|completed|cancelled|ended|expired|disputed`).
- **Inv — refund-same-lane** (DEV3-004 §4): cancel route MUST call `SessionLifecycleService.refundHeldLaneToProvenance`, never new ledger writes invented here.
- **Workflow 05** (`docs/workflows/05-admin-governance-override.md`) anchors the UX; FR-10.3 satisfied by REQ-010..020.
- **JR-C-1**: failed/denied calls write ZERO audit rows.

## 4. Cross-Layer Traceability Matrix

| REQ | Invariant | Repo | Service | Resolver | UI | Tests |
|---|---|---|---|---|---|---|
| REQ-010/011 | A.5(n/a), INV-S | `SessionRepository.listAdminAll/filter` | `SessionLifecycleService.listAdminAllSessions` | `admin-session.query.ts` | `useAdminSessions` | repo-101, svc-101, gql-101, ui-101 |
| REQ-012 | BOLA | same | same | same | detail drawer | gql-102 |
| REQ-013 | INV-S guard | guard UPDATE | `adminReschedule` | mutation | dialog | svc-201, wf-201 |
| REQ-014/015 | INV-S + refund-same-lane | guard UPDATE + refund | `adminCancel` | mutation | dialog | svc-202, chaos-301, wf-202 |
| REQ-016/017 | BOLA/BOPLA | guard UPDATE teachers | `adminReassign` | mutation | dialog | svc-203, sec-401 |
| REQ-018/019 | … | none (write=audit only) | `adminJoin` | mutation | Join button | svc-204, gql-103 |
| REQ-030/031 | BFLA | — | role assert | authScopes | page gate | sec-402 |
| REQ-040-044 | A.5 atomicity | tx envelope | tx envelope | errors | — | chaos-302 |
| REQ-050/051 | error contract | — | DomainError | extensions.code | error banner | svc-205 |
| REQ-060-063 | — | — | — | SDL/docs | page + nav | ui-102, e2e-401 |
| REQ-070-080 | — | — | — | — | — | all + doc gate |
