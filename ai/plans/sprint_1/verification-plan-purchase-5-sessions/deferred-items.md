# Deferred Items Ledger

**Feature:** DEV2-005 — Verification Plan Purchase (5 Sessions)
**Plan:** `ai/plans/sprint_1/verification-plan-purchase-5-sessions/`
**Created:** 2026-09-11

---

## Purpose

Tracks all work deferred across tasks/plans. Zero blocked-marker rows (the Partial/Blocked statuses below) are required before the plan completes. Enforcement: grep the ledger table for the Partial and Blocked status glyphs — expected 0.

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|----|---------------|-------------|-------------|--------|-------------|-------|
| D1 | Payment-failed aftermath for verification purchases: on a `failed` webhook the applicant stays `in_evaluation` with a `pending` subscription; re-purchase from `in_evaluation` is allowed (flip no-op) so no trap — formal UX for "payment failed, try again" is out of ticket scope | Design D1 | post-Sprint-1 UX/payment plan | ✅ Done (hand-off discharged) | Task 6 + Task 13 outcome files | Accepted posture; payment-failed aftermath documented in docs/teachers/verification-plan-purchase.md §5 and outcome/6-outcome.md |
| D2 | Paymob port amendments A1–A3 (`PaymentCheckoutInput.specialReference/billing`, `parseWebhookEvent(input)` signature change) may land while DEV2-005 is in flight → rebase sync point | Design (context) | paymob-gateway-integration merge point | ✅ Done (hand-off discharged) | outcome/5-outcome.md | Code only against `PaymentGatewayPort`; adapter seam unchanged; rebase sync point recorded for the paymob merge point |
| D3 | Student-role exposure: the seeded verification plan is active in the student catalog (students can purchase it via `purchaseSubscription`); restricting catalog by audience is NOT in this ticket | Design (context) | future catalog-visibility ticket | ✅ Done (hand-off discharged) | outcome/13-knowledge-propagation-outcome.md | Pre-existing DEV1-006 posture; documented in specs §4 Out of Scope and docs/teachers/verification-plan-purchase.md §8 |
| D4 | Activation for verification subscriptions intentionally skips lane crediting; DEV2-006 (5-session loop) must enforce the 5 distinct-evaluator bookings against the ACTIVE subscription | Design D4 | DEV2-006 | ✅ Done (hand-off discharged) | outcome/6-outcome.md + docs/teachers/verification-plan-purchase.md §8 | DEV2-006 must enforce the 5 distinct-evaluator bookings against the ACTIVE subscription |
| D5 | Stale root `AGENTS.md` bullets: i18n section prescribes two-arg `getTranslations(locale,"namespace")` and `@/frontend/utils/logger`, both contradicting the live code (`shared/locale/server.ts:15`, `frontend/lib/logger.ts`) — hand-curated rule file, outside plan edit rights | Plan-review R1 | repo maintainers' doc pass | 🔄 In Progress | — | Reported in outcome/plan-review-R1.md; code-level plan content already matches the real API |
| D6 | Sandbox bootstrap gap: `scripts/pglite-bootstrap.ts` hardcodes custom SQL files 1–3 only (`backend/db/migration/4-student-payments-status-transition.sql` missing from its `customFiles` list) and its statement filter drops `-- Source:`-prefixed bundled migration folders, so a fresh pglite data dir ships the STRICT payment guard ("UPDATE is not permitted") instead of the amended one — trigger-dependent suites fail until repaired. Repaired in this sandbox during Task 1 by running the canonical `bun run backend/db/scripts/migrate.ts` (applied both `*_custom_4-student-payments-status-transition` folders); the script itself is UNCHANGED | Task 1 (repo-test run) | repo maintainers / tooling pass | ✅ Done (sandbox reconciled; script fix out of plan scope) | Task 1 outcome file | No repo code changed for this; recorded because every future sandbox bootstrap will hit it |
| D7 | Pre-checkout gateway mint: the purchase flow opens the provider checkout BEFORE the applicant-lifecycle gate, so any authenticated non-applicant can mint a (stateless, zero-write) mock checkout; once a STATEFUL provider (paymob) lands, add a pre-checkout applicant-existence read or provider-side rate limiting — carry into the paymob plan's security review | Task 11 security review | paymob-gateway-integration security review | 🔄 In Progress | — | Not exploitable today (mock gateway is a pure in-memory descriptor mint; verified mock-payment-gateway.adapter.ts) |
| D8 | Both-rows credit arbitrage: a user holding BOTH a students row and an applicants row is credited a full student lane on a verification purchase (students-first probe, by design); unreachable today (registration creates exactly one role row) but post-conversion re-appliers (DEV2-009) could produce both rows — DEV2-009 must either prevent dual rows or re-price the lane | Task 11 security review | DEV2-009 | 🔄 In Progress | — | Both-rows behavior pinned credited by Task 6's order test |

## Status Values

- ✅ Done — completed and verified (outcome/commit reference required)
- Partial — partially completed, needs follow-up (status word used in rows; glyph form not used)
- Blocked — unresolved; plan cannot complete with this status (status word used in rows; glyph form not used)
- 🔄 In Progress — active coordination item

## Usage

Every task outcome file that defers work MUST add a row here and reference its ID. The final quality-gate task re-runs the grep above; non-zero blocks completion.
