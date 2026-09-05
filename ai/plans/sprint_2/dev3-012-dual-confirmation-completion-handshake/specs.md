# DEV3-012 — Dual-Confirmation Completion Handshake (24h Timeout) — Requirements (Specs)

- **Ticket:** DEV3-012 — Dual-Confirmation Completion Handshake (24h Timeout)
- **Owner Stream:** Dev 3 · **Sprint:** 2 · **Story Points:** 5 · **Blocked By:** DEV3-004
- **Plan Directory:** `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/`
- **Decision Refs:** B.2 (24h timeout), B.18 (disputed status), FR-5.5, INV-S3
- **Invariants:** INV-S1..S8 (esp. INV-S3), INV-B4, INV-B8, INV-W4, B.2, B.4, B.18, A.8, A.10, C.5

---

## 1. Executive Summary & Problem Statement

### Purpose
Session payment escrow is only credible if money moves exactly once and only when both participants agree the session happened. DEV3-004 shipped the lifecycle spine (create → start → complete → cancel) with hold-at-request and student confirmation (`confirmSessionCompletion`) that consumes the hold and credits the teacher's wallet. DEV3-012 rounds out the **completion handshake**: the timeout path (24h with no student confirmation → auto-cancel + same-lane refund + notification), the post-completion dispute path (student disputes a completed session → `disputed`), and the notification waves that tell each actor what just happened.

### Persona Workflows
- **Student:** sees a completed session, is prompted to confirm; if they do nothing and the 24h window lapses, money returns to the same lane it came from and they are told why.
- **Teacher:** completes a started session; learns when the student confirmed (meaning their wallet was credited), or when the window lapsed; can raise a dispute on a completed session.
- **Admin (boundary):** arbitration of disputed sessions is **DEV3-022** (sprint 3). DEV3-012 ends at `status = disputed` + admin-visible dispute queue read (already shipped by DEV3-005-era work) + admin notification of a newly disputed session.
- **System (cron):** the periodic sweeper cancels expired sessions and releases holds idempotently.

### Business Value
Prevents escrow limbo (money held indefinitely), produces an auditable dual-confirmation trail (INV-S3/INV-W4 gate every earning row on both stamps), and gives the dispute machinery a producer for `disputed` rows that DEV3-022 arbitrates.

### Actors
Student (participant, confirms / disputes), Teacher (participant, completes / observes), System (cron sweeper), Admin (observer-only here; arbitration out of scope).

### Explicit Non-Goals
- Admin arbitration decisions (refund / partial / uphold) — **DEV3-022**.
- Wallet transaction anatomy, `total_earning` maintenance, wallet UI — **DEV3-013/DEV3-014/DEV3-015**.
- Plan-linked dynamic pricing — DEV3-013 (interim constant `SESSION_FEE_*`).
- Booking, starts, plain cancels, idempotency-claim mechanics — shipped by DEV3-004; do not modify their predicates except where a task below says EXTEND.
- Session report/homework — **DEV3-006**.
- Any new schema columns or enum values — all columns (`confirmed_by_teacher_at`, `confirmed_by_student_at`, `confirmation_deadline`) and enum values (`disputed`) already exist in `backend/db/schema/classes/session.ts`.

### Ground-Truth Existing Surface (verified in code — VERIFY-THEN-CLAIM)
- `backend/db/schema/classes/session.ts` — all handshake columns EXIST.
- `SessionRepository.completeSessionOnce` (writes `status=completed`, `endedAt`, `confirmedByTeacherAt`), `confirmStudentCompletionOnce` (writes `confirmedByStudentAt`, `feeHeld=false`, exactly-once guarded), `sweepExpiredScheduledOnce` (batch guarded UPDATE on `status=scheduled AND confirmation_deadline < now`, clears `fee_held`), `openDisputeOnce` (scheduled|started → disputed), `resolveDisputeCancelOnce`/`resolveDisputeCompleteOnce`, `findTransitionProbe`. All EXIST.
- `SessionLifecycleService.completeSession` / `confirmSessionCompletion` / `sweepExpiredSessions` / `resolveSessionDispute` EXIST; financial slice in `session-lifecycle.confirmation.ts` (ensureWalletOnce + creditEarningOnce, same tx) EXISTS.
- `app/api/cron/sweep-sessions/route.ts` calls `sweepExpiredSessions` — EXISTS.
- `SessionRequestNotificationService` emitters cover `teacher_request`, `outcome_accepted/declined/auto_rejected/queued/alternatives_offered` — existence; **no completion/dispute waves**.
- `openDisputeOnce` predicate covers `scheduled | started` only — **NOT `completed`** (gap).
- `sweepExpiredScheduledOnce` predicate is `status=scheduled` only — **completed-unconfirmed rows are never swept** (gap).
- Frontend documents `confirmSessionCompletionMutationDocument` + `useStudentSessionConfirm`, student Sessions screen set (`SessionRowLifecycleCtas`, `SessionDisputeConfirmDialog`), teacher Sessions screen — EXIST (DEV3-004/005/006 lineage); completion-handshake affordances (countdown, dual-confirm status chips) partially present.

