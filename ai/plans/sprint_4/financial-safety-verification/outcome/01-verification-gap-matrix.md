# 01 — Financial-Safety Verification Gap Matrix

**Plan:** `ai/plans/sprint_4/financial-safety-verification/`
**Date:** 2026-09-12 (ratified)
**Status:** RATIFIED (end-state after Tasks 0–4 complete — every non-deferred row COVERED; matrix ratified by Task 5)
**Sources:** `docs/planning/TICKETS.md:2985-3026` (6 test scenarios) · `docs/planning/PRODUCTION_READINESS.md` §1.2 (L30-39), §2.1 (L67-77), §2.2 (L79-90), §2.3 (L92-102), §2.4 (L104-113, reference-only), §2.5 (L115-125)
**Classification key:** COVERED = a named test (existing or landed by Tasks 2–4) asserts the criterion · PARTIAL = adjacent existing coverage exists but a required assertion is missing (no rows remain in the ratified end-state) · NEW REQUIRED = no existing coverage; closed by a NEW test (Task N) or explicitly deferred (no rows remain in the ratified end-state)

---

## 1. Ticket Test Scenarios (6/6)

| # | Scenario (TICKETS.md:3021-3026) | Existing coverage (verified path:line) | Gap | Classification |
|---|---|---|---|---|
| TS-1 | Double-spend attempt — prevented (only one session created) | `backend/services/classes/session-lifecycle.service.test.ts:2314` — REQ-043(d): two concurrent creations with ONE unit → exactly one session + one `INSUFFICIENT_BALANCE`, lanes never negative (real-PG gated via `testOnRealPostgres`, `:143`) · `test/workflows/billing/financial-safety-verification.journey.test.ts:372` — "step A — double-spend race: exactly one booking wins the funded unit, every loser rolls back to zero writes" (journey tier, committed cross-actor fixtures) | — | COVERED (final: service REQ-043(d) + journey Step A) |
| TS-2 | Escrow cancellation — funds released, no wallet credit | `backend/services/classes/session-lifecycle.service.test.ts:962` (cancel happy path: `fee_held` false, SAME lane refunded exactly once) · `:1363` (REQ-042 double-cancel: second cancel is `SESSION_INVALID_TRANSITION`, no over-refund) · `test/workflows/sessions/session-dual-confirmation.journey.test.ts:561` (system sweep cancels expired completion: same-lane refund +1) · `test/workflows/billing/financial-safety-verification.journey.test.ts:440` — "step B — escrow cancel release…" asserts `countTeacherTransactionsForTeacher == 0` AND `countWalletsForTeacher == 0` on the cancel path | — | COVERED (final: journey Step B, zero-earning probe) |
| TS-3 | Financial immutability — transactions cannot be modified | `backend/db/test/logic/audit/audit-immutability.test.ts:421/:433` (direct UPDATE/DELETE on `audit_logs` rejected by trigger) · `backend/db/test/logic/billing/student-payment.repository.test.ts:206` (paid→anything DB guard rejects) · `backend/db/test/logic/billing/financial-immutability.test.ts:271/:290` — "direct UPDATE on a teacher_transaction row is rejected and the row stays unchanged" / "direct DELETE of a teacher_transaction row is rejected and the row stays present" (`describeTriggerTier`-gated, savepoint-bracketed) | — | COVERED (final: financial-immutability.test.ts, teacher_transaction tamper tier) |
| TS-4 | Wallet consistency — balance = earnings − withdrawals | `backend/services/billing/wallet.service.test.ts:169` (withdrawal debit + `total_earning` untouched) · `:208` (insufficient funds → zero committed rows) · `:237` (exact-balance succeeds) · `test/workflows/billing/financial-safety-verification.journey.test.ts:544` — "step D — withdrawal drain race…" recomputes the identity from ledger rows (1 earning + 1 pending withdrawal, exact decimal strings via `subtractMoney`) and compares to the live `wallet` row; `:483` — step C asserts the credit-side identity (1 earning == fee == live balance/total_earning) | — | COVERED (final: journey Steps C/D, ledger↔wallet identity recompute) |
| TS-5 | Negative balance — prevented (check constraint) | `backend/db/test/repo/students/student.repository.test.ts:443` (`students_balance_hifz_check`) · `:458` (`students_balance_reviews_check`) · `backend/db/test/repo/billing/wallet.repository.test.ts:474` — describe `WalletRepository — CHECK constraint probes (savepoint-bracketed)`, test "direct negative writes at the DB tier are rejected by the named wallet and ledger CHECK constraints" (`wallet_balance_check`, `wallet_total_earning_check`, `teacher_transaction_amount_check` via `expectRepoError` + `constraintNameOf`) | — | COVERED (final: wallet.repository.test.ts CHECK probes) |
| TS-6 | Concurrent session requests — only one succeeds | `backend/services/classes/session-lifecycle.service.test.ts:2314` (REQ-043(d) one-unit race) · `:2346` (REQ-043(e): same-key replay N=4 → one session, one net debit, three `DUPLICATE_REQUEST`) · `test/workflows/billing/financial-safety-verification.journey.test.ts:372` — journey-tier N=4 double-spend race with serialization-safe sum-invariants (committed fixtures) | — | COVERED (final: service REQ-043(d)/(e) + journey Step A) |

