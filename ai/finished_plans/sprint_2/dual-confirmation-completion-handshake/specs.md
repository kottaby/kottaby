# Requirements — Dual-Confirmation Completion Handshake (24h Timeout)

**Plan Directory:** `ai/plans/sprint_2/dual-confirmation-completion-handshake/`
**Outcome Directory:** `ai/plans/sprint_2/dual-confirmation-completion-handshake/outcome/`
**Ticket:** `docs/planning/TICKETS.md` — `Dual-Confirmation Completion Handshake (24h Timeout)` (line 1654)
**Sprint:** 2 (per `| **Sprint** | 2 |` row of the ticket table; Owner Stream Dev 3)
**Decision Refs:** B.2 (24h timeout), B.18 (disputed status), FR-5.5, INV-S3
**Version:** 1.0 · **Date:** 2026-09-05

---

## Introduction

A session holds one allowance unit of a student's balance in escrow from the moment of booking (hold-as-debit ruling). That escrow may only be consumed — i.e. the teacher actually paid — when **both** parties have confirmed completion: the teacher marks the lesson complete and the student confirms satisfactory completion. If the student never confirms within a 24-hour window, the session auto-cancels and the held unit returns to the lane it came. The student may instead dispute, sending the session to admin arbitration (B.18).

**Behavioral ground truth already in the tree (verified 2026-09-05):** the schema columns (`confirmed_by_student_at`, `confirmed_by_teacher_at`, `confirmation_deadline` — `backend/db/schema/classes/session.ts:68-70`), the `session_status` enum with `disputed` (`backend/db/schema/enums.ts:23`), `SessionLifecycleService.completeSession/confirmSessionCompletion/sweepExpiredSessions/openSessionDispute` (`backend/services/classes/session-lifecycle.service.ts:241,521,554,352`), the wallet-credit slice (`backend/services/classes/session-lifecycle.confirmation.ts`), the GraphQL mutation `confirmSessionCompletion` (`backend/graphql/mutation/classes/session-lifecycle.mutation.ts:293`), the cron route `app/api/cron/sweep-sessions/route.ts`, and the student UI confirm hook (`frontend/views/student/sessions/useStudentSessionConfirm.ts`) all EXIST.

**The verified gaps this plan implements:**
1. The timeout sweep cancels only `scheduled` rows (`sweepExpiredScheduledOnce`, `session.repository.ts:409`) — there is NO sweep leg for `completed` rows whose student confirmation is 24h overdue (ticket AC 3).
2. **Zero notifications** exist for the handshake: no "please confirm" prompt to the student after teacher completion, and no auto-cancel notice (ticket ACs 1 & 3 — "student is notified to confirm" / "the student is notified").
3. No cross-actor **journey test** covers the confirm → credit / timeout → refund paths end-to-end.
4. `docs/sessions/session-lifecycle.md` still labels dual confirmation ""-pending and must be updated to the implemented contract.

### Feature Summary
Complete the dual-confirmation handshake: post-completion 24h timeout sweep with same-lane refund, student/teacher notification waves, and journey-level proof.

### Business Value
Escrowed money can never be stranded: every completed session terminates in exactly one of {student-confirmed → teacher paid, timeout → student refunded, dispute → admin arbitration}. Trust surface for students; revenue recognition for teachers.

### Scope
- **In scope:** `completed`-row timeout sweep leg; same-lane refund reuse; two new notification waves (completion prompt → student; auto-cancelled → student); i18n keys (en/ar); journey tests; canonical doc update.
- **Out of scope:** ticket-side wallet ledger accounting refinements (owns escrow accounting depth); admin dispute queue UI (owns `listAdminDisputedSessions`); the pre-start request-expiry sweep leg (already shipped via `sweepExpiredScheduledOnce`); report submission gating.

---

## Requirement 0: Pre-Implementation Baseline & Execution Protocol

**User Story:** As an executing agent, I need a recorded error baseline and persistent outcome knowledge, so new issues are distinguishable from pre-existing ones and research is never repeated.