**What DEV3-012 NEW work is:** (a) completed-row sweep predicate + service method; (b) completed-row dispute predicate; (c) completion-handshake notification waves (student-prompt-after-complete, teacher-confirmation-ack, timeout-refund notices, dispute-opened notices); (d) UI polish for the handshake states; (e) cross-actor journey tests.

---

## 2. Acceptance Criteria (EARS)

### 2.1 Baseline & Foundational Preparation

- **REQ-001** WHEN implementation begins THEN the executing agent SHALL record a baseline of `bun tsgo`, `bun run lint` (via lint service JSON), `bun biome:check`, and `bunrun test:services` (classes suite) counts in `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/outcome/baseline-outcome.md` and SHALL initialize `deferred-items.md` from the ledger template.
- **REQ-002** IF code is touched THEN enum members SHALL be imported as **value imports** from `backend/enum/...` (never string literals re-declared), and all user-facing strings SHALL resolve through the compile-time locale system (`getServerTranslations(locale)` in services, `ctx.t(...)` in resolvers, `defineNamespace` handles (`useAppTranslation(Sessions)`/`useAppTranslation(Notifications)`) in client components — never `next-intl`, never string namespace arguments on the launcher hook).
- **REQ-003** WHEN any type is needed THEN it SHALL come from `@/backend/types` (`SessionSelectType`, `SessionReturnType`, `DBTransaction`, notification contract types); local `.types.ts` in services, and local type declarations in Pothos files, SHALL remain prohibited.

### 2.2 Core Feature Logic / Happy Paths

- **REQ-010** WHEN the teacher (owner, certified) completes a `started` session THEN the system SHALL transition the row to `completed` exactly once (existing `completeSessionOnce`), SHALL set `endedAt` and `confirmedByTeacherAt` from one captured instant, and SHALL NOT re-arm `confirmationDeadline` (B.2: armed at creation).
- **REQ-011** WHEN the teacher completes the session THEN the system SHALL emit a "completion pending your confirmation" notification to the **student** (new emission wave), published after commit.
- **REQ-012** WHEN the student confirms a `completed` session THEN the system SHALL set `confirmedByStudentAt` and `feeHeld=false` in one guarded UPDATE (existing `confirmStudentCompletionOnce`), and in the SAME transaction SHALL credit the teacher wallet with `fee` exactly once (existing slice) — the student stamp + hold-consumption + wallet credit are all-or-nothing.
- **REQ-013** WHEN the student confirmation commits THEN the system SHALL notify the **teacher** that confirmation is complete and the earning was credited (new emission wave).
- **REQ-014** WHEN the 24h confirmation window lapses on a `scheduled` session THEN the sweeper SHALL auto-cancel it and refund the held fee to the recorded `held_balance_lane` (existing behavior — preserved).
- **REQ-015** WHEN the 24h window lapses on a `completed` session whose `confirmedByStudentAt` is still `NULL` AND `feeHeld = true` THEN the sweeper SHALL auto-cancel it exactly the same way (NEW predicate arm), refunding to the recorded lane **as if the confirm never happened** — per ticket AC "24 hours pass without student confirmation → auto-cancelled; held funds released".
- **REQ-016** WHEN the sweeper cancels a row (either arm) THEN the system SHALL emit a timeout/auto-refund notification to the student, and for the completed-arm additionally to the teacher (new emission wave).
- **REQ-017** WHEN a participant disputes a `scheduled` or `started` session THEN existing `openDisputeOnce` behavior SHALL be preserved unchanged.
- **REQ-018** WHEN the student (or teacher) disputes a `completed` session THEN the system SHALL transition it to `disputed` exactly once (NEW predicate arm on `status=completed`), SHALL persist trimmed `disputeReason` (≤500 chars) and `disputedAt`, and SHALL NOT touch `feeHeld` (the hold stays frozen until admin resolution per existing hold-frozen-on-dispute rule).
- **REQ-019** WHEN a dispute opens on a completed session THEN the system SHALL notify the counterparty and SHALL enqueue an admin-facing notification that the dispute queue has a new item.
- **REQ-020** WHEN any guarded UPDATE misses (zero rows) THEN the service SHALL classify via `findTransitionProbe` and throw the oracle-safe error (`SESSION_NOT_FOUND` for foreign/nonexistent; the state-conflict error for participant-on-wrong-state), never distinguishing foreign-vs-missing rows.
- **REQ-021** WHEN a participant re-fires any handshake mutation that already succeeded (double confirm, double dispute, re-sweep) THEN the second call SHALL be a no-op-or-conflict classified exactly as today, never producing a second financial write, never overwriting a recorded reason/stamp.
- **REQ-022** WHEN the completed-arm sweeps many rows THEN each row SHALL be refunded through the ONE shared same-lane refund primitive (`refundHeldLaneToProvenance` lineage), each row refunded at most once, in ONE transaction per sweep call, with honest `{cancelled, refunded}` counts.