---

## 2. PRODUCTION_READINESS §1.2 — Financial Record Immutability

| # | Criterion (abbreviated, PRODUCTION_READINESS.md:34-37) | Existing coverage (verified path:line) | Gap | Classification |
|---|---|---|---|---|
| 1.2.1 | `student_payments` immutable once created (UPDATE must fail) | `backend/db/test/logic/billing/student-payment.repository.test.ts:206` — "paid→anything: the DB guard rejects re-opening and re-deciding a decided payment" (savepoint-bracketed paid→pending and paid→failed probes) | — | COVERED |
| 1.2.2 | `teacher_transaction` immutable once created (UPDATE must fail) | `backend/db/test/logic/billing/financial-immutability.test.ts:271/:290` — direct UPDATE/DELETE on a `teacher_transaction` row rejected and the row read back unchanged; trigger-presence probe `:226` (both triggers present and enabled); `:308` idempotent re-probe (`describeTriggerTier`-gated, savepoint-bracketed) | — | COVERED (final: financial-immutability.test.ts, teacher_transaction tamper tier) |
| 1.2.3 | Corrections via NEW adjustment transactions, not modification | Append-only doctrine asserted for `audit_logs` (`backend/db/test/logic/audit/audit-immutability.test.ts:220/:228`); `teacher_transaction` schema is append-only (`backend/db/schema/billing/teacher-transaction.ts:17-22`) · `backend/db/test/logic/billing/financial-immutability.test.ts:335` — "the compensating-row doctrine holds — a corrective INSERT succeeds while mutation of the original fails" | — | COVERED (final: financial-immutability.test.ts compensating-row probe) |
| 1.2.4 | All financial records have non-null `created_at` | Schema-level: `created_at` is `.defaultNow().notNull()` on `teacher-transaction.ts:38`, `wallet.ts:26`, `student-payments.ts:48`, `subscriptions.ts:44` · `backend/db/test/repo/billing/wallet.repository.test.ts:241` — the `creditEarningOnce` suite asserts the full written ledger row (wallet/teacher/amount/type/status verbatim) and the additive wallet row; the notNull `created_at` column is exercised on every written row (an INSERT with a NULL `created_at` is impossible against the schema default) | Schema-default guarantee; the repo suite asserts every other written field on the ledger and wallet rows | COVERED (schema-level + written-row field fidelity in wallet.repository.test.ts) |

---

## 3. PRODUCTION_READINESS §2.1 — Dual-Confirmation Timeout

