# DEV3-005 — Session Status State Machine Enforcement — Specs

**Plan directory:** `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/`
**Ticket:** `docs/planning/TICKETS.md` → `[DEV3-005] Session Status State Machine Enforcement`
**Sprint:** 1 · **Owner Stream:** Dev 3 · **Story Points:** 3 · **Blocked By:** DEV3-004 (shipped)
**Decision Refs:** B.18 (disputed status), INV-S1 … INV-S8

---

## 1. Executive Summary & Problem Statement

DEV3-004 implemented the session lifecycle write path (create/start/complete/cancel, dual confirmation, hold-as-debit) plus the `disputed` status and admin arbitration surface (`openSessionDispute`, `resolveSessionDispute`). What it did **not** ship — explicitly deferred to DEV3-005 per `docs/sessions/session-lifecycle.md` (D5, INV-S6/S7/S8 ownership table) — is the *enforcement* layer that guarantees all eight session invariants hold at every entry point, today and for all future consumers:

1. **INV-S6 (in-session lock):** while a session is `started`, the teacher's `is_online` must be `false`. Nothing in the codebase currently flips or restores `is_online` around session boundaries; teachers would appear "online/bookable" while mid-session.
2. **INV-S7 (report gating):** a session report must only be accepted for a `completed` session. DEV3-006 builds the reports write path, but it must not re-implement (or fork) the gate — it must call a single DEV3-005-owned service guard.
3. **INV-S8 (homework gating):** homework may only be created when the report for that session exists.
4. **Transition matrix completeness:** every attempt to move a session between the five statuses (`scheduled`, `started`, `completed`, `cancelled`, `disputed`) must be validated against an explicit, testable allowed-transition table; terminal states (`completed`, `cancelled`) must be immutable (INV-S1, INV-S2).
5. **Dispute trail:** every state transition needs an audit-grade record (actor, from/to, timestamp, reason) so admins arbitrating a `disputed` session can see *how* the session got here (B.18 workflow).

### Persona Workflows Affected

- **Teacher:** starting a session takes them offline (`is_online=false`) so they stop receiving new offers; completing/cancelling/disputing-resolution restores availability. After completion, they may file exactly one report, then homework.
- **Student:** can dispute after confirmation attempts fail (B.18); their disputes surface to admins with a complete state trail.
- **Admin (supervisor/root):** arbitrates `disputed` sessions; relies on the transition audit trail to decide refund vs. uphold.
- **Parent:** observer only — sees session state reflected on linked children's dashboards; no direct actions in this ticket.

### Business Value

Prevents double-booking a teacher mid-session, garbage reports/homework on sessions that never happened, and un-auditable dispute arbitration — the three ways money and trust leak out of a tutoring marketplace.

### Actors

| Actor | System role(s) | Interaction |
|---|---|---|
| Teacher | `teacher` | start, complete, cancel, dispute, (downstream) report/homework |
| Student | `student` | confirm, cancel, dispute |
| Admin | `admin` (incl. root) | resolve dispute, read transition trail |
| System | cron/sweep | timeout sweeps (`sweepExpiredSessions`) |

### Explicit Non-Goals

- Report/homework **write surfaces** (owned by DEV3-006/DEV3-007; this ticket ships only the *gates* they call).
- Presence/booking UI for teacher availability (DEV2-011/DEV2-012 consume the INV-S6 lock writes; no UI here).
- Recitation records (DEV3-007).
- Any frontend route or new navigation item; existing lifecycle GraphQL operations are **extended**, not duplicated.
- Changing balance/lane refund semantics (DEV3-004 contract — untouched).

---

## 2. Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation

- **REQ-001 — Error/transition baseline ledger.** WHEN implementation begins THEN the plan SHALL enumerate a transition-error baseline ledger (status code per denied transition: `SESSION_NOT_FOUND`, `SESSION_FORBIDDEN`, `SESSION_INVALID_TRANSITION`) recorded in `outcome/`, and every new service error SHALL map onto that ledger with a `DomainError` subclass — no ad-hoc `Error` throws.
- **REQ-002 — Compile-time i18n.** WHEN any user-facing error message is added THEN the implementation SHALL use typed compile-time translations: `ctx.t("namespace")` in resolvers, `getServerTranslations(locale)` elsewhere in services/scripts; hardcoded user-facing strings SHALL be rejected in review.
- **REQ-003 — Canonical types discipline.** WHEN session/report/homework-shaped data crosses a layer boundary THEN it SHALL use types from `@/backend/types` (`SessionSelectType`, `SessionReturnType`, `DBTransaction`, `DBQueryExecutor`); local resolver/service `.types.ts` files are PROHIBITED.

