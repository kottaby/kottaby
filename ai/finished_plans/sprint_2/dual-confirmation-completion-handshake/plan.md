# Design — Dual-Confirmation Completion Handshake (24h Timeout)

**Plan Directory:** `ai/plans/sprint_2/dual-confirmation-completion-handshake/`
**Related:** `specs.md` (same directory) · `docs/sessions/session-lifecycle.md` · `docs/notifications/session-request-notifications.md`
**Version:** 1.0 · **Date:** 2026-09-05

---

## Overview

The handshake state machine, guarded transitions, wallet credit, dispute arbitration, GraphQL mutation surface, cron route, and student confirm UI **already exist** (verified — see specs.md ground-truth table). This design specifies only the three deltas: (1) a **post-completion timeout sweep leg** that cancels `completed` rows whose student confirmation is 24h overdue, (2) two **notification waves** (student confirm-prompt at teacher completion; student auto-cancel notice at timeout), and (3) journey-test + canonical-doc proof.

Everything reuses existing composables: the same-lane refund primitive (`session-lifecycle.transitions.ts:209`), the guarded-UPDATE family (`session.repository.ts`), the wave-emit machinery with receipt/publish-after-commit contract (`session-request-notification.service.ts`, `NotificationEngine`), and the cron route (`app/api/cron/sweep-sessions/route.ts`) — **no new GraphQL mutations, no new routes, no schema changes, no UI**.

### Design Goals
- Money can never be stranded: every `completed` row terminates in paid (student confirm) or refunded (timeout) exactly once.
- Zero new transition surfaces: the timeout is ONE guarded batch UPDATE in the same family as the four existing primitives.
- Notifications follow the receipt/publish-after-commit contract — never publish inside a transaction.

### Key Design Decisions

- **D-1 — Post-completion window from `confirmed_by_teacher_at`, not a re-armed deadline.** `confirmation_deadline` is written once at creation and never re-armed (canonical B.2 ruling, `docs/sessions/session-lifecycle.md` §2.2). The NEW timeout leg evaluates `confirmed_by_teacher_at < now - SESSION_CONFIRMATION_WINDOW_MS` at sweep time (pure predicate arithmetic, zero writes to the deadline column). *Rationale:* preserves the existing `scheduled`-row sweep semantics untouched; no column migration; matches AC "24 hours pass without student confirmation".
- **D-2 — Dispute predicate NOT widened to `completed`.** Ticket AC 4 says "Given a completed session … the student disputes". The canonical state machine (`session.ts:15-20`, schema docblock) defines `disputed` reachable only from `scheduled|started`, and admin `DisputeResolution.Complete` already produces the "student wins" outcome shape. Widening `openDisputeOnce` would create a second path into arbitration semantics with a different escrow state (hold possibly consumed) — a distinct, riskier surface (deferrable to arbitration UX if product wants it). This plan documents the divergence and keeps disputes pre-completion.
- **D-3 — One `SessionRequestNotificationService`, extended wave-kind union.** The compose machinery (joined wave-context read via `findWaveContextById`, recipient locale selection, deterministic idempotency keys, receipt return) is identical for both new waves. A new service would duplicate it. `SessionRequestWaveKind` (`backend/types/classes/session-notification.types.ts:5-11`) extends from 6 to 8 kinds: `completion_prompt`, `completion_auto_cancelled`. Notification rows use existing `NotificationType.SessionCompletion` (`backend/enum/notifications/notification-type.enum.ts:7`), satisfying the `SessionEventNotificationType` contract union (`backend/types/contracts/session-notification.contract.types.ts:22-25`) already reserving it.
- **D-4 — Sweep composes both legs in ONE transaction.** `sweepExpiredSessions` (`session-lifecycle.service.ts:554`) gains the completed-leg alongside the existing scheduled-leg; refund walk stays sequential fail-closed (existing `refundSweptHolds` semantics). Notification emission happens AFTER commit via receipts collected per swept row.
- **D-5 — Prompt emission at service boundary, not resolver.** `completeSession` returns the receipt-bearing result internally; the GraphQL resolver publishes post-commit (mirrors the session-request wave topologies). When called with an outer `tx`, receipts are returned for the caller to publish.

### UX/Navigation Specification

**No new routes, sidebar items, or navigation changes.** Explicit no-UI ruling verified in specs.md.