### 2.3 Security, Authorization & Tenancy

- **REQ-030 (BOLA/IDOR):** WHEN a caller who is not the session's student/teacher hits any handshake mutation (complete/confirm/dispute) or read THEN the system SHALL resolve to the identical oracle answer (`SESSION_NOT_FOUND` / `null`) — a foreign id is indistinguishable from a nonexistent id.
- **REQ-031 (BFLA):** WHEN a non-admin caller invokes the dispute-resolution mutation THEN the GraphQL `authScopes` SHALL reject it (FORBIDDEN class) before any service work; the service ALSO re-checks admin role server-side (defense-in-depth, existing pattern).
- **REQ-032 (BOPLA):** WHEN persisting any handshake write THEN the code SHALL map columns field-by-field; no `{ ...input }` spread into Drizzle sets/inserts; inputs carry only `id` and optional `reason`.
- **REQ-033 (Governance):** WHEN a governed (deleted/blocked/suspended) user attempts a handshake action THEN the service SHALL deny it via the assertion layer — re-verify `assertUserActive` behavior for confirm/dispute paths and record a decision for the cron path (system caller has no user context).
- **REQ-034 (Rate limiting):** IF a new public mutation surface is added THEN it SHALL inherit the existing mutation throttling conventions (no bespoke limiter in this ticket).

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040** Every state transition SHALL be a **single guarded UPDATE** whose predicate includes row identity + caller ownership + source state; fan-out (refund, wallet credit, notifications) SHALL NOT widen the predicate window.
- **REQ-041** WHEN the student confirms THEN the student stamp, hold release, wallet ensure, earning insert, and wallet increment SHALL commit in one transaction (existing pattern reinforced by journey test).
- **REQ-042** WHEN the cron sweeper runs concurrently with a student confirmation of the same row THEN exactly one of them SHALL win the guarded write; the loser SHALL read a zero-row miss and SHALL NOT double-refund or double-credit (journey-test race via Promise.allSettled).
- **REQ-043** WHEN the sweeper processes a batch THEN the deadline comparison SHALL use one captured `now` shared by the predicate and all stamps, and the sweep SHALL NOT mutate `confirmationDeadline` (B.2 — never re-armed).
- **REQ-044** Idempotency SHALL be structural (predicates), not check-then-act: no read-then-write sequences in any handshake path.

### 2.5 Validation & Localized Error Contracts