1. WHEN implementation begins THEN the agent SHALL record `bun tsgo`, `bun biome:check`, and lint baselines into `/tmp/baseline-*` and write `ai/plans/sprint_2/dual-confirmation-completion-handshake/outcome/0-baseline-outcome.md`.
2. WHEN a task starts THEN the agent SHALL read ALL files in the outcome directory.
3. WHEN a task completes THEN the agent SHALL write `outcome/<task-id>-outcome.md` and check the task box in `tasks.md`.
4. WHEN any file is modified THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 before proceeding.
5. WHEN a subtask is marked complete THEN the semantic review checklist SHALL have been executed.

## Requirement 0.5: Translation & Enum Compliance

**User Story:** As a developer, I want compile-time-safe i18n and enum usage so errors surface at build time.

1. WHEN a notification wave is authored THEN title/body keys SHALL be added to `shared/locale/types/notifications/index.ts`, `shared/locale/en/notifications/index.ts`, and `shared/locale/ar/notifications/index.ts` — all three, or the parity test fails.
2. WHEN service code throws user-facing errors THEN it SHALL use `getServerTranslations(locale)` from `@/shared/locale/server-graphql` — never hardcoded strings.
3. WHEN an enum is used at runtime THEN it SHALL be a value import (`import { SessionStatus }`), never `import type`, never a string literal.

---

## Requirement 1: Teacher Confirmation Stamp (Precondition — EXISTING)

**User Story:** As a teacher, I want to mark a started session complete, so the student is asked to confirm and I may be paid.

1. WHEN the owning certified teacher calls `completeSession` on a `started` session THEN the system SHALL set `status=completed`, `ended_at`, `confirmed_by_teacher_at` in one guarded UPDATE (the certification `EXISTS` is fused in) — `completeSessionOnce` (`session.repository.ts:163`), composed at `session-lifecycle.service.ts:241`.
2. IF the teacher is decertified THEN the system SHALL throw `TEACHER_NOT_CERTIFIED` (probe-driven classification, `rejectTransitionMiss`).
3. IF the caller is not the owning teacher or the row doesn't exist THEN the system SHALL throw the oracle-safe identical `SESSION_NOT_FOUND`.
- **Priority:** High · **Status:** EXISTS (verified — no code change; REQ-1 provenance row for the state machine).

## Requirement 2: Student Confirmation + Escrow Consumption (EXISTING)

**User Story:** As a student, I want to confirm my completed session, so the teacher is paid.

1. WHEN the student caller confirms a `completed` session whose hold is marked THEN one guarded UPDATE SHALL write `confirmed_by_student_at` and flip `fee_held=false` (`confirmStudentCompletionOnce`, `session.repository.ts:369`), AND in the SAME transaction the teacher wallet SHALL be ensured and credited exactly once via `WalletRepository.ensureWalletOnce` + `creditEarningOnce` (`session-lifecycle.confirmation.ts:38-46`).
2. WHEN the student re-confirms, or the teacher confirms, or admin arbitration already consumed the hold THEN the current row SHALL be returned with ZERO financial writes (idempotent no-op).
3. IF the row's `fee` is null while hold-marked THEN the flow SHALL fail closed (`session-lifecycle.confirmation.ts:111-118`).
4. WHEN a non-participant attempts confirmation THEN the identical `SESSION_NOT_FOUND` oracle SHALL answer.
- **Priority:** High · **Status:** EXISTS (INV-S3 enforced by construction).

## Requirement 3: 24h Post-Completion Timeout — Auto-Cancel + Refund (NEW)

**User Story:** As a student, I want my held funds returned automatically if I never confirm, so money is never stranded.

1. WHEN a session row is `completed` with `confirmed_by_student_at IS NULL` AND `confirmed_by_teacher_at + 24h < now` THEN the sweep SHALL cancel it: one guarded batch UPDATE sets `status=cancelled`, `fee_held=false`, `updated_at` and RETURNS the rows (new repo primitive `sweepExpiredCompletedOnce`).
2. WHEN a swept row carries a recorded `held_balance_lane` THEN the held unit SHALL be refunded to that SAME lane once, on the sweep transaction, via the existing `refundHeldLaneToProvenance` primitive (`session-lifecycle.transitions.ts:209`) — lane provenance is never rewritten.
3. IF a lane value is unreadable THEN the sweep SHALL fail closed and the whole sweep transaction SHALL roll back (existing fail-closed contract).
4. WHEN the sweep runs a second time THEN it SHALL match zero rows (idempotent).
5. WHEN the sweep runs THEN each swept session's student SHALL be notified exactly once (REQ-5).
- **Priority:** High · **Complexity:** Medium
- **Boundary rule:** the 24h post-completion window is measured from `confirmed_by_teacher_at` (sweep-time arithmetic), NOT by re-arming `confirmation_deadline` — B.2's "written at creation, never re-armed" ruling is preserved (`docs/sessions/session-lifecycle.md` §2.2).