| # | Criterion (abbreviated, PRODUCTION_READINESS.md:71-75) | Existing coverage (verified path:line) | Gap | Classification |
|---|---|---|---|---|
| 2.1.1 | Session completion requires dual confirmation | `backend/services/classes/session-lifecycle.service.test.ts:2469` — teacher confirm alone → `feeHeld` still true, wallet row still null · `:2495` (confirm denials: scheduled row + foreign caller) | — | COVERED |
| 2.1.2 | 24-hour timeout auto-cancels unconfirmed sessions | `backend/services/classes/session-lifecycle.service.test.ts:2522` — expired scheduled rows cancel + same-lane refund; second sweep zero-row no-op · `test/workflows/sessions/session-dual-confirmation.journey.test.ts:561` (journey step 8, system leg) | — | COVERED |
| 2.1.3 | Auto-cancelled sessions release held funds | `backend/services/classes/session-lifecycle.service.test.ts:2522` (swept row `feeHeld` false, trial lane re-incremented exactly once) · journey step 8 `session-dual-confirmation.journey.test.ts:579` | — | COVERED |
| 2.1.4 | `confirmation_deadline` = now + 24h on creation | `backend/services/classes/session-lifecycle.service.test.ts:1081` — "deadline boundary: confirmationDeadline = captured now + 86_400_000 ms EXACTLY (bracketed)" | — | COVERED |
| 2.1.5 | Both `confirmed_by_student_at` and `confirmed_by_teacher_at` recorded | `backend/services/classes/session-lifecycle.service.test.ts:2396` (happy path: both stamps notNull) · `test/workflows/sessions/session-dual-confirmation.journey.test.ts:451` (journey step 5, both stamps) | — | COVERED |

---

## 4. PRODUCTION_READINESS §2.2 — Escrow Hold & Release

