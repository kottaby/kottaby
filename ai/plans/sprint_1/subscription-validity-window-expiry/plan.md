# Technical Architecture & Implementation Design: Subscription Validity Window & Expiry

**Plan directory:** `ai/plans/sprint_1/subscription-validity-window-expiry/`
**Specs:** `ai/plans/sprint_1/subscription-validity-window-expiry/specs.md`
**Tasks:** `ai/plans/sprint_1/subscription-validity-window-expiry/tasks.md`
**Deferred-items ledger:** `ai/plans/sprint_1/subscription-validity-window-expiry/deferred-items.md`
**Outcomes:** `ai/plans/sprint_1/subscription-validity-window-expiry/outcome/`

## Document Information

- **Feature Name**: Subscription Validity Window & Expiry
- **Ticket**: Subscription Validity Window & Expiry (Sprint 1, Dev 1, 3 pts) — `docs/planning/TICKETS.md:540-581`; Blocked-By "Segregated Session Balance Crediting" (shipped); Decision Refs FR-2.4 / INV-B3 / INV-B6 (`TICKETS.md:579`)
- **Version**: 1.0 · **Date**: 2026-09-11
- **Author**: Spec Plan Generator (swarm — design author)
- **Reviewers**: plan-review gate (Phase 1.5)
- **Related Documents**: `docs/billing/subscription-purchase.md` (`:359-362` assigns window-end zeroing to this job), `docs/specs/state-machine-invariants.md` (A.9 state table `:124-135`, INV-B3 `:147`, INV-B4 `:148`, INV-B6 `:150`), `docs/graphql/error-handling-contract.md`, `docs/planning/TICKETS.md:583-631` (sibling Admin Subscription Management — bounded OUT), research digests `outcome/research-01..04` (all facts verified against the tree on 2026-09-11)

## 1. System Overview & Architecture

### 1.1 What this is

A non-UI, backend-only ticket that makes the already-written validity window **enforceable** in three moves:

1. **AC1 (EXISTING — lock-in only).** Activation already writes `end_date = start_date + plans.interval_days × MS_PER_DAY` via a single captured `now` in `SubscriptionActivationService` (`backend/services/billing/subscription-activation.service.ts:360-372`, `MS_PER_DAY` at `:96`). This ticket re-pins it with tests and changes nothing.
2. **AC2 (NEW).** An externally-triggered cron route `GET /api/cron/expire-subscriptions` runs `SubscriptionExpiryService.expireDue()`: one transaction, one captured `now`, one guarded batch UPDATE flipping `active → expired` for past-window rows, then per-(student, lane) guarded lane zeroing per Decision D2 (REQ-023).
3. **AC3 (NEW).** The booking debit ladder (`debitBookingLadder`, `backend/services/classes/session-lifecycle.booking.ts:95-116`) gains a lane-aware expiry gate in its failure branch, throwing `ValidationError("SUBSCRIPTION_EXPIRED", t.subscriptionExpired)` in precedence over the existing `INSUFFICIENT_BALANCE` throw at `:113` (Decision D3, REQ-034).

Out of scope (sibling/deferred): admin extend/renew/cancel/upgrade/downgrade and `audit_logs` writes (`TICKETS.md:583-631`), per-subscription attribution ledger (rejected option O2 below, ledger D1), any scheduler infrastructure (ledger D2), and any UI (REQ-060 ruling, §6).

### 1.2 Sequence diagram

```mermaid
sequenceDiagram
    participant SC as External scheduler
    participant RT as GET /api/cron/expire-subscriptions
    participant SV as SubscriptionExpiryService
    participant DB as Postgres (one tx)
    participant ST as Student (booking)
    participant BL as debitBookingLadder

    SC->>RT: GET + Bearer CRON_SECRET
    RT->>RT: bare 404 unless CRON_EXECUTION_MODE=external AND CRON_EXTERNAL_ENABLED=true
    RT->>RT: timing-safe SHA-256 digest compare (401 masked on mismatch)
    RT->>SV: expireDue()
    SV->>DB: withTransaction: now once; guarded UPDATE active→expired (end_date<=now) RETURNING
    SV->>DB: per expired row plan lane: guarded zeroing UPDATE (not covered by other active/pending sub)
    SV-->>RT: { expired, lanesZeroed }
    RT-->>SC: apiSuccessResponse envelope
    ST->>BL: book session
    BL->>DB: trial debit? success → done (INV-B3 exempt)
    BL->>DB: intent-lane debit? success → done
    BL->>DB: both missed: EXISTS uncovered expired sub on lane?
    BL-->>ST: SUBSCRIPTION_EXPIRED (422-family) | INSUFFICIENT_BALANCE
```

### 1.3 Key Design Decisions

| # | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| D1 | New cron route `app/api/cron/expire-subscriptions/route.ts` is a line-for-line sibling of `app/api/cron/sweep-sessions/route.ts` (GET-only; bare 404 unless `CRON_EXECUTION_MODE === "external"` AND `CRON_EXTERNAL_ENABLED === "true"` via `getEnv`; SHA-256 digest + `timingSafeEqual` bearer vs `CRON_SECRET`; `apiSuccessResponse`/`apiErrorResponse`; fixed `locale = "en"`); registered in `backend/lib/gateway/route-inventory.ts` as `{ path: "/api/cron/expire-subscriptions", classification: "envelope" }`; **no new env keys** | REQ-020; sweep-sessions is the single sanctioned cron pattern (research-03 §1); `CRON_SECRET` already pays the registration cost (research-03 §6 recommendation) | New env-key toggle (adds raw-`getEnv` recipe + `.env.example` churn for zero security gain); any in-process scheduler (none exists — `scripts/cron-worker.ts` is a stale package.json entry, research-03 §7) |
| D2 | **REQ-023 zeroing semantic = O1: conditional lane zeroing.** When the batch flip expires subscription S, the plan's `balance_lane` credited to the owning student is zeroed **only if** no other `active` (post-flip, in-window by construction) or `pending` subscription of that student credits the same lane. One guarded UPDATE per (student, lane) inside the same sweep transaction; `balance_trial` never touched (INV-B3) | Matches AC2 exactly in the dominant single-subscription case; never over-revokes under co-subscriptions; expressible as a single atomic guarded statement (`StudentRepository.zeroLaneIfNoCoveringSubscription`, §5.1); no schema churn — fits a 3-pt ticket. Full trade-off record in §2.1 | **O2** per-subscription attribution ledger — precise but new table + migration + crediting rewrite; deferred as future work (ledger D1). **O3** status-only (no zeroing) — explicitly rejected: fails AC2/INV-B3 |
| D3 | **REQ-034 denial ordering.** The expiry gate is inserted into `debitBookingLadder` (`session-lifecycle.booking.ts:95-116`) strictly inside the **double-debit-miss branch** (after `:106`, before the `INSUFFICIENT_BALANCE` throw at `:113`): trial debit → intent-lane debit → only when both miss, `hasUncoveredExpiredLane` probe → `SUBSCRIPTION_EXPIRED` else fall through to `INSUFFICIENT_BALANCE` | Deterministic; trial-exempt for free (trial debit succeeds first, gate never reached — REQ-033); zero added cost on the successful-booking hot path; single locale key; error precedence expired-over-insufficient per AC3. Full record in §2.2 | Gate before the intent-lane debit (would deny positive-but-unswept balances during sweep lag; adds a hot-path read); window-based gate replacing status (the sweep/lag contract already governs staleness — §5.2) |
| D4 | Zero GraphQL delta: no new operations, no authScope changes, no codegen. `StudentSubscription.status` already carries the registered `Expired` member (`frontend/graphql/generated/schema.graphql:1166-1172`); expired rows surface through `mySubscriptions` unchanged | REQ-051; schema enum and DB/TS enums are already aligned (`backend/db/schema/enums.ts:47-53` ↔ `backend/enum/billing/subscription-status.enum.ts:6-12`) | Adding an `expireSubscription` mutation (admin surface is the sibling's) |
| D5 | Sweep efficiency: new **partial index** `subscriptions_active_end_date_idx` ON `subscriptions(end_date) WHERE status = 'active'` — Drizzle `.where(sql`…`)` pattern already in the same file (`subscriptions.ts:53-55`); applied via `bun run db` push | REQ-022/§9: no `status`/`end_date` index exists today (`subscriptions.ts:51-55`); partial index keeps write cost near zero and scans tiny | Full composite index (larger write amplification for no query-shape gain); no index (seq-scan acceptable today but violates the NFR's stated approach) |
| D6 | Sweep = ONE transaction for the whole cohort (batch flip + all zeroings commit or roll back together); counts-only return `{ expired, lanesZeroed }`; no `audit_logs` writes (no system actor exists — `audit_logs.actor_id` NOT NULL, `backend/db/schema/audit/audit-logs.ts:30-47`) | REQ-025/reliability NFRs demand no half-swept cohort; REQ-052 reserves audit writing for the sibling ticket | Per-row transactions (allows a torn cohort); inventing a system actor (schema change for observability the logs already give) |
| D7 | Booking-denial UX rides the EXISTING VALIDATION fallback (code→snackbar map `frontend/providers/apollo/error-link.map.ts:242-261`): the localized copy renders with **zero frontend changes**; no dedicated arm in `frontend/views/student/sessions/sessionDialogErrorArms.ts` (deferred D3 resolved by this ruling) | Verified custom domain codes (e.g. `INSUFFICIENT_BALANCE`) have no frontend consumer and fall through to the localized VALIDATION toast (research-04 §4) | Dedicated dialog arm: optional polish with full frontend cost for identical copy |

### Design Goals

- **G1**: AC1 stays untouched — verification and test lock-in only (REQ-010/012).
- **G2**: AC2 ships as the smallest correct aggregate: route + service + two guarded repo statements + one partial index (REQ-020..026).
- **G3**: AC3 is an insertion, not a redesign — the existing ladder order, logging idiom (`logger.logDomainError` from `@/backend/lib/logger`), and error class are preserved verbatim (REQ-030..034).
- **G4**: Every user-facing string is a typed one-arg-bundle key added to exactly 3 locale files (REQ-003/032).
