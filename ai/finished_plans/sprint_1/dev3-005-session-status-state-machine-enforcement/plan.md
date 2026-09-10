# DEV3-005 — Session Status State Machine Enforcement: Implementation Plan

> **Plan directory (verbatim):** `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement`
> **Specs of record:** `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/specs.md`
> **Tasks of record:** `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/tasks.md`
> **Deferred-items ledger:** `ai/plans/sprint_1/dev3-005-session-status-state-machine-enforcement/deferred-items.md`

## Overview

DEV3-004 shipped the guarded-transition session lifecycle (schema `backend/db/schema/classes/session.ts`, repo `backend/db/repo/classes/session.repository.ts`, service `backend/services/classes/session-lifecycle.service.ts` + extracted modules, GraphQL `backend/graphql/{mutation,query}/classes/session-lifecycle.*.ts`). DEV3-005 is an **enforcement-and-verification** slice on top: codify the transition matrix, add the INV-S6 in-session `is_online` lock/release to the existing guarded transactions, and expose INV-S7/INV-S8 gate functions for DEV3-006. No new tables, no new GraphQL operations, no UI.

### Design Goals
- Single source of truth for legal transitions (matrix), reused by guards and tests.
- Atomicity: lock/release ride the SAME `withTransaction` as the session status flip.
- Verify-then-claim: every cited symbol was grepped before authoring (see outcome 0.2).
- Zero disruption: existing public surface names, denial vocabulary, and error codes unchanged.

### Key Design Decisions

#### Decision 1: Transition matrix as a pure module, consulted for testing, not rewriting live guards
**Context:** `SessionRepository`'s six `*Once` writers already embed their legal pre-state sets inline (e.g. `cancelSessionOnce` predicates `scheduled|started` at `session.repository.ts:203-225`; `openDisputeOnce` at `:240-268`; `resolveDisputeCancelOnce` at `:278`-ish; `resolveDisputeCompleteOnce` at `:311`-ish). Duplicating them in spec text invites drift.
**Options:** (1) Rewrite each guard to consult the matrix at runtime — structured, but churns shipped, tested code for marginal gain and adds a lookup layer to hot paths; (2) Ship matrix as pure module + a static-consistency test that asserts each guard's actual SQL predicate matches the matrix (read the repo source/behavior via regression tests per transition).
**Decision:** Option 2 — matrix module + matrix-driven regression tests pin every edge; guards stay as-is.
**Rationale:** zero risk to shipped write paths; the matrix is the canonical vocabulary for future writers and for the journey assertions.

#### Decision 2: INV-S6 lock/release composed at the SERVICE layer, not inside repo predicates
**Context:** `SessionRepository` is the single-writer for the `session` table; `teacher.is_online` lives on another table. Repo-level cross-table writes would break the repo-per-table discipline (`backend/db/repo/AGENTS.md`).
**Decision:** Service composes, inside its existing `withTransaction`: `startSession` → `SessionRepository.startSessionOnce` + `TeacherRepository.setOnline(teacherId, false, tx)`; `completeSession`/`cancelSession` (from `started`) and dispute-resolution exit paths → `TeacherRepository.setOnline(teacherId, true, tx)` gated on "lock was applied" (teacher was forced offline by this session — see Concurrency note).
**Rationale:** matches the established composition style (e.g. `creditTeacherEarning` inside `confirmSessionCompletion`, `session-lifecycle.confirmation.ts:42-56`).

#### Decision 3: INV-S7/INV-S8 as exported gate functions in the lifecycle service layer
**Context:** DEV3-006's specs (REQ-012/013) assume a completed-session gate and a report-exists gate; the canonical place is beside the other lifecycle guards so future surfaces (recitation, evaluation) can reuse them.
**Decision:** Add `assertSessionCompletedForReport(sessionId, tx)` and `assertReportSubmittedForHomework(sessionId, tx)` to a new `session-lifecycle.enforcement.ts` module, re-exported through `session-lifecycle.service.ts`; denials via the existing `rejectTransitionMiss`-compatible shapes and the `errors` locale keys (`sessionInvalidTransition`, plus one new key `homeworkRequiresReport` — en/ar parity).
**Rationale:** single enforcement point; DEV3-006 imports, never duplicates.