- **REQ-050** WHEN input validation fails (non-positive-safe-int id, empty/oversized reason) THEN the system SHALL raise `VALIDATION` before any DB write.
- **REQ-051** WHEN a participant attempts an illegal transition (confirm a `scheduled` row, confirm twice, dispute a `disputed` row, complete an already-completed row) THEN the system SHALL raise the session's state-conflict error with `extensions.code = SESSION_INVALID_TRANSITION` (existing mapping convention) and localized copy from `getServerTranslations(locale)`.
- **REQ-052** All new/updated strings SHALL live in the compile-time locale tree (arabic & english), and new notification copy SHALL follow `SessionRequestNotificationService`'s recipient-locale composition pattern.
- **REQ-053** GraphQL errors SHALL map DomainError subclasses to `extensions.code` per `docs/graphql/error-handling-contract.md` and `docs/graphql/domain-error-extensions-code.md`.

### 2.6 GraphQL & Frontend Contracts

- **REQ-060** GraphQL object payloads SHALL select `id` first; timestamps SHALL expose `DateTime` scalar (existing session Pothos surface already complies — preserve).
- **REQ-061** Existing documents (`completeSessionMutationDocument`, `confirmSessionCompletionMutationDocument`, dispute mutation document(s)) SHALL remain source-of-truth; any new field/mutation must be added via the shared documents module and `bun codegen` regenerated.
- **REQ-062** Resolver auth scopes SHALL be the existing participants/admin mapping — no widened scopes.

### 2.7 Test Coverage Requirements

- **REQ-070** Repository & service tests SHALL use `runInRollback` + pass `tx` to every repo call (existing suites extended, not rewritten).
- **REQ-071** 4-Tier coverage per modified surface: Tier 1 branch coverage of new predicate arms; Tier 2 boundaries (reason length 0/1/500/501, deadline exactly-now vs now+1ms — strict `<` semantics); Tier 3 concurrency (confirm ‖ sweep race, double-confirm, double-dispute) via Promise.allSettled; Tier 4 security (foreign caller oracle, governed user, BOPLA junk keys).
- **REQ-072** Cross-actor journey tests SHALL live in `test/workflows/sessions/`; committed fixtures, tracked cleanup, NO `runInRollback`; launched via `bun run test/scripts/run-test.ts`.
- **REQ-073** Existing suites (`session-lifecycle.service.test.ts`, disputes journeys, sweep route test) SHALL keep passing byte-for-byte in behavior; only additive expectations allowed.

### 2.8 Documentation & Knowledge Gates

- **REQ-080** `docs/sessions/session-lifecycle.md` SHALL be updated to document the completed-arm sweep, completed-row dispute, and new notification waves (consumer guidance rows for DEV3-013/014/021/022 updated where ownership shifts).
- **REQ-081** All findings/learnings SHALL be captured in `ai/plans/sprint_2/dev3-012-dual-confirmation-completion-handshake/outcome/*.md`, and knowledge propagation (AGENTS.md references where genuinely permanent) happens in the final task.

### 2.9 Cross-Actor Workflow Scenarios (Journeys) — MANDATORY

**Actor table**

| Actor | Role | May | May NOT |
|---|---|---|---|
| Student | participant | confirm completed session (own), dispute own session (any live/completed), receive notices | complete, sweep, arbitrate, see other students' sessions |
| Teacher | participant | complete started session (own, certified only), dispute own session, receive notices | confirm, sweep, arbitrate |
| System | cron sweeper | auto-cancel expired rows + refund same lane + notify | write audit rows, re-arm deadline |
| Admin | observer (this ticket) | see dispute queue (existing read), receive dispute-opened notice | arbitrate (DEV3-022) |
| Foreign user | any other role | nothing | any read/write on the session (oracle collapse) |

**Journey J1 — Happy dual confirmation (existing, reconvened as regression-guard wave):**
1. Teacher completes started session → `completed` + teacher stamp + deadline unchanged → student notified (new wave).
2. Student confirms → student stamp + `feeHeld=false` + wallet ensure + earning row + wallet increment, one tx → teacher notified (new wave).
3. Replays: second confirm → no-op/conflict, no second credit.

**Journey J2 — Timeout auto-cancel & refund:**
1. Scheduled row deadline lapses → sweeper cancels, refund to recorded lane, student notified (already-swept row; notification wave new).
2. Completed row (teacher stamped, student silent) past deadline → sweeper cancels, refunds lane, student + teacher notified.
3. Second sweep → 0 rows; no second refund.

