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

## Status Values

- ✅ Done — completed and verified (outcome/commit reference required)
- ⚠️ Partial — partially completed, needs follow-up
- ❌ Blocked — unresolved; plan cannot complete with this status
- 🔄 In Progress — active coordination item

## Usage

Every task outcome file that defers work MUST add a row here and reference its ID. The final quality-gate task re-runs the grep above; non-zero blocks completion.
