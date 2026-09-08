# Round-R1 Fixes — Verification Outcome (Task R1-verify)

**Date:** 2026-09-06 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

The Round-R1 review-fix agent (F1–F8) died before final verification. This pass re-verified every fix against its intent, repaired the lint fallout the fixes introduced, re-ran all affected suites, and confirms the tree is green.

## 1. Per-Fix Verification (F1–F8)

| Fix | Intent | Status | Evidence |
|---|---|---|---|
| F1 | COALESCE lane credit — `creditLaneBalance` seeds a NULL lane from zero | ✅ Verified | `student.repository.ts` SET is `COALESCE(balance_*, 0) + amount` with updated rationale docblock; NULL-lane Tier-3 test rewritten to pin `NULL + 5 → 5` (persisted via `findById`, not just RETURNING) and Tier-4 CHECK-floor test extended to a NULL-seeded lane; suite 23/0 |
| F2 | Price re-comparison in the purchase tx | ✅ Verified | `assertPlanUnchangedSinceCheckout` compares the fresh in-tx plan row against the checkout-captured `price`/`currency` → generic `PLAN_PRICE_CHANGED` ValidationError on `planId`, thrown before any row write; new mid-flight test mutates the price DURING checkout (spy seam) and proves zero writes; suite 18 pass / 1 skip / 0 |
| F3 | Governance re-assert in the purchase tx | ✅ Verified | `assertActorGovernanceClean(studentUserId, t, tx)` re-runs inside `purchaseInTx` after the price re-comparison; new mid-flight test suspends the caller during checkout → ForbiddenError, zero writes |
| F4 | Webhook Content-Length pre-gate + incremental cap | ✅ Verified | Route rejects a declared `Content-Length` over `MAX_PAYMENT_WEBHOOK_BODY_BYTES` before reading a byte; `readBoundedBody` streams under a running byte budget (abort → masked 400); 4 new boundary tests (unsigned over-cap header 400-before-401, chunked over-cap, chunked byte-exact cap end-to-end, multibyte char split across chunks) — suite 31/0 |
| F5 | Schema-surface ticket-ref cleanup | ✅ Verified | `DEV1_006_*` identifiers/test-title fragments renamed to `SUBSCRIPTION_PURCHASE_*` vocabulary; no DEV1-006 token remains in the file; suite 42/0 |
| F6 | Arabic terminology unification | ✅ Verified | `ar/errors` `planLaneUnconfigured` now uses «مسار الرصيد»; errors-namespace parity suite 8/0 (all locales in lockstep) |
| F7 | `PurchaseSubscriptionInput` → `PurchaseSubscriptionSubmitInput` | ✅ Verified | Types file renamed with the `PlanSubmitInput`-convention rationale (the Pothos wire input keeps the `PurchaseSubscriptionInput` name by design); service, tests, and `docs/billing/subscription-purchase.md` contract updated; tsgo 0 errors proves the rename is complete |
| F8 | Fail-closed mappers + generic webhook messages | ✅ Verified | `paymentGatewayOf` throws `ConflictError` on out-of-vocabulary values; `plan.pothos` `toSubscriptionCreditLane` fail-closed throw with enum-sourced case vocabulary; `plan.repository.insertPlan` plain Error → ConflictError; activation service internal-invariant conflicts now log the diagnostic and throw the client-safe `"Payment could not be processed."` copy |

## 2. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ 0 errors (re-run after every repair — final run clean) |
| Diff review of all 13 modified files | ✅ Matches F1–F8 intent; no half-done work found |
| `sub-loop --lifecycle duplicates` ×13 modified files | ✅ 13/13 pass (see §4 for the `.md` caveat) |
| `bun run check:duplicates` (repo-wide, -t 0) | ✅ 0 clones |
| `bun run biome:check` (repo-wide) | ✅ exit 0 — 1455 files, "No fixes applied" |
| Artifact grep `DEV1-[0-9]{3}|REQ-[0-9]+|Task [0-9]+\.[0-9]+` | ✅ Clean — zero DEV1-006 tokens; only pre-existing other-task refs (§5) |
| `git status` | ✅ Exactly the 13 intended modified files; no stray edits; NO COMMITS |

## 3. Suite Counts (serialized DB runs, final state after repairs)