**Journey J3 — Completed-session dispute handoff:**
1. Student disputes a completed session (with/without prior dual confirmation) → `disputed`, reason+stamp persisted, hold frozen, counterparty + admin notified.
2. Double dispute → conflict; foreign dispute → oracle not-found; dispute queue read shows the row to admin.
3. Admin arbitration action itself → NOT executed here (DEV3-022); journey asserts only that the disputed row + notifications exist.

**Observer-perspective EARS:**
- **REQ-090** WHEN the teacher completes the session THEN the student SHALL see a confirm-prompt notification AND a confirm CTA on the session row.
- **REQ-091** WHEN the student confirms THEN the teacher SHALL see the row's confirmation state flip AND receive the earning-credit notice.
- **REQ-092** WHEN the window lapses unconfirmed (either arm) THEN both participants SHALL observe `status=cancelled` and the student SHALL observe the balance lane restored AND SHALL have been notified of the timeout refund.
- **REQ-093** WHEN a participant opens a dispute on a completed row THEN the counterparty SHALL observe `disputed` on the row AND an admin SHALL see the row in the dispute queue AND a dispute-opened notification SHALL exist.
- **REQ-094** WHEN a foreign user probes any handshake surface THEN they SHALL never distinguish "exists but not yours" from "does not exist".

---

## 3. System Decisions & State Machine Invariants Alignment

| Plan item | Spec anchor | Alignment |
|---|---|---|
| Deadline `now + 24h` armed **at creation**, never re-armed | B.2 (`open-decisions-and-gaps.md` §B.2); `docs/sessions/session-lifecycle.md` §"Decision binding" | Sweeps both `scheduled` and the new `completed`-unconfirmed arm against the same column. |
| Auto-cancel + same-lane refund on timeout | B.2, B.4; INV-B8 | `_refundHeldLaneToProvenance` lineage; `held_balance_lane` is permanent provenance. |
| Earning only on dual confirmation | INV-S3, INV-W4 | Existing confirmation slice; REQ-041 atomicity. |
| Disputes enter `disputed`, admin arbitrates later | B.18; DEV3-022 forward contract | Predicate arm added for `completed`; financial resolution NOT here. |
| `disputed` in `session_status` enum | B.18 | Already registered — no enum change. |
| Participant-only reads/mutations with oracle collapse | REQ-030 ruling in `docs/sessions/session-lifecycle.md` §7 | REQ-030/REQ-094. |
| Governance denials via DomainError taxonomy | `docs/graphql/error-handling-contract.md` | REQ-051/053. |
| `SESSION_CONFIRMATION_WINDOW_MS` = 86_400_000 (booking) | B.2 | unchanged. |

---

## 4. Cross-Layer Traceability Matrix (REQ → Invariant → Service → Resolver → UI → Tests)

| REQ | Invariant | Service | Repo / Slice | Resolver / Route | UI | Tests |
|---|---|---|---|---|---|---|
| REQ-010..013 | INV-S3, INV-W4 | SessionLifecycleService.completeSession / confirmSessionCompletion | completeSessionOnce, confirmStudentCompletionOnce, confirmation slice | session-lifecycle mutations | Teacher complete CTA; student confirm hook | session-lifecycle.service.test.ts; journey J1 |
| REQ-014..016, 022, 043 | B.2, B.4 | SessionLifecycleService.sweepExpiredSessions (+completed arm) | sweepExpiredScheduledOnce (+arm), refund primitive | /api/cron/sweep-sessions | deadline countdown chip | sweep route test; journey J2 |
| REQ-017..019 | B.18 | SessionLifecycleService.openDispute(+arm) | openDisputeOnce (+arm) | dispute mutation | SessionDisputeConfirmDialog | journey J3; repo tests |
| REQ-011,013,016,019 | A.4 | SessionRequestNotificationService (+waves) or sibling completion-notifications service | NotificationEngine | — | Notifications bell/surface | notification service tests; journeys |
| REQ-030..034 | REQ-030 ruling | services (all) | predicates | authScopes | — | security tier in every suite |
| REQ-050..053 | error contract | services | — | resolvers | — | error mapping tests |
| REQ-060..062 | — | — | — | documents + codegen | views | schema-surface test; component tests |
| REQ-070..073 | — | — | — | — | — | this whole column |

---
