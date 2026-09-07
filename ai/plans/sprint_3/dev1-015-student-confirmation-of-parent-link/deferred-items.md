# Deferred Items Ledger

**Feature:** `dev1-015-student-confirmation-of-parent-link`  
**Plan Directory:** `ai/plans/sprint_3/dev1-015-student-confirmation-of-parent-link`  
**Created:** `2026-09-05`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| DI-0.2-01 | tasks.md item 14 names `backend/services/parents/parent-link-request.static-locks.test.ts`; that file is ABSENT in code. The real static-scan lock is `backend/services/parents/parent-link.static-locks.test.ts` (826 lines; name matches plan.md §6). Later tasks must run/extend the correct file. | 0.2 | 2.2, 5.1 | 📅 Forward | 0.2-outcome.md §1 item 14 | Filename typo in tasks.md only; plan.md already carries the correct name. No code change needed. |
| DI-0.2-02 | Dashboard-home slot component-test suite does not exist: `test/ui/components/dashboard/` contains only `profile-view.test.tsx`; there is no `RoleDashboardPage`/status-slot test. Tasks 4.3.TE / 5.1 assumed "extending" existing dashboard-home tests. | 0.2 | 4.3 (5.1 battery) | 📅 Forward | 0.2-outcome.md §1 additional-checks table | 4.3.TE must CREATE the slot suite (student renders both cards; other roles unchanged; slot ordering) rather than extend one. |
| DI-0.2-03 | `shared/locale/parentLink-namespace.parity.test.ts` pins an EXHAUSTIVE key inventory (`MANDATED_KEYS`, "no silent key minting" test). Task 1.1's label additions fail parity unless `MANDATED_KEYS` (+ inventory count) are extended in the same change-set. | 0.2 | 1.1 | ✅ Done | 0.2-outcome.md §1 item 15, §4.5 | Resolved by 1.1: MANDATED_KEYS 33→39, FUNCTION_KEYS 4→6 extended in the same change-set; parity suite 68/68 green. |
| DI-2.1-01 | Layer-wide `bun run test/scripts/run-test.ts test/workflows` is NOT green: 13 pre-existing failures in OTHER domains' journeys — `admin/account-governance.journey.test.ts` (step 8 login byte-identity `toEqual(users row)` / step 9 denial battery), `sessions/session-lifecycle*.journey.test.ts` (sub-second deadline-window drift `86399595 < 86400000`, `SESSION_NOT_FOUND` vs `VALIDATION` code mismatch, PGlite `execProtocolRawSync` driver error), `notifications/j1-targeted-single-recipient.test.ts` (step 9 catch-up `createdAt` precision `.000Z` vs `.898Z`). | 2.1 | 2.M (reclassified at 2.M), 5.1 final gate, + owning session/governance/notification tickets | 📅 Forward | 2.1-outcome.md §5 (isolation proof); 2.M-outcome.md §1 | **Reclassified ❌ Blocked → 📅 Forward at the 2.M gate (2026-09-07).** Pre-existing on origin/base, outside plan scope, surfaced to user in Execution Summary; not attributable to DEV1-015 delta (zero production diff in those domains). Proof: each of the 13 failures reproduces in ISOLATION with the DEV1-015 files absent (2.1-outcome.md §5), and the 2.M gate diff audit shows ZERO edits under `backend/db/**`, `backend/graphql/**`, `backend/services/**` (non-test), `frontend/**`, `app/**`, `sessions/**`, `notifications/**`, `admin/**`. 2.M gate scope per tasks.md 2.M = `backend/services/parents` + `test/workflows` (parents domain) — both fully green (96 pass/15 skip/0 fail and 38 pass/1 skip/0 fail). Layer-wide greenness belongs to the 5.1 final gate + the owning foreign-domain tickets, which must also NOT touch those domains (scope gate). |

---

| DI-6.4-01 | Decision notifications (emitted to the PARENT on confirm/reject) deep-link via the generic `parent_link_request` type→route map to `/student/link-requests`, a student-only route; a parent clicking their decision notification bounces off the withPageAuth guard to their dashboard (safe redirect, no IDOR — relatedEntityId never interpolated). Recipient-aware routing (or a split notification type) exceeds the plan's frozen minimal-seam invariant (D5: type-keyed map only). | 6.4 | follow-up UX ticket (post-DEV1-015) | 📅 Forward | 6.4-outcome.md §finding 1 | Auth intact; guard redirects correctly; pure UX improvement owned outside this plan's scope gate. |

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
