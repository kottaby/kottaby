# Session Status State Machine Enforcement: Requirements

<!-- Plan directory (verbatim — used in every header and self-reference):
     ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement -->

- **Feature Name**: Session Status State Machine Enforcement
- **Ticket**: Session Status State Machine (docs/planning/TICKETS.md:1024) — Sprint 1, Dev 3, 3 SP, blocked by the Session Creation & Lifecycle ticket (shipped, PR #46)
- **Target Directory**: `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/`
- **Outcome Directory**: `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/outcome/`
- **Spec of record for invariants**: `docs/specs/state-machine-invariants.md` §1 (INV-S1..S8), B.18
- **Implementation base**: `docs/sessions/session-lifecycle.md` (the Session Creation & Lifecycle ticket shipped slice), `backend/db/repo/classes/session.repository.ts`, `backend/services/classes/session-lifecycle.*.ts`
- **Version**: 1.0
- **Date**: 2026-09-05

## Introduction

the Session Creation & Lifecycle ticket shipped the session lifecycle (scheduled → started → completed/cancelled, dual confirmation, escrow hold-as-debit, dispute open/resolve) with INV-S1..S5 enforced structurally. This ticket closes the remaining invariant surface: INV-S6 (in-session `is_online` lock), the INV-S7/INV-S8 enforcement points (report-only-on-completed, homework-only-after-report) as shared, testable gates, plus an exhaustive transition-matrix validation layer so that every legal and illegal session state transition is codified, guarded, and regression-locked by tests.

The dispute surface (B.18) is already implemented (`openDisputeOnce`, `resolveDisputeCancelOnce`, `resolveDisputeCompleteOnce`, `listAdminDisputed`) — this ticket VERIFIES it end-to-end with journey tests rather than re-implementing it. Verify-then-claim: nothing already shipped is re-created.

### Feature Summary
Enforce the complete session state machine — single guarded-writer transitions, in-session teacher offline lock, reported-only-on-completed and homework-only-after-report gates — with codified transition matrix and machine-checked tests.

### Business Value
Eliminates financial escrow corruption (double-refunds, ghost completions), protects teacher directory integrity (INV-A2 tie-in), and gives (report/homework infra) authoritative gate functions to consume.

### Scope
**In scope:** transition-matrix module + re-entrant guards; INV-S6 lock write + release at `started` entry/exit; INV-S7/INV-S8 shared gate functions consumed; dispute-flow journey verification; denial classification consistency.
**Out of scope:** report/homework TABLES and submission mutations; teacher availability toggle UI; inactivity sweeper; directory filtering; sweeper cron; a `session_status_history` table (deferred — ledger D3).

## Requirements

### Requirement 0: Pre-Implementation Baseline & Execution Protocol

**User Story:** As an executing agent, I want a recorded baseline and outcome discipline, so that new issues are distinguishable from pre-existing ones and knowledge persists across tasks.

#### Acceptance Criteria
1. WHEN implementation begins THEN system SHALL record baseline error counts (tsgo / biome / lint / oxlint) into `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/outcome/0.1-baseline-outcome.md`.
2. WHEN implementation begins THEN system SHALL initialize `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md`.
3. WHEN any task starts THEN the agent SHALL read ALL files in the outcome directory before editing.
4. WHEN any task completes THEN the agent SHALL write `outcome/<task-id>-outcome.md` with commands, exit codes, and anchors.
5. WHEN any subtask completes THEN the checkbox in `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/tasks.md` SHALL flip `[ ]` → `[x]`.
6. WHEN any file is modified THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 before the next step.

### Requirement 0.5: i18n & Enum Compliance

**User Story:** As a developer, I want typed translations and value-imported enums, so errors are localized and type-safe.

#### Acceptance Criteria
1. WHEN a service raises a domain denial THEN it SHALL use `ConflictError`/`ValidationError` with a localized message from `getServerTranslations(locale)` (ONE arg; `errorsTranslations` property access), never a hardcoded string.
2. WHEN an enum member is used in a runtime expression then it SHALL be a VALUE import (`SessionStatus.Started`, never `"started"`).
3. ❌ FORBIDDEN: `Translation.` enum, two-arg `getTranslations`, `next-intl`, `@/frontend/utils/logger` in backend, raw `bun test` for DB workflows.

### Requirement 1: Exhaustive Transition Matrix (INV-S1, INV-S2, B.18 codified)

**User Story:** As a backend developer, I want a single canonical declaration of every legal session transition, so that guards, denials, and tests all derive from one table.

#### Acceptance Criteria
1. WHEN the transition module loads THEN system SHALL expose `SESSION_TRANSITION_MATRIX: ReadonlyMap<SessionStatus, ReadonlySet<SessionStatus>>` (or equivalent closed structure) covering exactly: `scheduled → {started, cancelled, disputed}`, `started → {completed, cancelled, disputed}`, `disputed → {completed, cancelled}`, `completed → {}`, `cancelled → {}`.
2. WHEN any transition is requested THEN `isSessionTransitionAllowed(from, to)` SHALL return `true` only for matrix members (INV-S1: completed is terminal; INV-S2: cancelled is terminal).
3. WHEN a guard classifies a zero-row guarded write THEN the denial vocabulary SHALL remain `SESSION_INVALID_TRANSITION` (ConflictError) / `SESSION_NOT_FOUND` (NotFoundError), matched to the existing `rejectTransitionMiss` classification in `session-lifecycle.transitions.ts` — NO new denial shape for existing flows.
4. WHEN the matrix module is imported THEN it SHALL be pure (no DB, no logging) and live next to the guards module.

**Priority:** High | **Complexity:** Low | **Dependencies:** none.

### Requirement 2: INV-S6 In-Session `is_online` Lock

**User Story:** As a student, I want an in-session teacher to be forced offline, so no other student can book them mid-session.

#### Acceptance Criteria
1. WHEN `startSessionOnce` succeeds THEN the SAME transaction SHALL set `teacher.is_online = false` exactly once (guarded UPDATE or service-composed write; rollback of either aborts both).
2. WHEN a `started` session reaches `completed` or `cancelled` THEN the SAME transaction SHALL restore `teacher.is_online = true` IF AND ONLY IF the teacher was forced offline by this lock and the teacher is still active (INV-A4 ceiling: the restore never resurrects a manually-offline or inactivated account).
3. WHEN a disputed session resolves to `completed`/`cancelled` from `started` THEN the lock release SHALL apply identically via the arbitration write path.
4. WHEN the toggle surface lands THEN its pre-write guard shall be able to call `assertTeacherNotInActiveSession(teacherId, tx)` exported from this plan's guard surface (denial = `FORBIDDEN`-class ConflictError, oracle: no session id disclosed).
5. WHEN the lock state is observed THEN directory queries (read side, future) can rely on `is_online = false` for every `started` session — the invariant is write-side, verified by tests here.

**Priority:** High | **Complexity:** Medium | **Dependencies:** `teacher.is_online` column (exists, `backend/db/schema/teachers/teacher.ts`); toggle surface itself.**

### Requirement 3: INV-S7/INV-S8 Enforcement Gates

**User Story:** As the implementer, I want authoritative gate functions, so report/homework timing constraints are enforced in exactly one place.

#### Acceptance Criteria
1. WHEN report submission is attempted THEN `assertSessionCompletedForReport(sessionId, tx)` SHALL pass only for `status = completed` (INV-S7) and throw `SESSION_INVALID_TRANSITION` ConflictError otherwise — identical denial shape to lifecycle transitions.
2. WHEN homework creation is attempted THEN `assertReportSubmittedForHomework(sessionId, tx)` SHALL pass only when a `reports` row exists for the session (INV-S8), else throw a localized ConflictError.
3. WHEN ships its submission mutation THEN it SHALL consume these gates (cross-plan contract recorded in ledger D1) — no duplicated inline status checks.
4. WHEN the gates run THEN they SHALL execute inside the caller's transaction (`tx` propagated), never opening their own.

**Priority:** High | **Complexity:** Low | **Dependencies:** `reports` table (schema exists at `backend/db/schema/classes/reports.ts`); consumption.

### Requirement 4: Dispute Lifecycle Verification (B.18)

**User Story:** As an admin, I want dispute states verified end-to-end, so arbitration never corrupts escrow.

#### Acceptance Criteria
1. WHEN a participant calls `openSessionDispute` on a `scheduled`/`started` session THEN the row SHALL become `disputed` with reason + stamp, exactly once (second call is a denial).
2. WHEN an admin resolves a dispute THEN `resolveDisputeCancelOnce`/`resolveDisputeCompleteOnce` SHALL move it to exactly one terminal state; a never-started disputed session rejects `Complete` (guard shard verified).
3. WHEN dispute resolution CANCELs a held session THEN the refund returns to the recorded `held_balance_lane` via `refundHeldLaneToProvenance` (journey-verified lane integrity).
4. WHEN `listAdminDisputedSessions` runs THEN rows SHALL be disputed-only, newest-first, with matching `countAdminDisputedSessions` totals.

**Priority:** High | **Complexity:** Medium (mostly tests) | **Dependencies:** the Session Creation & Lifecycle ticket surface (already shipped).

### Requirement 5: Regression-Locked Denial & Rollback Behavior

**User Story:** As a platform owner, I want every illegal transition proven non-writing, so races and retries cannot corrupt sessions.

#### Acceptance Criteria
1. WHEN an illegal transition is attempted (`completed→started`, `cancelled→any`, `disputed→started/scheduled`, `scheduled→completed` without start, etc.) THEN it SHALL be rejected with `SESSION_INVALID_TRANSITION` and produce ZERO writes (verified by row-equality check after the attempt).
2. WHEN two identical transitions race (`Promise.allSettled`) THEN exactly one SHALL win and the loser SHALL receive the typed conflict denial.
3. WHEN a composite flow (start + lock / resolve + refund) faults mid-transaction THEN ALL writes SHALL roll back atomically.
4. WHEN the teacher-certification predicate flips between probe and guard THEN the `TEACHER_NOT_CERTIFIED` re-check path (already in `rejectCompletionMiss`) SHALL remain the only certification denial.

**Priority:** High | **Complexity:** Medium | **Dependencies:** existing guarded primitives.

### Requirement 6: Documentation & Knowledge Propagation

**User Story:** As a future agent, I want the session-lifecycle doc updated, so consume the right seams.

#### Acceptance Criteria
1. WHEN this plan completes THEN `docs/sessions/session-lifecycle.md` §10 consumer table SHALL be amended: INV-S6 gate landed (lock + release points cited), INV-S7/S8 gate functions live (with `path:line`), and the "this-ticket-owned" forward notes resolved.
2. WHEN this plan completes THEN `docs/specs/state-machine-invariants.md` §1 implementation-reference line SHALL be updated to note INV-S6 landed and the dispute surface verified.
3. WHEN this plan completes THEN the outcome directory SHALL contain per-task outcome files and a final review summary.

**Priority:** Medium | **Complexity:** Low.

## UX/Navigation Requirements (MANDATORY)

**No-UI ruling (explicit):** this ticket ships ZERO new routes, zero navigation items, zero frontend views, and zero GraphQL schema changes. All enforcement is backend-internal (repository/service guards) consumed by EXISTING Pothos mutations (`startSession`, `completeSession`, `cancelSession`, `openSessionDispute`, `resolveSessionDispute` in `backend/graphql/mutation/classes/session-lifecycle.mutation.ts`) and by the FUTURE surfaces.

### Affected Existing Mutations & Permission Posture (unchanged)

| Operation | Actor gate | What changes with this ticket |
|---|---|---|
| `startSession` | participant (teacher) | + tx-composed `is_online=false` lock write (INV-S6) |
| `completeSession` | teacher-owner + certification | + lock release on `started` exit |
| `cancelSession` | participant | + lock release when cancelling from `started` |
| `openSessionDispute` | participant | none (verification only) |
| `resolveSessionDispute` | admin | + lock release when resolving from `started` |
| `submitSessionReport` | teacher-owner | consumes INV-S7 gate |
| homework creation | teacher-owner | consumes INV-S8 gate |

Sidebar/role matrix: **N/A** — no navigation surface.

## Cross-Actor Workflow Scenarios (Journeys)

### Actor Table
| Actor | Role | Can Do | Cannot Do |
|---|---|---|---|
| Teacher (certified, owner) | `teacher` | start, complete, cancel, dispute own session; release own lock implicitly | transition others' sessions; complete as uncertified |
| Student (participant) | `student` | confirm completion, cancel, dispute own session | complete/start; touch foreign sessions |
| Admin (arbitrator) | `admin`/`superadmin` | resolve disputes; list disputed queue | open disputes as participant on foreign rows |

### Ordered Step List (Journey J1 — dispute, arbitration, refund)
1. Teacher+Student fixture → session `started` with fee held on `hifz` lane.
2. Student → `openSessionDispute` → status `disputed`, `disputedAt` set; queue count +1.
3. Student → second `openSessionDispute` → DENIED `SESSION_INVALID_TRANSITION`, zero writes.
4. Teacher → tries `completeSession` on disputed row → DENIED (disputed not in complete's legal set).
5. Admin → `resolveSessionDispute(Cancel)` → status `cancelled`, `feeHeld=false`, `hifz` lane re-credited (+1), `is_online` restored.
6. Admin → repeat resolve → DENIED, zero writes (exactly-once).

### Ordered Step List (J2 — in-session lock, INV-S6)
1. Teacher `is_online=true` fixture → session started → `is_online=false` (same commit).
2. Session `cancelled` from `started` → `is_online=true` restored.
3. Repeat with complete path → same restore; observe teacher reappears-available predicate (raw flag only).

### Cross-Actor EARS Criteria
- WHEN a student opens a dispute THEN the admin SHALL see it in the arbitration queue AND the teacher SHALL no longer be able to complete it.
- WHEN an admin resolves with Cancel THEN the student's funding lane SHALL be re-credited AND the teacher's in-session lock SHALL lift.
- WHEN any non-admin attempts `resolveSessionDispute` THEN the system SHALL deny pre-resolver (`UNAUTHORIZED`/`FORBIDDEN`).

## Non-Functional Requirements

### Performance
- Lock/release writes compose into the EXISTING single transaction per transition — zero extra round trips beyond ONE teacher-row UPDATE.
- The transition matrix is a module-level constant — O(1) lookup, no allocation per call.

### Security
- Denials keep the sessions-are-sensitive oracle ruling: foreign session ids are indistinguishable from nonexistent for participants.
- No new client-input surface: gates take only server-derived `sessionId`s.
- ISO: lock write must be idempotent under retry (guarded `AND status/IS` predicates, not blind sets where avoidable).

### Reliability
- Any composite failure ⇒ full rollback (no session transitioned with a stale lock or vice versa).

## Constraints and Assumptions

### Technical Constraints
- All new repo writes follow the guarded-UPDATE pattern of `session.repository.ts` (predicate-set, `.returning()`, zero-business-logic).
- `tx` is threaded through every new call — never the ambient `db` inside a caller's transaction.
- Drizzle push discipline for any schema-adjacent touch (this plan targets NO schema change; if one proves unavoidable it is ledger-blocked, not improvised).

### Business Constraints
- Escrow: refunds only ever go to the recorded `held_balance_lane` (INV-B8 provenance); this ticket must not weaken this.
- B.18: `disputed` has no non-admin exit.

### Assumptions
- the Session Creation & Lifecycle ticket completion-earning dual-confirmation (INV-S3) is shipped and untouched.
- will build the manual toggle and will consume `assertTeacherNotInActiveSession`.

## Success Criteria

### Definition of Done
- [ ] Transition matrix module exists; all six primitive helpers cite or consult it as appropriate; illegal transitions all denied.
- [ ] INV-S6 lock/release composed inside start/complete/cancel/resolve transactions; journey J2 green.
- [] INV-S7/INV-S8 gate functions exported with localized denials and unit coverage; consumption contract documented.
- [ ] Dispute journey J1 green (open once, deny duplicates, resolve exactly-once, lane-intact refund).
- [ ] Race/rollback suite green (Req 5).
- [ ] Docs updated; zero unresolved ❌/⚠️ in the deferred ledger; quality gate green at baseline.

### Acceptance Metrics
- New tests: ≥ 25 focused assertions across repo/service/journey layers; all existing session suites unchanged-green.

## Glossary

| Term | Definition |
|---|---|
| Guarded transition | Single `UPDATE … WHERE <identity+precondition> RETURNING *`; zero rows = denial, never check-then-write |
| Transition matrix | Closed mapping of legal `from → to` session statuses |
| INV-S6 lock | Forced `teacher.is_online=false` while a session is `started` |
| Held lane provenance | `session.held_balance_lane` — permanent record of the funding lane for refunds |
| Dispute (B.18) | Non-terminal `disputed` state exited only by admin arbitration |

---

## Requirements Review Checklist
- [x] Roles identified (teacher/student/admin); journeys captured with actor table + steps + observer-perspective EARS.
- [x] EARS format throughout; testable criteria.
- [x] No-UI ruling stated explicitly in UX/Navigation section.
- [x] Dependencies and deviations (consumption, seam) recorded.