| Surface | Route | Permission/Role | Change |
|---|---|---|---|
| Student sessions list | existing | STUDENT | none — confirm CTA already wired (`useStudentSessionConfirm.ts`) |
| Notifications inbox | existing | any authenticated | receives two new `session_completion` items |

**Role-Based Access Matrix (unchanged by this plan):**
| Role | complete | confirm | dispute | sweep |
|---|---|---|---|---|
| TEACHER (owning) | ✅ guarded | idempotent no-op | ✅ | — |
| STUDENT (owning) | ❌ FORBIDDEN | ✅ guarded | ✅ | — |
| PARENT/ADMIN/STAFF | ❌ FORBIDDEN/`SESSION_NOT_FOUND` | ❌ oracle `SESSION_NOT_FOUND` | ❌ | — |
| System / cron | — | — | — | ✅ bearer-only |

### Concurrency & Race Condition Assessment

| Scenario | Risk | Mitigation (existing / new) |
|---|---|---|
| Student confirms WHILE sweep runs | Double-consume or refund-after-pay | Both paths are guarded UPDATEs with disjoint pre-state predicates (`completed+fee_held` vs `completed+expired+unconfirmed`); row lock serializes; loser sees zero rows and classifies idempotently (confirm → returns current row; sweep → skips) |
| Double sweep | Double refund | Cancelled status is terminal; second run matches zero rows |
| Sweep row with unreadable lane | Partial refund | Fail-closed: `refundSweptHolds` throws, whole sweep tx rolls back (existing semantics — new leg rides the same transaction) |
| Notification fan-out crash mid-publish | Lost notification, state already committed | Acceptable: state is authoritative; receipts published best-effort post-commit (existing wave contract) |

No new SELECT-FOR-UPDATE needs; no TOCTOU (all writes predicate-fused).

### Cross-Actor Journey Design

**Shared-Entity State Machine (`session.status`):**
| Current | Trigger | Next | Guard |
|---|---|---|---|
| `started` | teacher `completeSession` | `completed` | owning teacher + fused certification EXISTS (EXISTING) |
| `completed` | student `confirmSessionCompletion` | `completed` + `confirmed_by_student_at`, `fee_held=false` + wallet credit | owning student, hold still marked (EXISTING) |
| `completed` (teacher stamp > 24h old) | sweep | `cancelled` + same-lane refund | system, `confirmed_by_student_at IS NULL` (**NEW**) |
| `scheduled|started` | participant `openSessionDispute` | `disputed` | either participant (EXISTING) |

**Side-Effect Matrix:**
| Transition | Rows written | Notifications | Idempotency |
|---|---|---|---|
| teacher complete | session (status/stamps) | `session_completion` prompt → student (NEW) | structural repeat-prevent (state machine) + key `session-completion-prompt:{id}` |
| student confirm | session + ONE wallet ledger row + wallet balance | none | guarded-update exactly-once; repeat returns row unchanged |
| timeout sweep | session per row + one lane increment per held row | `session_completion` auto-cancel → student per row (NEW) | second sweep matches zero |

**Cross-Actor Visibility:** student sees prompt then settled/refunded state in existing list views; teacher sees settled `completed` with stamps; foreign callers see oracle-safe `SESSION_NOT_FOUND`.

### Drizzle Anti-Pattern Reminder
No inline `--` comments inside `sql`` `` ` templates (parameter binding shift). All new repo code uses the query builder (`.update().where(and(...))`) — same as the four existing guarded primitives.

## Architecture / Components

### A. `SessionRepository.sweepExpiredCompletedOnce` (NEW)
`backend/db/repo/classes/session.repository.ts`. Exactly one guarded batch UPDATE:
`SET status=cancelled, fee_held=false, updated_at=${now} WHERE status='completed' AND confirmed_by_student_at IS NULL AND confirmed_by_teacher_at < ${cutoff} RETURNING *` — mirrors `sweepExpiredScheduledOnce` (line 409) shape exactly. `cutoff = new Date(now - SESSION_CONFIRMATION_WINDOW_MS)` (`shared/constants/session-fees.constants.ts`).