#### Decision 4: Dispute surface = verification-only
The dispute writers/listing already exist and are unit-tested (`session.repository.test.ts:529+`,). This plan adds journey-level multi-actor verification (escrow lane intact + exactly-once) rather than any code change, unless journeys expose a defect (then fix minimally and record in outcome).

## Concurrency & Atomicity Assessment

| Flow | Writers (single tx) | Concurrency control | Failure mode |
|---|---|---|---|
| start + INV-S6 lock | `startSessionOnce` + `TeacherRepository.setOnline(false)` | guarded UPDATE on session; teacher UPDATE unconditional within tx (teacher id already pinned by session row) | tx rollback ⇒ no stale lock |
| complete/cancel from `started` + release | status writer + `setOnline(true)` | release only when the transitioned row came from `started` (probe/`*Once` returning row carries prior state classification via caller flow) | rollback ⇒ lock persists, teacher stays offline (safe direction) |
| resolve dispute + release | `resolveDispute*Once` + refund + `setOnline(true)` when prior state was `started` | exactly-once guards; lane refund primitive `refundHeldLaneToProvenance` | rollback ⇒ dispute stays open, retryable |
| capture rule | was-online capture | To avoid resurrecting a teacher who manually went offline mid-session (DEV2-011 era), release is computed as `priorOnline` captured at START (stored on the tx, derived from the teacher row read inside the start tx). Today no toggle exists, so `false→true` restore cannot resurrect a deliberate offline; the predicate is documented as the DEV2-011 seam (ledger D2). | n/a — documented seam |

MariaDB-style read-your-writes within the tx is guaranteed by passing `tx` to every call; the ambient `db` is forbidden inside these flows (P4 of the execution protocol).

## Data Models

No schema change. Leveraged existing columns:

- `session.status` — `session_status` pgEnum: `scheduled|started|completed|cancelled|disputed` (`backend/db/schema/enums.ts:23`).
- `session.held_balance_lane`, `session.fee_held` — refund provenance + escrow flag.
- `session.dispute_reason/disputed_at/resolution_note/resolved_at/cancel_reason` — arbitration surface.
- `teacher.is_online` (`backend/db/schema/teachers/teacher.ts`) — INV-S6 target column (INV-A2/A3 coupling documented).
- `reports.session_id` (`backend/db/schema/classes/reports.ts`) — INV-S8 gate reads this.

## Service / Repository Contracts