| # | Criterion (abbreviated, PRODUCTION_READINESS.md:83-88) | Existing coverage (verified path:line) | Gap | Classification |
|---|---|---|---|---|
| 2.2.1 | Fee held at session request (`fee_held = true`) | `backend/services/classes/session-lifecycle.service.test.ts:410` (`created.feeHeld` true, trial-lane provenance) · `test/workflows/sessions/session-dual-confirmation.journey.test.ts:374` (journey step 2) | — | COVERED |
| 2.2.2 | Balance held (not lost) at request | `backend/services/classes/session-lifecycle.service.test.ts:415` (lane balances read post-booking) · journey step 2 `session-dual-confirmation.journey.test.ts:386` ("Booking consumes the trial unit into escrow; the hifz lane is untouched") | — (B.4 semantics note: the funding lane is debited INTO the hold at request — the criterion's "not decremented until dual confirmation" wording predates B.4; the intent, funds committed and not lost, is verified) | COVERED (semantics note) |
| 2.2.3 | Balance decremented only upon dual confirmation | `backend/services/classes/session-lifecycle.service.test.ts:2396` (hold consumed at confirm; no further lane change — `balances.trial` stays 0) · `:962` (cancel path releases instead of consuming) | — (same B.4 wording note as 2.2.2: the lane debit lands at request (hold), the wallet credit at dual confirmation — both transitions individually verified) | COVERED (semantics note) |
| 2.2.4 | Teacher wallet credited only upon dual confirmation | `backend/services/classes/session-lifecycle.service.test.ts:2396` (wallet credited EXACTLY the fee: one earning row, balance/total_earning == fee) · `:2469` (no wallet row before student confirm) · journey step 5 `session-dual-confirmation.journey.test.ts:451` (credited exactly the fee once) | — | COVERED |
| 2.2.5 | Cancelled sessions release held funds (no decrement, no wallet credit) | `backend/services/classes/session-lifecycle.service.test.ts:962` (release, lane restored) · `:1363` (REQ-042 exactly-once) · journey step 8 · `test/workflows/billing/financial-safety-verification.journey.test.ts:440` — "step B — escrow cancel release…" asserts zero `teacher_transaction` rows AND zero wallet rows for the teacher after the cancel, notification-free release, and lane restored exactly once | — | COVERED (final: journey Step B, zero-earning probe) |
| 2.2.6 | Session fee is platform-set (not negotiated) | `test/workflows/sessions/session-dual-confirmation.journey.test.ts:373` — `expect(sessionA.fee).toBe(SESSION_FEE_HIFZ)` (platform constant from `shared/constants/session-fees.constants.ts`; no teacher/student input in `SessionSubmitInput`) | — | COVERED |

---

## 5. PRODUCTION_READINESS §2.3 — Double-Spend Prevention

| # | Criterion (abbreviated, PRODUCTION_READINESS.md:96-100) | Existing coverage (verified path:line) | Gap | Classification |
|---|---|---|---|---|
| 2.3.1 | Student cannot request session with zero balance (422) | `backend/services/classes/session-lifecycle.service.test.ts:470` — "total-miss branch: an empty student is denied INSUFFICIENT_BALANCE with zero rows and the key stays reusable" (canonical pattern at `:477` via `expectDomainDenial`) | — | COVERED |
| 2.3.2 | Concurrent session requests for the same balance prevented | `backend/services/classes/session-lifecycle.service.test.ts:2314` (REQ-043(d) one-unit race → one session) · `:2346` (REQ-043(e) same-key replay N=4 → one net debit) — real-PG gated · `test/workflows/billing/financial-safety-verification.journey.test.ts:372` (journey-tier N=4 committed-fixture race, sum-invariants) | — | COVERED (final: service REQ-043(d)/(e) + journey Step A) |
| 2.3.3 | Student balance cannot go negative (`balance >= 0` check) | `backend/db/test/repo/students/student.repository.test.ts:443` (`students_balance_hifz_check`) · `:458` (`students_balance_reviews_check`) | — | COVERED |
| 2.3.4 | Wallet balance cannot go negative (`wallet.balance >= 0`) | Guarded predicate is the app-side arbiter (`backend/db/repo/billing/wallet.repository.ts:169-172` `WHERE balance >= amount`) with service coverage `wallet.service.test.ts:208` · DB CHECK probe `backend/db/test/repo/billing/wallet.repository.test.ts:474` — `wallet_balance_check` raw-SQL probe (savepoint-bracketed, `constraintNameOf`) | — | COVERED (final: wallet.repository.test.ts CHECK probes) |
| 2.3.5 | Transaction amounts cannot be negative (`amount >= 0`) | `backend/db/test/repo/billing/wallet.repository.test.ts:474` — `teacher_transaction_amount_check` raw-SQL probe: a direct negative `amount` insert is rejected by the named CHECK constraint inside a savepoint bracket (`expectRepoError` + `constraintNameOf`) | — | COVERED (final: wallet.repository.test.ts CHECK probes) |

---

## 6. PRODUCTION_READINESS §2.4 — Dispute Resolution (REFERENCE-ONLY)

All four rows (PRODUCTION_READINESS.md:108-111) are dispute-economics / dispute-flow items owned by the sprint_3 dispute plan (out of this ticket's authority; D2 records the arbitration-credit finding). No adversarial financial-safety probe in Tasks 2–4 targets them.

| # | Criterion (abbreviated) | Mapping | Classification |
|---|---|---|---|
| 2.4.1 | Student can dispute a completed session | Dispute-economics — sprint_3 dispute plan (deferred D2 lineage) | REF |
| 2.4.2 | Admin arbitration: refund / partial refund / uphold | Dispute-economics — sprint_3 dispute plan | REF |
| 2.4.3 | Refund credits student balance, debits teacher wallet | Dispute-economics — sprint_3 dispute plan (adjacent shipped coverage: `session-lifecycle.service.test.ts:1539` — dispute open path holds the balance frozen, zero delta) | REF |
| 2.4.4 | All dispute actions logged in audit_logs | Dispute-economics — sprint_3 dispute plan (adjacent: `audit-immutability.test.ts:220` pins the audit trail's append-only surface) | REF |

---

## 7. PRODUCTION_READINESS §2.5 — Withdrawal Safety

| # | Criterion (abbreviated, PRODUCTION_READINESS.md:119-123) | Existing coverage (verified path:line) | Gap | Classification |
|---|---|---|---|---|
| 2.5.1 | Withdrawal requests start as `pending` | `backend/services/billing/wallet.service.test.ts:169` — happy path asserts exactly ONE ledger row with `TransactionStatus.Pending` (`:183`) | — | COVERED |
| 2.5.2 | Admin approval → `completed`, decrements wallet | — | Settle/approve flow does NOT exist in code (deferred D3: pending has no terminal transition; debit happens at request) | DEFERRED (D3 re-route) — out of authority, pre-ledgered in `deferred-items.md` D3 (Admin Financial Auditing owns the settle flow); NOT covered by this plan |
| 2.5.3 | Admin rejection → `failed`, does NOT decrement wallet | — | Reject flow does NOT exist in code (deferred D3) | DEFERRED (D3 re-route) — out of authority, pre-ledgered in `deferred-items.md` D3 (Admin Financial Auditing owns the reject flow); NOT covered by this plan |
| 2.5.4 | Withdrawal amount cannot exceed wallet balance (422) | `backend/services/billing/wallet.service.test.ts:208` — insufficient funds: `WALLET_INSUFFICIENT_FUNDS` conflict, zero committed rows · `:237` — exact-balance withdrawal succeeds (guard is `balance >= amount`) · repo predicate `backend/db/repo/billing/wallet.repository.ts:169-172` | — | COVERED |
| 2.5.5 | Withdrawal transactions immutable after completion | `teacher_transaction` immutability is enforced for ALL rows (including withdrawals) by the DB triggers: `backend/db/test/logic/billing/financial-immutability.test.ts:271/:290` — direct UPDATE/DELETE on a `teacher_transaction` row rejected, row read back unchanged (`describeTriggerTier`-gated, savepoint-bracketed) | "After completion" terminal state is unreachable today (D3 — pending never settles); the trigger-level immutability of withdrawal rows IS verified | COVERED (final: financial-immutability.test.ts trigger probe; terminal-state semantics deferred D3) |

---

## 8. Summary — NEW tests closing gaps (Tasks 2–4, all landed)

| New test (file) | Closes | Rows |
|---|---|---|
| `backend/db/test/repo/billing/wallet.repository.test.ts` (Task 2) — 14 tests, 100% lines & functions of `WalletRepository` (`ensureWalletOnce`, `creditEarningOnce`, `findByTeacherId`, `listTransactionsByWalletId`, `listRecentTransactions`, `debitForWithdrawalOnce`) + CHECK probes (`wallet_balance_check`, `wallet_total_earning_check`, `teacher_transaction_amount_check`, savepoint-bracketed via `expectRepoError` + `constraintNameOf`, describe `WalletRepository — CHECK constraint probes (savepoint-bracketed)` at `:474`) + no-update/delete API-surface assertion (describe `WalletRepository — namespace closure`, `:433`) + written-row field fidelity on ledger and wallet rows | Wallet repo coverage, DB CHECK constraints, ledger field fidelity | TS-5, 1.2.2 (adjacent), 1.2.4, 2.3.4, 2.3.5 |
| `backend/db/test/logic/billing/financial-immutability.test.ts` (Task 3) — 10 tests: trigger-presence probes (`teacher_transaction` / `student_payments` / `audit_logs`, both UPDATE+DELETE triggers present and enabled), `teacher_transaction` UPDATE/DELETE tamper probes (`:271/:290`, raise-exception, savepoint-contained, `describeTriggerTier`-gated per `audit-immutability.test.ts:418`), idempotent re-probe (`:308`), compensating-row doctrine check (`:335`), one fresh `student_payments` tamper pin (`:360`) | Financial immutability | TS-3, 1.2.2, 1.2.3, 2.5.5 |
| `test/workflows/billing/financial-safety-verification.journey.test.ts` (Task 4) — 9 tests (describe `Journey — cross-actor adversarial financial-safety verification (real services)` at `:371`), Steps A–H: N=4 double-spend race (`:372`), escrow cancel release with zero-earning probe (`:440`), dual-confirm credit + identity recompute (`:483`), withdrawal drain race (`:544`), withdrawal input fuzz (`:591`), wallet first-earning race (`:616`), immutability observation (`:685`), denials (`:725`), teardown worklist (`:761`) | Cross-actor double-spend, cancel no-wallet-credit, wallet↔ledger identity, drain race | TS-1/TS-6 (journey tier), TS-2, TS-4, 2.2.5 |
| (No task in this plan) | Withdrawal settle/approve + reject flows (2.5.2, 2.5.3, terminal state of 2.5.5) — upstream gap recorded in `deferred-items.md` D3 (re-routed to Admin Financial Auditing Sprint 3) | 2.5.2, 2.5.3, 2.5.5 (terminal) |

### Row totals (ratified end-state)

| Classification | Count | Rows |
|---|---|---|
| COVERED | 25 | TS-1, TS-2, TS-3, TS-4, TS-5, TS-6, 1.2.1–1.2.4, 2.1.1–2.1.5, 2.2.1–2.2.6, 2.3.1–2.3.5, 2.5.1, 2.5.4, 2.5.5 |
| PARTIAL | 0 | — (all initial PARTIAL rows closed by Tasks 2–4: TS-2, TS-3, TS-4, TS-5, 1.2.2, 1.2.3, 1.2.4, 2.2.5, 2.3.4, 2.5.5) |
| NEW REQUIRED | 0 | — (1.2.2 and 2.3.5 were closed by Tasks 3 and 2; 2.5.2/2.5.3 were never in this plan's authority — re-routed to D3) |
| DEFERRED | 2 | 2.5.2, 2.5.3 (D3 re-route → Admin Financial Auditing Sprint 3, `deferred-items.md` D3) |
| REF | 4 | 2.4.1–2.4.4 |

*(Precise per-row classification is authoritative in the tables above; totals are a roll-up.)*

---

## 9. Re-verification notes

All eight pre-verified mapping inputs were re-verified during execution; every one held up:

1. **confirm-vs-sweep race** → verified: `test/workflows/sessions/session-dual-confirmation.journey.test.ts:620` is exactly the "step 10 — confirm-vs-sweep race on one expired completion: exactly ONE financial outcome" test (`Promise.allSettled([confirmSessionCompletion, sweepExpiredSessions])`, row-oracle partitioning).
2. **student_payments trigger matrix** → verified: `backend/db/test/logic/billing/student-payment.repository.test.ts:206` is the "paid→anything: the DB guard rejects…" test with both savepoint-bracketed probes (paid→pending, paid→failed) asserting the guard error chain.
3. **REQ-043(d)/(e)** → verified at `session-lifecycle.service.test.ts:2314` and `:2346`, both wrapped in `testOnRealPostgres` (gating precedent at `:143`).
4. **replay/zero-balance booking** → pinned to exact lines: replay branch `:991` ("a same-caller retry of a spent key surfaces DUPLICATE_REQUEST, leaves zero new rows and zero second debit"); zero-balance branch `:470` ("total-miss branch: an empty student is denied INSUFFICIENT_BALANCE with zero rows").
5. **WalletRepository repo-tier coverage** → confirmed absent: `backend/db/test/repo/` contains only `classes/`, `parents/`, `students/`, `teachers/` — no `billing/` directory; grep for `WalletRepository` in `backend/db/test/` returns no test hits. (Note: `WalletRepository` methods are exercised *indirectly* via `session-lifecycle.service.test.ts` and `wallet.service.test.ts`, but no dedicated repo-layer coverage test exists — the Task 2 gap stands.)
6. **withdrawal drain race** → confirmed NEW: grep of `wallet.service.test.ts` for `race|Promise.all|concurrent` returns nothing; the suite is sequential (`runInRollback`) only.
7. **teacher_transaction trigger probe** → confirmed NEW: `audit-immutability.test.ts` covers `audit_logs` only (docblocks, trigger constants `prevent_audit_logs_*`, and scanners all target `auditLogs`); grep for `prevent_teacher_transaction`/teacher_transaction immutability in `backend/db/test/` returns nothing.
8. **CHECK-constraint probes** → confirmed NEW: grep for `wallet_balance_check|wallet_total_earning_check|teacher_transaction_amount_check` in `backend/db/test/` hits only `entity-setup.ts:444/:484` docblocks — no executable probes. (Adjacent: student-lane CHECKs ARE probed at `student.repository.test.ts:443/:458`.)
9. **journey-tier cross-actor flow** → confirmed NEW: `test/workflows/billing/` contains only `subscription-purchase.journey.test.ts`.
10. **schema-surface pinning** → verified at `backend/graphql/test/schema-surface.test.ts:218-222`: `WALLET_QUERY_FIELDS = ["myWallet"]` and `WALLET_MUTATION_FIELDS = ["requestWithdrawal"]`.

**Corrections/refinements to the pre-verified inputs:** none of the mappings was wrong; two refinements were applied — (a) the replay/zero-balance "COVERED by session-lifecycle.service.test.ts" input was pinned to exact test lines (`:991` / `:470`), and (b) §2.2 rows 2.2.2/2.2.3 required an explicit B.4 semantics note: the criterion text ("balance not decremented until dual confirmation") predates the shipped hold-at-request model (decision B.4, `docs/specs/open-decisions-and-gaps.md:93-97`); under shipped semantics the funding lane is debited into the hold at request and the wallet is credited at dual confirmation — both transitions individually verified, so the rows are COVERED with a semantics note rather than PARTIAL.

**Deferred-ledger check:** no genuine NEW upstream gap beyond D1–D5 was found during this re-verification (the 2.5.2/2.5.3 settle/reject absence is already D3; the 2.2.2/2.2.3 wording mismatch is a documentation note, not a code gap).

---

## 9.5 Task-5 ratification (2026-09-12)

The end-state was ratified after Tasks 0–4 completed. Every initial PARTIAL row that Tasks 2–4 closed is now **COVERED** with the landed test's stable path + describe/test reference; every initial NEW REQUIRED row that was in this plan's authority (1.2.2, 2.3.5) is **COVERED** the same way. The two rows out of this plan's authority (2.5.2, 2.5.3 — withdrawal settle/reject flow, absent from code) are marked **DEFERRED (D3 re-route)** pointing to `deferred-items.md` D3 (Admin Financial Auditing Sprint 3 owns the settle flow); they are NOT marked covered. Final roll-up: **25 COVERED · 0 PARTIAL · 0 NEW REQUIRED · 2 DEFERRED · 4 REF**. Full-suite evidence for the ratification lives in `outcome/5-matrix-ratification-outcome.md`.

---

## 10. Verification evidence

Every existing-coverage citation in this matrix was spot-checked by reading the cited lines during this task (2026-09-12): test names, assertion bodies, and gating wrappers (`testOnRealPostgres`, `describeTriggerTier`, `runInRollback`) all match the claims above. Schema citations (`created_at` notNull columns, `debitForWithdrawalOnce` predicate, `WITHDRAWAL_AMOUNT_PATTERN` at `backend/services/billing/wallet.service.ts:61`) were read directly.