### B. `SessionLifecycleService.sweepExpiredSessions` (EXTEND)
- Compose: `sweepExpiredScheduledOnce(now, tx)` (existing) → then `sweepExpiredCompletedOnce(now, tx)` (new) → `refundSweptHolds(allRows, tx)` (existing) — one transaction, sequential.
- After commit, notify: for each cancelled completed-leg row, emit auto-cancel wave and collect receipts; `NotificationEngine.publishReceipts(receipts)` post-commit. Return shape gains notification counts or stays counts-only (route contract unchanged: `{cancelled, refunded}` — internal receipts don't leak over the wire).
- Cron route (`app/api/cron/sweep-sessions/route.ts`) requires NO change.

### C. `SessionRequestNotificationService` — two new emitters (EXTEND)
`backend/services/classes/session-request-notification.service.ts`:
- `notifyStudentOfCompletionPrompt(sessionId, locale, tx?, options?)` — kind `completion_prompt`, recipient student, `NotificationType.SessionCompletion`.
- `notifyStudentOfCompletionAutoCancelled(sessionId, locale, tx?, options?)` — kind `completion_auto_cancelled`, recipient student.
Both ride `emitWave` (line ~181): same joined context read (`findWaveContextById`, repo line 117), intent-label guard, recipient-locale composition, deterministic idempotency keys, receipt return, zero authorization (internal primitives). Student-confirm wire into `SessionLifecycleService.completeSession` at `session-lifecycle.service.ts:241` post-success (emit on tx, publish after commit); prompt fires only when the guarded UPDATE actually matched (not on idempotent fall-through).

### D. Locale namespace (EXTEND — three files, parity-gated)
`shared/locale/types/notifications/index.ts`, `shared/locale/en/notifications/index.ts`, `shared/locale/ar/notifications/index.ts`: add `eventSessionCompletionPromptTitle/Body`, `eventSessionAutoCancelledTitle/Body` (bodies take `(teacherName: string)` — mirror existing signature shape at en/notifications:47-52). Parity test (`shared/locale/notifications-namespace.parity.test.ts`) enforces all three.

### E. Types (EXTEND)
`backend/types/classes/session-notification.types.ts`: `SessionRequestWaveKind` gains `"completion_prompt" | "completion_auto_cancelled"`. No new interfaces.

### F. Journey tests (NEW)
`test/workflows/sessions/session-dual-confirmation.journey.test.ts` — two journeys (confirm-and-pay; timeout-and-refund) per REQ-6 assertions, real services + real DB, committed fixtures, `afterAll` cleanup sweep; notification publication spied (never real channels). Completed-row fixture stamped directly via repo (fixture-scope write, not guard-bypass in product code).

## API Contracts

No new GraphQL fields. Existing surface verified against committed SDL assertions (`test/schema-surface.test.ts:1349`): `confirmSessionCompletion(id: ID!): Session!` — unchanged. Cron REST route contract unchanged (`{ data: { cancelled, refunded }, requestId }`). Permission matrix = UX table above.

## Error Handling & Security

| Case | Code | Producer |
|---|---|---|
| Foreign/nonexistent session confirm | `SESSION_NOT_FOUND` (oracle-safe) | `session-lifecycle.confirmation.ts:rejectUnknownCaller` (EXISTING) |
| Student confirms started/disputed row | `SESSION_INVALID_TRANSITION` | `resolveSettledOrConflict` (EXISTING) |
| Unreadable refund lane | fail-closed throw, full sweep rollback | `transitions.ts:refundHeldLaneToProvenance` (EXISTING) |
| Cron auth fail | `UNAUTHORIZED` envelope / bare 404 | route (EXISTING) |
| Malformed id | pre-DB `VALIDATION` | `assertPositiveSafeSessionId` (EXISTING) |

i18n: all denial copy via `getServerTranslations`; notification copy via typed namespace keys — no hardcoded strings.

## Testing Strategy

- **Repo layer:** branch coverage on `sweepExpiredCompletedOnce` boundary instants (cutoff equality — strict `<` consistent with existing sweeps), no-lane rows, zero rows. `runInRollback` + `tx` everywhere.
- **Service layer:** two-leg sweep composition counts; fail-closed rollback; prompt emission exactly-once on completion (and NOT on idempotent repeat). External channels mocked.
- **Journey:** REQ-6 (confirm-and-pay, timeout-and-refund).
- **Chaos (Tier 3):** concurrent confirm-vs-sweep race asserted via `Promise.allSettled` — exactly one financial outcome.
- Layer rules per tasks-template: db tests rollback-wrapped; GraphQL surface already covered (schema-surface test asserts the mutation); no E2E needed (no UI delta).