## Requirement 4: Dispute Path (EXISTING — precondition wiring narrows)

**User Story:** As a student or teacher, I want to dispute a session, so an admin arbitrates.

1. WHEN either participant opens a dispute on a `scheduled` or `started` session THEN one guarded UPDATE SHALL set `status=disputed`, `dispute_reason`, `disputed_at` (`openDisputeOnce`, `session.repository.ts:240`) and the escrow hold SHALL remain frozen (untouched).
2. WHEN an admin resolves a dispute THEN the row SHALL move to exactly one terminal state (`cancelled` + same-lane refund, or `completed` + hold consumed, `session-lifecycle.service.ts:418`).
3. IF the ticket's AC "student disputes a completed session" is exercised THEN the system SHALL — per the existing canonical state machine (`session.ts:16-20`, disputed reachable only from pre-completion states) — reject it with `SESSION_INVALID_TRANSITION`; the canonical ruling is confirmed in this plan's Design (D-2): dispute-before-completion is the ticket text's operative path for the 24h window.
- **Priority:** High · **Status:** EXISTS (state guard unchanged; design ruling documents the ticket-vs-code divergence).

## Requirement 5: Handshake Notification Waves (NEW)

**User Story:** As a student, I want to be told when a session needs my confirmation and when it was auto-cancelled, so I never lose track of my money.

1. WHEN the teacher's completion stamp commits THEN the system SHALL emit ONE notification `session_completion` → student (title/body from the notifications locale namespace; deterministic idempotency key `session-completion-prompt:{sessionId}`).
2. WHEN a timeout sweep cancels a session THEN the system SHALL emit ONE notification `session_completion` → student per swept row (key `session-completion-autocancel:{sessionId}`).
3. WHEN emitters are invoked from within a caller transaction THEN they SHALL return a delivery receipt and the CALLER SHALL publish via `NotificationEngine.publishReceipts` post-commit (receipt contract of `SessionRequestNotificationService`, `session-request-notification.service.ts:12-21`); the internal emitters SHALL perform no authorization.
4. WHEN recipient copy is composed THEN the recipient's locale SHALL be used (mirroring `resolveWaveContext` + per-locale emit at `session-request-notification.service.ts:57-125`), names escaped into copy verbatim per the raw-markup posture of the existing waves.
- **Priority:** High · **Complexity:** Medium
- **Placement ruling:** new kinds extend `SessionRequestWaveKind` (`backend/types/classes/session-notification.types.ts:5-11`) → the union becomes 8 kinds; emitters are added to `SessionRequestNotificationService` (NOT a new service) because the wave-compose machinery (context read, intent label, per-recipient locale, receipt) is identical — a new service would duplicate it.

## Requirement 6: Journey Proof (NEW)

**User Story:** As a maintainer, I want a committed journey test proving teacher→completes, student→confirms, and timeout→refund interoperate over a real DB.

1. WHEN the confirm journey runs THEN the test SHALL assert: completed row + prompt-notification receipt; student confirm → both stamps present, `fee_held=false`, wallet `total_earning` increased by exactly the fee; re-confirm → zero delta.
2. WHEN the timeout journey runs THEN the test SHALL fabricate a `completed` row with `confirmed_by_teacher_at` older than 24h, run the sweep, and assert: row cancelled, lane balance +1 to the provenance lane, exactly one auto-cancel notification, sweep re-run matches zero.
3. Tests SHALL live in `test/workflows/sessions/` with committed fixtures + tracked `afterAll` cleanup, NO `runInRollback`, per `test/workflows/AGENTS.md` / `docs/testing/workflow-journey-tests.md`.

## Requirement 7: Canonical Documentation Update (NEW)

