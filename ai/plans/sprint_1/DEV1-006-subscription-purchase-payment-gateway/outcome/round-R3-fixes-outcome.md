# Round-R3 Fixes — Verification Outcome (Task R3-fixes)

**Date:** 2026-09-08 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

The single R3 item (F1) fixed with full verification. No accepted items carried from this round; the R2 accepted items (paymentAmountMismatch locale key, SubscriptionRepository.findById) remain untouched. Domain-only comments; artifact grep clean over all touched files.

## 1. Fix Detail — F1 (HIGH) — unbounded intervalDays

| Change | File |
|---|---|
| New module-level ceiling constant `MAX_INTERVAL_DAYS = 3650` (ten years) with a docblock explaining WHY: the activation window arithmetic multiplies this field into Date milliseconds, so an unbounded value would poison every confirmed delivery that reads the plan — the catalog rejects anything beyond the ceiling before it can be persisted | `backend/services/billing/plan-catalog.helpers.ts` |
| `validateIntervalDaysField` gained a second rejection leg after the existing integer/positive guard: `days > MAX_INTERVAL_DAYS` → field error `{ field: "intervalDays", code: "PLAN_INTERVAL_DAYS_OUT_OF_RANGE", message: tErrors.validation }` — mirroring exactly how `validateBalanceLaneField` reports (generic `tErrors.validation` label + machine code), so NO locale file changes were needed; the error flows into the same aggregated `ValidationError` on both the create (`validatePlanInput`) and update (`validateAndExtractPlanPatch`) paths | `backend/services/billing/plan-catalog.helpers.ts` |
| One-line comment above the `endDate` window arithmetic documenting the validated ceiling protecting it: "Catalog validation caps intervalDays at 3650 days (ten years) — this window arithmetic can never overflow." (domain language only) | `backend/services/billing/subscription-activation.service.ts` |
| Two new tests in the Tier-2 block (22 → 24): (a) "createPlan and updatePlan reject intervalDays past the validated ceiling" — create with `intervalDays: 3651` asserts `ValidationError` + field error `PLAN_INTERVAL_DAYS_OUT_OF_RANGE` + generic message "Invalid input."; update with `{ intervalDays: 3651 }` on an existing plan asserts the same rejection class/code AND that the stored row is untouched (still 30); (b) "intervalDays at the validated ceiling (3650) is accepted on the boundary" — create persists `intervalDays: 3650` (DB check constraint is `> 0`, so the ceiling is service-side only) | `backend/db/test/logic/billing/plan-catalog.service.test.ts` |

## 2. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ 0 errors |
| `bun run test/scripts/run-test.ts backend/db/test/logic/billing/plan-catalog.service.test.ts` | ✅ **24 pass / 0 fail** (22 baseline + 2 new, 79 expect calls) |
| plan-catalog repository suite | ✅ 16 pass / 0 fail (untouched, regression) |
| `test/workflows/billing/subscription-purchase.journey.test.ts` | ✅ 10 pass / 0 fail (untouched, regression) |
| `backend/services/billing/subscription-activation.service.test.ts` | ✅ 12 pass / 0 fail / 1 sanctioned PGlite skip (comment-only touch, regression) |
| `sub-loop <file> --lifecycle duplicates` ×3 touched files | ✅ 3/3 exit 0 (helpers, activation service, service test — tsgo → oxlint → biome → lint:type-aware → check:duplicates each) |
| Artifact grep over touched files (`DEV1-[0-9]{3}`, `REQ-[0-9]+`, `Task x.y`, `R[123]-fix`) | ✅ zero matches (exit 1 = clean) |
| `git status` | ✅ exactly the 3 intended files + this outcome + worklog + the pre-existing untracked R1/R2 outcome files; NO COMMITS |

## 3. Notes for the Orchestrator

- The 3650-day ceiling is deliberately service-side only: the `plans_interval_days_check` DB constraint stays `> 0`. Widening the check constraint would be a schema/driver-snapshot change outside this fix's mandate, and the service guard is the only write path into the catalog.
- The update-path test pins both the rejection AND the no-mutation invariant (stored row still 30 after the rejected patch), matching the forged-lane precedent in the same suite.
- No locale additions: the out-of-range leg reuses the generic `tErrors.validation` label per the balance-lane precedent, keeping the parity suites untouched.