### New: `backend/db/repo/teachers/teacher.repository.ts` (EXTEND — one method)
```ts
export async function setOnline(id: number, online: boolean, tx?: DBTransaction): Promise<TeacherSelectType | null>
```
Guarded `UPDATE teacher SET is_online=$2, updated_at=now() WHERE id=$1 RETURNING *`. No certification predicate (offline is always allowed; online restoration is policy-free here — the flip-side gating is DEV2-011's toggle and the certification INV-A1 gate lives there).

### New: `backend/services/classes/session-lifecycle.enforcement.ts` (pure gates; re-exported via `session-lifecycle.service.ts`)
```ts
export const SESSION_TRANSITION_MATRIX: Readonly<Record<SessionStatus, ReadonlySet<SessionStatus>>>;
export function isSessionTransitionAllowed(from: SessionStatus, to: SessionStatus): boolean;
export async function assertSessionCompletedForReport(sessionId: number, tx: DBTransaction): Promise<void>;
export async function assertReportSubmittedForHomework(sessionId: number, tx: DBTransaction): Promise<void>;
export async function assertTeacherNotInActiveSession(teacherId: number, tx: DBTransaction): Promise<void>;
```
Localized denials: `ConflictError("SESSION_INVALID_TRANSITION", t.sessionInvalidTransition)` (existing key, `shared/locale/types/errors/labels.ts:127`), new key `homeworkRequiresReport`, and for the active-session seam a new key `teacherInActiveSession` (en/ar, parity suite updated).

### Modified services (composition only)
- `startSession` (`session-lifecycle.service.ts:195`) — after successful `startSessionOnce`, same-tx `TeacherRepository.setOnline(teacherId, false, tx)`.
- `completeSession` (`:241`), `cancelSession` (`:295`) — when the transitioned row's pre-state was `started`, same-tx `setOnline(teacherId, true, tx)`.
- `resolveSessionDispute` (`:418`) — same release rule for resolutions of disputes opened from `started`; the pre-state is recoverable via the probe/transition classification already implemented in `session-lifecycle.transitions.ts`.

## API Contracts

**No schema or SDL change.** Affected operations and their UX-visible denial vocabulary remain:

| Operation | Gate | Denials (unchanged) |
|---|---|---|
| `startSession` | participant teacher | `SESSION_NOT_FOUND` / `SESSION_INVALID_TRANSITION` |
| `completeSession` | owning certified teacher | + `TEACHER_NOT_CERTIFIED` |
| `cancelSession` | participant | as-is |
| `openSessionDispute` | participant | as-is |
| `resolveSessionDispute` | admin | as-is |

## UX / Navigation Specification

**Explicit no-UI ruling:** zero routes, zero sidebar entries, zero per-audience rendering deltas. All behavior is enforced inside existing mutations; the only user-visible change is the (already-known) typed error on illegal transitions and, operationally, teachers disappearing from any future directory while in-session (INV-A3 consumption is DEV2-013/DEV3-008 scope).

## Security / Tenancy Posture

- Oracle safety preserved: gates throw the SAME `SESSION_INVALID_TRANSITION` for wrong-state regardless of the caller's visibility; `assertSessionCompletedForReport`/`assertReportSubmittedForHomework` are internal-only (DEV3-006 applies participation checks before them).
- BOPLA: gates take ids derived from server-side rows, never client payloads.
- BFLA: no new mutations; dispute resolve stays admin-gated (verified by journey role matrix).
- Escrow: release/refund ordering unchanged; lane provenance (`isHeldBalanceLane` fail-closed) untouched.
- Tenancy: `setOnline` is id-scoped on the teacher row pinned by the session — no cross-tenant write possible.

## Error Handling
- All new throws are `ConflictError` with localized messages; exactly one `logger.logDomainError` per denial site; happy paths silent (matches `backend/services/classes/session-lifecycle.guards.ts` idiom).

## Testing Strategy

| Layer | Suite | Focus |
|---|---|---|
| Repo (`backend/db/test/repo/teachers/teacher.repository.test.ts` EXTEND) | `setOnline` guarded write | runInRollback + tx; idempotence; unknown id ⇒ null |
| Service unit (`backend/services/classes/session-lifecycle.service.test.ts` EXTEND, runInRollback/discipline per file header) | start/complete/cancel/resolve ⇒ teacher.is_online flip & restore; gates throw correctly; matrix module invariants | Tier 1–3 incl. race via `Promise.allSettled` |
| Journey (`test/workflows/sessions/`) NEW `session-state-machine.journey.test.ts` | J1 dispute/arbitration/refund; J2 in-session lock; illegal-transition sweep | committed fixtures, afterAll cleanup, NO runInRollback |
| Matrix consistency | static + behavioral | every matrix edge exercised; off-matrix ⇒ denial + zero-write |

## Documentation Updates
- `docs/sessions/session-lifecycle.md` §10 consumer table — INV-S6 landed, INV-S7/S8 gates live, dispute verified.
- `docs/specs/state-machine-invariants.md` §1 header line — enforcement status updated.
- Root `AGENTS.md` Important References — append nothing new (lifecycle doc already listed); only amend its INV note text if it stale-claims pending INV-S6 (verify before touching).

## Related Documents
- `docs/sessions/session-lifecycle.md` — guarded-transition pattern + consumer table
- `docs/specs/state-machine-invariants.md` — INV-S1..S8, INV-A2
- `docs/parents/parent-link-request.md` — N/A contextually but read for notification coupling if claims arise
- `ai/plans/sprint_1/dev3-006-session-report-homework-infrastructure/` — consumer plan