1. WHEN implementation lands THEN `docs/sessions/session-lifecycle.md` §2.1/§3 SHALL be updated: `disputed` producer surface confirmed, the dual-confirmation rows and the two-sweep-leg model documented, and the "pending" annotations resolved.
2. WHEN docs change THEN the root `AGENTS.md` Important References line for the doc SHALL stay accurate (already present — verify description string only).

---

## UX/Navigation Requirements

No new routes or navigation items. The confirm affordance already exists in the student sessions view.

| Surface | Purpose | Roles | Evidence |
|---|---|---|---|
| Student sessions list (existing route) | Row-scoped "Confirm" CTA with in-flight slot bookkeeping and error-surface mapping | STUDENT | `frontend/views/student/sessions/useStudentSessionConfirm.ts` (hook) |
| Notifications inbox | Receives `session_completion` prompt/auto-cancel items | STUDENT | existing inbox |

**No-UI ruling:** This ticket adds no UI. The only user-facing delta is two notifications arriving in the existing inbox. Teacher-side CTA (`completeSession`) belongs to other tickets and is unchanged. Admin arbitration UI likewise.

## Cross-Actor Workflow Journey

### Actor Table
| Actor | Role | Can Do | Cannot Do |
|---|---|---|---|
| Teacher | `teacher` (certified) | start, complete own session | confirm (idempotent no-op), dispute others' sessions |
| Student | `student` | confirm own completed session, dispute own session | complete, see others' sessions |
| System | cron route (bearer-gated) | cancel overdue rows, refund, notify | act on non-expired rows |
| Admin | role-gated | resolve disputes | (unchanged by this plan) |

### Ordered Steps
1. Teacher → `completeSession` → row `completed`, `started_at..ended_at` span closed, `confirmed_by_teacher_at` set → **student receives confirm-prompt notification**.
2. Student → `confirmSessionCompletion` → `confirmed_by_student_at`, `fee_held=false`, teacher wallet credited exactly once → both parties observe settled state.
3. System (teacher stamp + 24h) → sweep → overdue row `cancelled` + same-lane refund → **student receives auto-cancel notification**.
4. Either participant (pre-completion) → `openSessionDispute` → `disputed`; admin arbitration (existing surface).

### Observer-perspective EARS
- WHEN teacher completes THEN student SHALL observe a confirm-required notification AND the row remains payable-but-unpaid.
- WHEN student confirms THEN teacher SHALL observe (via balance/list reads) the wallet credit of exactly the session fee.
- WHEN 24h elapse with no confirmation THEN student SHALL observe status `cancelled`, lane balance restored, and an auto-cancel notification.
- IF a foreign caller touches any step THEN system SHALL answer the oracle-safe `SESSION_NOT_FOUND`.

## Non-Functional Requirements

- **Idempotency:** every transition is a guarded single-statement UPDATE; re-runs match zero rows; notification keys deterministic.
- **Concurrency:** confirm credit slice is atomic with the stamp flip (same tx); sweep refunds ride ONE transaction (fail-closed).
- **Security:** participant predicates fused in SQL; oracle-safe denials; cron route timing-safe bearer + bare-404 mode gates (existing, unchanged).
- **Observability:** `logger.logDomainError` on every classified denial; `logger.error` on fail-closed financial anomalies.

## Success Criteria

- [ ] All REQ-3 acceptance criteria pass (new sweep leg, refund, idempotence, notification).
- [ ] All REQ-5 waves emit with receipts and locale-correct copy.
- [ ] REQ-6 journey tests green.
- [ ] Traceability matrix: every REQ-1..7 has ≥1 task in `tasks.md`; zero MISSING from the grep audit.
- [ ] `bun run test/scripts/run-test.ts test/workflows/sessions/...` green; per-file sub-loop exits 0 on every touched file.

## Glossary

| Term | Definition |
|---|---|
| Dual confirmation | Teacher stamp (`confirmed_by_teacher_at`) + student stamp (`confirmed_by_student_at`); only both consume escrow |
| Hold-as-debit | One allowance unit debited at booking; `fee_held=true` marks escrow; refund re-increments the same lane |
| Provenance lane | `held_balance_lane` records `trial|hifz|tajweed`; never rewritten (`session.ts:65`) |
| Wave kind | `SessionRequestWaveKind` discriminant driving notification composition |
| Receipt | Engine emit result published post-commit via `publishReceipts` |