| Suite | Pass | Fail | Notes |
|---|---:|---:|---|
| `backend/db/test/repo/students/student.repository.test.ts` | 23 | 0 | incl. F1 COALESCE NULL-lane + NULL-seeded CHECK-floor pins |
| `backend/services/billing/subscription-purchase.service.test.ts` | 18 | 0 | +1 sanctioned pglite skip; incl. new F2/F3 mid-flight tests |
| `backend/services/billing/subscription-activation.service.test.ts` | 12 | 0 | +1 sanctioned pglite skip |
| `app/api/payments/webhook/test/payments-webhook-route.test.ts` | 31 | 0 | incl. 4 new F4 Content-Length/incremental-cap tests |
| `backend/graphql/test/schema-surface.test.ts` | 42 | 0 | F5 renames |
| `backend/graphql/test/subscription-purchase.replay.test.ts` | 9 | 0 | |
| `backend/graphql/test/subscription-purchase.roles.test.ts` | 10 | 0 | |
| `backend/graphql/test/subscription-purchase.schema.test.ts` | 14 | 0 | |
| `backend/db/test/logic/billing/plan-catalog.repository.test.ts` | 16 | 0 | lane write/read coverage — no rename ripple (see note) |
| `backend/db/test/logic/billing/plan-catalog.service.test.ts` | 22 | 0 | lane validation roundtrips |
| `shared/locale/errors-namespace.parity.test.ts` | 8 | 0 | F6 |
| `shared/locale/notifications-namespace.parity.test.ts` | 102 | 0 | |
| `shared/locale/plans-namespace.parity.test.ts` | 4 | 0 | |
| `test/workflows/billing/subscription-purchase.journey.test.ts` | 10 | 0 | F1/F2/F3 guards cross its path — stayed 10/10 |

**Note on the dispatch's `plan-catalog.lane.test.ts`:** no file of that name exists; the lane coverage lives in `plan-catalog.repository.test.ts` (lane members write/read + lane-only patch) and `plan-catalog.service.test.ts` (lane validation roundtrips). Both run green; tsgo confirms the service-level rename produced zero import ripple.

## 4. Fallout Repairs Made (lint gate failures introduced by the F1–F8 edits)

| # | File | Finding | Repair |
|---|---|---|---|
| R-1 | `app/api/payments/webhook/route.ts` | oxlint `no-await-in-loop` on the F4 incremental body read | Rewrote `readBoundedBody`'s `for(;;)` as the documented sequential-iteration recursive helper (`readChunk(buffered, totalBytes)`) — one await per stream read step; byte-faithful decode + trailing flush preserved; suite re-run 31/0 |
| R-2 | `backend/graphql/pothos/billing/plan.pothos.ts` | oxlint `no-unnecessary-type-conversion` — `String(lane)` on an already-string union | Replaced with template interpolation `${lane}` (message identical) |
| R-3 | `backend/services/billing/subscription-activation.service.ts` | oxlint `max-lines-per-function` — `confirmPayment` 89 > 75 (F8 log blocks pushed it over) | Extracted two module-level helpers: `abortActivation(detail, context): never` (single fail-closed point — same log prefix/suffix, same context ids, same client-safe ConflictError copy) and `readActivationPlan(...)` (plan read + vanish abort + NULL-lane guard, returning the row with the narrowed non-null `balanceLane` via an explicit spread re-assertion). `confirmPayment` now ≤ 75 counted lines; behavior byte-identical; suite 12/0 |
| R-4 | `backend/services/billing/subscription-purchase.service.ts` | oxlint `max-lines` — 307 counted > 300 (F2/F3 additions) | `paymentGatewayOf` restructured from 9 widened-string consts + if-chain into the sanctioned widening-cast enum lookup (`Object.values(PaymentGateway).find(value => (value as string) === gateway)`) with the identical fail-closed `ConflictError` message — same identity mapping, same totality; ~30 counted lines saved; suite 18/0 |
| R-5 | `backend/services/billing/subscription-purchase.service.test.ts` | oxlint `consistent-function-scoping` — `interceptCheckoutDuring` captures nothing from its describe scope | Moved to module scope beside the other test helpers (docblock preserved); suite 18/0 |
| R-6 | `docs/billing/subscription-purchase.md` | sub-loop structurally fails on `.md` — oxlint "No files found to lint" (no markdown target; 13.1-outcome precedent) | Not a code defect. Quality checks run manually: jscpd 0 clones on the file, `biome check` exit 0. Documented, not "fixed" |

All repairs are behavior-preserving; every repaired file re-passed its sub-loop (`--lifecycle duplicates`) and its affected suites were re-run green afterwards.

## 5. Artifact-Grep Detail

Zero DEV1-006 tokens remain in the modified files. Remaining hits are pre-existing references to OTHER tasks' surfaces, all confirmed present in HEAD:

- `schema-surface.test.ts` — DEV1-013 handshake + DEV1-005 plan-catalog cross-refs (header note, banner, comment, test title), REQ-032 / REQ-060/061 (DEV3-004 attribution).
- `docs/billing/subscription-purchase.md` — INV-PAY2/3/4/6/7 spec-invariant references (acceptable category) + DEV1-007/008/009 future-work pointers.

No "Task x.y" hits anywhere in the modified set. **Verdict: no stragglers.**

## 6. Notes for the Orchestrator

- `bun run biome:check` applied no fixes; the working tree contains exactly the 13 modified files (plus this outcome + the worklog entry). Nothing committed, per dispatch.
- Carry-forwards unchanged from prior rounds (QG-4 lint-service child heap; B-1 snapshot formatting gate-sanctioned commit) — untouched by this pass.