### 2.2 Core Feature Logic / Happy Paths

- **REQ-010 — Transition matrix.** The service SHALL expose a single source-of-truth allowed-transition table covering all `(from, to)` pairs over `{scheduled, started, completed, cancelled, disputed}`, where legal edges are: `scheduled→started`, `scheduled→cancelled`, `scheduled→disputed`, `started→completed`, `started→cancelled`, `started→disputed`, `completed→disputed`, `disputed→completed`, `disputed→cancelled`; all other edges SHALL be rejected with `SESSION_INVALID_TRANSITION`.
- **REQ-011 — Terminal immutability.** WHEN a session is `completed` THEN a transition to `scheduled` or `started` SHALL be rejected (INV-S1). WHEN a session is `cancelled` THEN any transition SHALL be rejected (INV-S2). The matrix in REQ-010 has no such edges; enforcement is the guarded repo primitive (`WHERE status = :expected`).
- **REQ-012 — INV-S6 lock on start.** WHEN a session transitions to `started` THEN the teacher's `teacher.is_online` SHALL be set to `false` inside the same DB transaction as the status flip.
- **REQ-013 — INV-S6 lock release.** WHEN a session leaves `started` via `completed`, `cancelled`, or admin-resolved (`disputed→completed|cancelled`) THEN the teacher's `is_online` SHALL be restored **only if no other `started` session exists for that teacher**, inside the same transaction.
- **REQ-014 — Online-session concurrency.** WHEN two concurrent completions release the same teacher's lock THEN the final `is_online` value SHALL be deterministic (true iff zero remaining `started` sessions) — implemented via a single recalc query (`set is_online = not exists(select 1 from session where teacher_id=… and status='started')`), never read-then-write.
- **REQ-015 — INV-S7 report gate.** WHEN a report submission is attempted for a session not in `completed` THEN the gate (exported for DEV3-006 as `assertSessionReportAllowed(sessionId, tx?)`) SHALL throw `SessionInvalidTransitionError` with localized message; when the session IS `completed`, the gate SHALL pass through silently.
- **REQ-016 — INV-S8 homework gate.** WHEN homework creation is attempted and no report row exists for that `session_id` THEN the gate (`assertSessionHomeworkAllowed(sessionId, tx?)`) SHALL throw `SessionInvalidTransitionError`; a missing report after any transaction commit SHALL still be detected (the gate re-reads with the caller's `tx`).
- **REQ-017 — Report/homework read-only validation primitives.** The repository SHALL expose `hasSessionReport(sessionId, tx?)` (boolean, prepared) and `getSessionStatusForGate(sessionId, tx?)` so downstream tickets never open-code the status lookup.
- **REQ-018 — Transition audit trail.** WHEN any guarded transition commits THEN a row SHALL be written to `audit_logs` (`entity_type='session'`, `action_type` per transition, `details` JSON containing `sessionId`, `from`, `to`, `actorId`) in the same transaction. (A.5 audit table EXISTS at `backend/db/schema/audit/audit-logs.ts`.)
- **REQ-019 — Dispute entry precondition.** WHEN a session is already `disputed` or terminal THEN `openSessionDispute` SHALL reject (existing DEV3-004 behavior, verified by regression test against REQ-010 matrix).
- **REQ-020 — Dispute resolution edge coverage.** WHEN an admin resolves a dispute with outcome "refund" THEN the session SHALL land in `cancelled`; outcome "uphold" SHALL land it in `completed`; partial-refund resolution writes the same terminal states with the partial amount recorded per the DEV3-004 hold/refund contract. No other terminal state is legal (REQ-010).
- **REQ-021 — Cancel reason persistence.** WHEN a participant cancels with a reason THEN `cancel_reason` SHALL be persisted (trimmed, ≤500 chars) — replaces DEV3-004's validate-then-discard shim (see `docs/sessions/session-lifecycle.md` row DEV3-005).
- **REQ-022 — No transition outside service.** Any code path mutating `session.status` SHALL go through `SessionLifecycleService`; the repository SHALL refuse direct `status` writes outside its guarded-primitive API (enforced by code review + repo convention test scanning for raw `.set({ status` outside sanctioned files).

### 2.3 Security, Authorization & Tenancy

- (Zero public-input surface added by this ticket beyond existing mutations; gates operate on session id.)
- **BOLA/IDOR:** `assertSessionReportAllowed`/`assertSessionHomeworkAllowed` accept only a `sessionId`; ownership/actor checks live in the *calling* service (DEV3-006), but the transition/lock writes verify `teacher_id`/`student_id` via the guarded WHERE clause — a row mid-transition cannot be hijacked by a replayed request.
- **BOPLA:** No input spread — lock writes are computed server-side; cancel reason is the only accepted string and is trimmed/capped before persist.
- **BFLA:** `resolveSessionDispute` remains admin-gated (`authScopes: ["admin"]`); participant-only operations (start/complete/cancel/dispute) verify caller is the session's teacher or student.
- **Rate limiting:** unchanged from DEV3-004; dispute opens are idempotent per session (REQ-019).

### 2.4 Atomicity, Concurrency & Data Integrity

- **Transaction boundary:** every multi-write operation (status flip + is_online + audit row) commits atomically; repository methods accept `tx?: DBTransaction` and all intra-tx calls pass `tx`.
- **Optimistic-style guards:** transitions use `UPDATE … SET status=?, … WHERE id=? AND status=:expected` and assert `rowsAffected = 1`; `0` rows ⇒ `SessionInvalidTransitionError` (TOCTOU-safe — no separate SELECT preceding write).
- **Lock recalc, not toggle:** REQ-013/REQ-014 use set-based recalc ("teacher online iff zero started sessions") to be self-healing under any historical drift.
- **Unique/constraint deps:** relies on existing `reports`/`home_work` tables (`backend/db/schema/classes/reports.ts`, `home-work.ts` — EXISTING); no schema change required.

### 2.5 Validation & Localized Error Contracts

| Condition | Error class | `extensions.code` |
|---|---|---|
| Session missing | `NotFoundError` | `SESSION_NOT_FOUND` |
| Caller not participant | `ForbiddenError` | `SESSION_FORBIDDEN` |
| Illegal edge / terminal rewrite / unsettled report gate | `SessionInvalidTransitionError` (NEW, extends `DomainError`) | `SESSION_INVALID_TRANSITION` |
| Report gate on non-completed | `SessionInvalidTransitionError` | `SESSION_INVALID_TRANSITION` |
| Homework gate without report | `SessionInvalidTransitionError` | `SESSION_INVALID_TRANSITION` |

All messages localized via `ctx.t`/server translations; no hardcoded English in user-visible errors.

### 2.6 GraphQL & Frontend Contracts

- **No new mutations.** Existing operations (`startSession`, `completeSession`, `cancelSession`, `confirmSessionCompletion`, `openSessionDispute`, `resolveSessionDispute`) gain the INV-S6/audit/validation behavior transparently.
- Pothos object types unchanged; `DateTime` scalar for all timestamps (existing).
- Frontend documents at `frontend/graphql/sharedDocuments/scheduling/*.documents.ts` unchanged; documents keep `id` on every object for Apollo cache normalization.

### 2.7 Test Coverage Requirements (4-Tier)

- **Tier 1 (branch):** every edge and every illegal edge of the REQ-010 matrix (5² = 25 pairs enumerated; 9 legal, 16 illegal).
- **Tier 2 (boundary):** lock release with 0 vs >0 remaining `started` sessions; cancel reason at exactly 500 chars; report gate on boundary states (`started`, `disputed`, `cancelled`).
- **Tier 3 (chaos):** concurrent completes releasing the lock; dispute racing completion; lock re-release idempotency.
- **Tier 4 (security):** non-participant attempting transition ⇒ `SESSION_FORBIDDEN`; non-admin resolve ⇒ `UNAUTHORIZED`; gate called with another user's session id is still safe (no information disclosure).
- All DB tests use `runInRollback`, always pass `tx`, never `expect(…).rejects` inside the rollback wrapper (isolated-session try/catch helper instead).

### 2.8 Documentation & Knowledge Gates

- Update `docs/sessions/session-lifecycle.md`: flip INV-S6/S7/S8 rows to "SHIPPED in DEV3-005", document the audit-trail contract and gate API for DEV3-006/DEV3-007 consumers.
- Outcome documents under `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/outcome/`.

### 2.9 Cross-Actor Workflow Scenarios (Journeys)

**Actor table:**

| Actor | Permissions | Restrictions |
|---|---|---|
| Teacher | start/complete/cancel/dispute own sessions; report/homework after completion | blocked at gates when state illegal; forced offline while `started` |
| Student | confirm/cancel/dispute own sessions | cannot resolve disputes; cannot start |
| Admin | resolve any `disputed` session; read audit trail | cannot start/complete sessions |
| System sweeper | timeout-cancel expired sessions | same matrix constraints |

**Journey J-1: Locked teacher completes with report (Teacher → Student → Admin observes)**

1. Teacher requests `startSession(S)` → state `scheduled→started`; teacher `is_online=false`; audit row written.
2. Teacher attempts report while `started` → **rejected** (INV-S7 gate).
3. Teacher requests `completeSession(S)` → state `started→completed`; dual-confirmation flow (DEV3-004) proceeds; teacher `is_online` recalculated → `true` (no other started sessions); audit row written.
4. Teacher (downstream DEV3-006) submits report → gate passes.
5. Homework creation → gate passes (report exists).

**Journey J-2: Dispute arbitration with trail (Student → Admin)**

1. Post-confirmation, student calls `openSessionDispute(S, reason)` → `completed→disputed`; audit row records actor=student, reason.
2. Any further cancel/start attempts on S → rejected (matrix).
3. Admin resolves with uphold → `disputed→completed`; audit row records actor=admin, outcome.
4. Student re-disputes → rejected (`completed→disputed` edge exists but DEV3-004 numbers resolution rules; REQ-020 keeps uphold terminal-for-dispute via service guard).

**Journey J-3: Concurrent completion lock race (Teacher × 2 sessions)**

1. Teacher has S1, S2 both `started`. Teacher completes S1 → release check finds S2 still started → `is_online` stays `false`.
2. Teacher completes S2 → recalc finds none → `is_online=true`.

**EARS (observer perspective):**

- WHEN a teacher is inside an active session THEN the booking surface SHALL observe `is_online = false` for that teacher.
- WHEN an admin views a disputed session THEN the audit trail SHALL show every prior transition with actor and timestamp.
- WHEN a session never reached `completed` THEN any report submission observed by any actor SHALL be denied with `SESSION_INVALID_TRANSITION`.

---

## 3. System Decisions & State Machine Invariants Alignment

| Spec anchor | Rule | This ticket |
|---|---|---|
| INV-S1 | no `completed→scheduled/started` | REQ-010/011 — matrix has no such edge; guarded UPDATE enforces |
| INV-S2 | `cancelled` terminal | REQ-011 — matrix has zero out-edges from `cancelled` |
| INV-S3 | earning tx only on confirmed completion | DEV3-004 shipped; REQ-018 adds audit parity (no change) |
| INV-S4/S5 | FK not-null, certified teacher at creation | DEV3-004 shipped; regression tests only |
| INV-S6 | `started` ⇒ teacher `is_online=false` | REQ-012/013/014 |
| INV-S7 | report only when `completed` | REQ-015 |
| INV-S8 | homework only when report exists | REQ-016 |
| B.18 | disputed status + admin arbitration (refund/partial/uphold) | REQ-019/020 + J-2 |
| A.5 | audit_logs table | REQ-018 |

---

## 4. Cross-Layer Traceability Matrix

| REQ | Invariant | Service (`session-lifecycle.*.ts`) | Repository | Resolver | UI | Tests |
|---|---|---|---|---|---|---|
| REQ-010/011 | INV-S1/S2 | `transitions.ts` matrix + guards | `session.repository.ts` guarded UPDATE | existing mutations | — | matrix exhaustive test, `__tests__` |
| REQ-012/013/014 | INV-S6 | `transitions.ts` lock set/release | `teacher.repository.ts` set-online + recalc | `startSession`, `completeSession`, `cancelSession`, `resolveSessionDispute` | availability views (DEV2-011/012 consume) | lock journey J-1/J-3, chaos race |
| REQ-015 | INV-S7 | `assertSessionReportAllowed` | `hasSessionReport`, `getSessionStatusForGate` | (DEV3-006 later) | — | gate boundary test |
| REQ-016 | INV-S8 | `assertSessionHomeworkAllowed` | `hasSessionReport` | (DEV3-006 later) | — | gate boundary test |
| REQ-018 | A.5/B.18 | audit writer in transitions | `audit-logs` repo insert | all mutations | admin dispute view (existing) | audit-row assertions per journey step |
| REQ-019/020 | B.18 | disputeresolve guards | guarded UPDATE | `openSessionDispute`, `resolveSessionDispute` | admin arbitration page | journey J-2 (`test/workflows/sessions/`) |
| REQ-021 | — | cancellation flow | `cancel_reason` persist | `cancelSession` | display | boundary 500-char test |
| REQ-022 | all | convention test | — | — | — | codebase scan test |
