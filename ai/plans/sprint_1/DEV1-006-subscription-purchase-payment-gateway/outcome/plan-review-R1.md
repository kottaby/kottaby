# Plan Review Report — DEV1-006: Subscription Purchase via Payment Gateway

## Review Round: 1 (Phase 1.5 gate)
## Date: 2026-09-06
## Subagents Dispatched: none — review executed inline by the planning session with all dimension checks (paths, i18n, GraphQL, permissions/enums, existing components, architecture, cross-refs) run as verification passes by the orchestrator.

**Plan directory:** `ai/plans/sprint_1/DEV1-006-subscription-purchase-payment-gateway/`
**Artifacts reviewed:** `specs.md` (253 lines), `plan.md` (335 lines), `tasks.md` (234 lines), `deferred-items.md`.

---

## Summary

- **Total issues found:** 4
- **Blocking (CRITICAL/HIGH):** 2
- **Medium:** 1
- **Low/Notes:** 1
- **Verdict after fixes:** ✅ **Plan passes all AGENTS.md rules** (all 4 fixed in-file; re-verified by grep).

---

## Findings by Dimension

| Dimension | Issues | Status |
|---|---|---|
| Paths Existence | 1 (HIGH) | ✅ Fixed |
| Registry/Route Compliance | 1 (HIGH) | ✅ Fixed |
| Cross-Reference Consistency (line refs) | 1 (MEDIUM) | ✅ Fixed |
| Copy accuracy | 1 (LOW) | ✅ Fixed |
| i18n Compliance | 0 | ✅ Clean |
| GraphQL Accuracy | 0 | ✅ Clean |
| Permissions/Enums | 0 | ✅ Clean |
| Architecture / Type Pattern | 0 | ✅ Clean |
| UX/Nav ruling | 0 (explicit no-UI ruling present) | ✅ Clean |
| Traceability (specs↔tasks) | 0 (all REQ ids from `specs.md` appear in `tasks.md`) | ✅ Clean |

---

## Detailed Findings

### F1 — ROUTE_INVENTORY completeness gate missed (HIGH)

- **Location:** `plan.md` §3.4 / Task 8.1
- **Expected:** Every file under `app/api/` must be registered in `backend/lib/gateway/route-inventory.ts` (`ROUTE_INVENTORY`); a static completeness assertion fails otherwise (`route-inventory.test.ts`). Webhook routes classify as `provider-ack-exempt`; the exemptions register lives in `docs/graphql/error-handling-contract.md`.
- **Actual:** The webhook route was planned without the registration step.
- **Fix Applied:** Added a registration table row in `plan.md` §3.4 and an explicit mandatory step + assertion-failure note in Task 8.1 (`tasks.md`).

### F2 — Billing DB test directory convention violated (HIGH)

- **Location:** `plan.md` §9, `specs.md` REQ-070, Tasks 4.1–4.4
- **Expected:** Billing DB tests live in `backend/db/test/logic/billing/` — the home DEV1-005 established (`plan-catalog.*.test.ts` there); `backend/db/test/repo/` has no billing subdir, and `backend/db/test/AGENTS.md` assigns constraint/trigger suites to `logic/`.
- **Actual:** Plan cited `backend/db/test/repo/billing/`.
- **Fix Applied:** All references updated to `backend/db/test/logic/billing/` (plan §9 table, REQ-070, tasks 4.1–4.4).

### F3 — Off-by-one cron line citation (MEDIUM)

- **Location:** `specs.md` REQ-021, `tasks.md` 5.2
- **Expected:** `bearerSecretMatches` is defined at `app/api/cron/sweep-sessions/route.ts:66-73`.
- **Actual:** Plan cited `:56-63`.
- **Fix Applied:** Both citations corrected to `:66-73`.

### F4 — Garbled copy in UX section (LOW)

- **Location:** `plan.md` §5 "frontend/COMPONENT_PATTERNS.md hoodie conventions"
- **Fix Applied:** Replaced with "shared-scaffold conventions".

---

## Dimension Pass Notes (verified, zero findings)

- **Ground-truth verification:** every cited table/column/enum in the plan was re-checked against source: `plans.ts`, `subscriptions.ts`, `student-payments.ts`, `student-subscriptions.ts`, `students.ts` balances + CHECKs, `enums.ts` pgenums, trigger file `3-immutability-triggers.sql:59-83`, `PlanCatalogService` (`coercePlanId:213`, guarded patterns), repo signatures, `UserRole` members, idempotency precedent (`session-lifecycle.booking.ts:225-244`), `NotificationEngine.emitForUser` signature, `getServerTranslations(locale)` single-arg form (`shared/locale/server-graphql.ts`), client handle idiom `useAppTranslation(Plans)`.
- **i18n:** services localize via `getServerTranslations(locale)` (single arg) — matches current code; no `Translation.` enum, no two-arg `getTranslations`, no `next-intl` anywhere in the plan.
- **Enums:** value-import rule + single-registration in `shared/enum.pothos.ts` (verified the four needed enums are currently UNREGISTERED); no literal-array registration anywhere in plan.
- **Logging:** only `logger.logDomainError` / `logger.error` from `@/backend/lib`; no `console.*`, no `@/frontend/utils/logger` (backend-only ticket).
- **Test discipline:** `run-test.ts` mandated everywhere; no raw `bun test` on DB/journey surfaces; `runInRollback` + `tx` rules quoted; journeys follow `test/workflows/AGENTS.md` (committed fixtures, honest roles, spied transport).
- **Anti-pattern sweep:** clean (the only `getTranslations(`, `Translation.`, `bottom-nav`, `next-intl` hits are prohibition statements).

## Post-Fix Verification Checklist

- [x] All stale references resolved (grep confirms: no `test/repo/billing`, no `:56-63`, no `hoodie`)
- [x] REQ traceability complete (0 misses)
- [x] Structure gate: `plan.md` contains Overview+decisions, Data Models, API Contracts + SDL + permission matrix, Services/Repo signatures + concurrency + Journey design, UX/Nav with explicit no-UI ruling, Security/Tenancy mitigations
- [x] Re-run review confirms: **Plan passes all AGENTS.md rules**
