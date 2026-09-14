# Deferred Items Ledger

**Feature:** DEV2-005 — Verification Plan Purchase (5 Sessions)
**Plan:** `ai/plans/sprint_1/verification-plan-purchase-5-sessions/`
**Created:** 2026-09-11

---

## Purpose

Tracks all work deferred across tasks/plans. Zero `❌`/`⚠️` rows are required before the plan completes. Enforcement: `grep -c "❌\|⚠️" ai/plans/sprint_1/verification-plan-purchase-5-sessions/deferred-items.md` → expected 0.

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|----|---------------|-------------|-------------|--------|-------------|-------|
| D1 | Payment-failed aftermath for verification purchases: on a `failed` webhook the applicant stays `in_evaluation` with a `pending` subscription; re-purchase from `in_evaluation` is allowed (flip no-op) so no trap — formal UX for "payment failed, try again" is out of ticket scope | Design D1 | post-Sprint-1 UX/payment plan | 🔄 In Progress | — | Accepted posture; documented in specs REQ-5.6 |
| D2 | Paymob port amendments A1–A3 (`PaymentCheckoutInput.specialReference/billing`, `parseWebhookEvent(input)` signature change) may land while DEV2-005 is in flight → rebase sync point | Design (context) | paymob-gateway-integration merge point | 🔄 In Progress | — | Code only against `PaymentGatewayPort`; adapter seam unchanged today |
| D3 | Student-role exposure: the seeded verification plan is active in the student catalog (students can purchase it via `purchaseSubscription`); restricting catalog by audience is NOT in this ticket | Design (context) | future catalog-visibility ticket | 🔄 In Progress | — | Pre-existing DEV1-006 posture; documented in specs §4 Out of Scope |
| D4 | Activation for verification subscriptions intentionally skips lane crediting; DEV2-006 (5-session loop) must enforce the 5 distinct-evaluator bookings against the ACTIVE subscription | Design D4 | DEV2-006 | 🔄 In Progress | — | Cross-ticket hand-off note |
| D5 | Stale root `AGENTS.md` bullets: i18n section prescribes two-arg `getTranslations(locale,"namespace")` and `@/frontend/utils/logger`, both contradicting the live code (`shared/locale/server.ts:15`, `frontend/lib/logger.ts`) — hand-curated rule file, outside plan edit rights | Plan-review R1 | repo maintainers' doc pass | 🔄 In Progress | — | Reported in outcome/plan-review-R1.md; code-level plan content already matches the real API |
| D6 | Environment provisioning gap discovered + repaired in Task 1: `kottaby_db` had been provisioned via `db push` only — the `__drizzle_migrations` journal was absent and the immutability triggers/guards (`3-immutability-triggers.sql`, `4-student-payments-status-transition.sql`) were NEVER installed, so all trigger-pinning DB tests failed. Repair: `bun run db migrate` applied all 9 idempotent drizzle folders (journal created; triggers now present on `student_payments`/`teacher_transaction`/`audit_logs`; `db push` nullability preserved). Any FRESH environment for this plan's DB-backed tasks (2, 4–6, 10) must run `bun run db migrate` after provisioning or the same suites fail | Task 1 (1.TE) | Tasks 2, 4, 5, 6, 10 (+ any fresh env/CI) | ✅ Done | outcome/1-outcome.md | Repair verified: trigger-presence query + green `student-payment.repository.test.ts` (10/10), `financial-immutability.test.ts` (12/12) |
| D7 | Journey step-7 expectation vs the plan-conformant gate-before-claim service order (APPLICANT_NOT_FOUND vs PAYMENT_NOT_FOUND for a non-applicant key replay) | Task 6 (6.TE journey run) | Task 10 (journey-green gate) | ✅ Done | Task 10 | Reconciled: journey step 7 re-aimed — foreign APPLICANT replay → PAYMENT_NOT_FOUND (claim tier); student replay → gate-first APPLICANT_NOT_FOUND; both oracle-safe, zero writes; service unchanged (plan §4.3-conformant, double-pinned) |
| D8 | Admin-audit visibility for NULL-owner (verification) payments: list+count deliberately exclude them via the students INNER JOIN; a LEFT-JOIN surface change (showing verification purchases in the admin audit) is future work | Task 1 + Task 8 review | future admin-audit surface ticket | 🔄 In Progress | — | Count now mirrors listing (Task 8 fix) so the surface is self-consistent. |
| D9 | Verification purchase in-tx plan re-validation is plan-locked to the active re-read (plan §4.3 step 7a); the sibling student flow additionally re-compares price/currency vs the minted checkout and gates interval/session ceilings. Mismatch posture is fail-safe (settlement quarantine). Reuse of the sibling gates is defense-in-depth follow-up | Task 8 review | future catalog-integrity ticket | 🔄 In Progress | — | Advisory (MEDIUM) from midpoint review R1; plan-conformant as shipped. |
| D10 | Sandbox-only: `bun run test:ui:components` full-directory runner stops after `admin-session-governance/*` on a CLEAN tree too (verified via `git stash -u`), and the verification dialog component suite leaves a post-test background allocation loop in the worker (Happy DOM/MUI interplay) → eventual worker OOM after all 12 assertions pass. CI (GitHub-hosted runners) must confirm the full suite green | Task 9 | CI verification / test-infra ticket | 🔄 In Progress | — | Per-directory runs green everywhere; all dialog tests 12/12; process-level leak only in this sandbox |

## Status Values

- ✅ Done — completed and verified (outcome/commit reference required)
- ⚠️ Partial — partially completed, needs follow-up
- ❌ Blocked — unresolved; plan cannot complete with this status
- 🔄 In Progress — active coordination item

## Usage

Every task outcome file that defers work MUST add a row here and reference its ID. The final quality-gate task re-runs the grep above; non-zero blocks completion.
