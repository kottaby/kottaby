# Deferred Items Ledger

**Feature:** Segregated Session Balance Crediting (DEV1-007)
**Plan:** `ai/plans/sprint_1/Segregated Session Balance-crediting/`
**Created:** 2026-09-11 (at plan generation)

---

## Purpose

Tracks all work deliberately NOT done inside this plan, with its recorded disposition, so nothing is silently forgotten. The plan's final gate (tasks.md 4.1) requires the Ledger Table to hold zero Blocked/Partial rows.

---

## Ledger Table

| ID | Deferred Item | Source | Target | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Tighten `balance_hifz/tajweed/reviews` from nullable to `notNull()` | Verification finding (schema review) | Out of plan — future schema-hardening pass | ✅ Done | `plan.md` §2.1 | Defense-in-depth already layered: guarded `balance > 0` predicate + `COALESCE` credit + 4 CHECK constraints (`backend/db/schema/students/students.ts:42-45`); migration churn unjustified in Sprint 1 |
| D2 | `backend/db/test/AGENTS.md` + `.agents/instructions/tests.instructions.md` cite non-existent helpers (`setupStudent`, `createTestTeacher`) — real API is the `createTest*` family of `backend/db/test/entity-setup.ts` | Scope-D exploration | Out of plan — rule files are hand-curated only | ✅ Done | Reported in `outcome/00-exploration-and-substrate-verification.md` | Resolution = reporting to maintainers; plan work may not edit rule files |
| D3 | Student-facing balance read surface (GraphQL query + `/subscriptions` page) | Ticket vs reality gap | Out of scope — future UX/billing ticket | ✅ Done | Explicit no-UI ruling: `specs.md` §4, `plan.md` §5 | Ticket carries no UI AC; balance reads today are admin-only (`backend/graphql/pothos/admin/admin-students.pothos.ts:49-52`) |
| D4 | Reviews-lane consumption path (decrement on review session) | Ratification analysis | Future review-session booking ticket (none exists yet) | ✅ Done | Ratified as REQ-025 / decision D2 | `reviews` is a `SubscriptionCreditLane` but not a `HeldBalanceLane` (`backend/enum/scheduling/held-balance-lane.enum.ts:17-31`); no booking flow can spend it today |
| D5 | `PRODUCTION_READINESS.md` §5.3.3 (expiry invariant) stays unchecked | Task 3.2 scoping | DEV1-008 (Subscription Validity Window & Expiry) | ✅ Done | Noted in Task 3.2 | Expiry is the next ticket's scope; ticking it here would be false evidence |

---

## Status Values

- ✅ **Done** — Item resolved or disposition recorded with reference
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on

---

## Enforcement

The final quality gate (tasks.md 4.1) verifies, scoped to the Ledger Table so the Status Values legend's own glyphs do not self-match:

```bash
awk '/^## Ledger Table/,/^## Status Values/' "ai/plans/sprint_1/Segregated Session Balance-crediting/deferred-items.md" | grep -c "❌\|⚠️"
# Expected: 0
```

**Exit criteria:** plan cannot complete while any Blocked or Partial status remains in the Ledger Table.
