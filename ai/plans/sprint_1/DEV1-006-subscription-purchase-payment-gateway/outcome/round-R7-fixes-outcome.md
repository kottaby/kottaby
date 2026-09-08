# Round-R7 Fixes — Outcome (Task R7-fixes)

**Date:** 2026-09-08 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

All three R7 items (F1 regression, F2 test gap, F3 arithmetic guard) implemented, pinned with tests, and verified. Touched files: 4 code files + 1 docs-consistency repair + this outcome + worklog. NO COMMITS.

## 1. Per-Fix Summary

### F1 (HIGH — regression) — exhaustive 3-case lane mapper

`backend/services/billing/subscription-activation.service.ts` — `subscriptionCreditLaneOf` mapped only `hifz`/`tajweed` and aborted the unit on `reviews`, wrongly treating a legitimate, seeded, documented lane (the pgEnum member behind the seeded-active "New Teacher Verification & Evaluation Plan"; supported by `CREDIT_LANE_BALANCE_COLUMNS`; promised "like any other plan" by the docs) as an invariant breach.

- Rewritten as an exhaustive `switch` in the canonical member order — `LANE_HIFZ → SubscriptionCreditLane.Hifz`, `LANE_TAJWEED → SubscriptionCreditLane.Tajweed`, `LANE_REVIEWS → SubscriptionCreditLane.Reviews` — mirroring `plan.pothos.ts`'s exhaustive mapper (vocabulary widened to plain strings from the enum object, never bare literals; never a cast).
- Fail-closed `default` branch retained: `return abortActivation("stored plan balance lane is not a member of the closed credit-lane vocabulary", { ...correlation, storedLane: lane })` — unreachable through the pgEnum; an invariant breach still rolls the unit back loud-over-silent-wrong.
- Docblock now reads: the mapper **maps every writable member explicitly; the default is an unreachable invariant breach** (vocabulary drift between the DB enum and this code), cross-referencing `plan.pothos.ts`'s lane mapper.

### F2 (test gap — same finding) — reviews-lane coverage

**Activation suite** (`backend/services/billing/subscription-activation.service.test.ts`, +2 tests, Tier-2 describe; suite header coverage map extended):

1. `reviews-lane activation: confirmed event credits balance_reviews by sessionCount — hifz/tajweed untouched` — `provisionPendingPair(tx, { balanceLane: SubscriptionCreditLane.Reviews, sessionCount: 5 })`, confirmed event → `{ processed: true }`; `balanceReviews = before + plan.sessionCount` (exactly 5); `balanceHifz`/`balanceTajweed` byte-identical to before; subscription `Active`, payment `Paid`, exactly one notification insert + one post-commit publish. Suite conventions kept: `runInRollback` + entity-setup fixtures + tracked spies (`afterEach` restore).
2. `legacy plan row past the interval-days activation ceiling quarantines — processed:false, zero writes, error logged` (F3's pin) — `provisionPendingPair(tx, { intervalDays: 100_000_000 })` (a direct-DB legacy row: the catalog ceiling guards writes only, the DB check enforces just `> 0`, so the insert is legal) → `{ processed: false }`; exactly ONE `logger.error` whose message contains "quarantined" and whose context carries `reference`/`subscriptionId`/`planId`/`intervalDays`; zero writes (subscription still `Pending` with NULL dates, payment `Pending`, all three lanes 0, no notification insert, no publish) — the honest ack prevents the non-domain-500 retry storm.

**Journey suite** (`test/workflows/billing/subscription-purchase.journey.test.ts`, +1 step → 11 pass / 0 fail):

- `step 11 — Student A: purchase on the seeded Reviews-lane plan + confirmed event → balance_reviews credited exactly` — a third real purchase against the SEEDED "New Teacher Verification & Evaluation Plan" (read in `beforeAll` by exact title from the seeded catalog; the row is environment seed state — read-only, never mutated, never tracked; a missing row fails `beforeAll` loudly with a named error instead of silently skipping). Premise asserted in-step: seeded plan `isActive === true` and `balanceLane === SubscriptionCreditLane.Reviews`. Confirmed event → `{ processed: true }`; `balance_reviews` delta = the seeded plan's `sessionCount` exactly, `balance_hifz`/`balance_tajweed` byte-identical; third subscription `Active` + payment `Paid`; pending set grew by exactly the third pair; ONE more persisted notification (purchaser's inbox = 2; the new row tracked via its `relatedEntityId` = the third subscription) and ONE more post-commit publish (publish spy = 2). Journey conventions kept: unique `${PREFIX}-key-reviews` idempotency key, every service-created row (`subscription`, `payment`, claim, junction, notification) registered in `TrackedFixtures` for the zero-residue teardown; the suite header's step list gained the step-11 narrative. Suite ran green twice consecutively (idempotent-teardown proof), and again after the final service refactor.

### F3 (LOW) — interval-days arithmetic guard (quarantine posture)

- `backend/services/billing/plan-catalog.helpers.ts`: `MAX_INTERVAL_DAYS = 3650` is now **exported** (docblock extended: shared within the same billing layer; the activation boundary re-guards because the DB check only enforces `> 0`). Import direction `subscription-activation.service.ts → plan-catalog.helpers.ts` is same-layer sibling → no cycle; `check:deps` rules unaffected.
- `subscription-activation.service.ts`: the guard sits in `readActivationPlan` (the plan read that feeds BOTH the window and the credit), immediately AFTER the NULL-lane branch and BEFORE the caller's `new Date(now.getTime() + plan.intervalDays * MS_PER_DAY)` arithmetic — so it is placed before the arithmetic as specified, while keeping `confirmPayment` inside the oxlint `max-lines-per-function` budget (first draft inlined the guard in `confirmPayment` and the sub-loop's oxlint stage failed the file at 86/75 lines; the guard moved into the read-and-guard helper = root-cause fix, zero suppressions). Quarantine posture identical to the NULL-lane sibling: one `logger.error("Payment webhook quarantined: plan interval days exceeds the activation-window ceiling — nothing mutated", { reference, subscriptionId, planId, intervalDays })` + `null` → the caller returns `{ processed: false }` pre-write (zero writes precede the plan read, so the unit commits nothing — no retry storm, operator follow-up owns both the settled charge and the out-of-range row).
- Docblocks updated coherently: `readActivationPlan` now documents BOTH reachable quarantines (NULL lane, interval past ceiling); file-header stage 3, namespace docblock's never-throws list, and the `{ processed: false }` return contract all name the legacy-row quarantine; the arithmetic comment now credits the guard (catalog writes are capped at the same ceiling) instead of the stale "can never overflow" claim.

### Docs consistency (same standard as R6's verifier)

`docs/billing/subscription-purchase.md` §7 step 3: "NULL-lane QUARANTINE guard" → "QUARANTINE guards", with the ceiling quarantine (3650 / DB check `> 0` / Invalid-Date 500 retry storm) added to the plan-read leg, so the canonical doc matches the shipped behavior. (Markdown cannot pass the sub-loop's oxlint stage — pre-existing tooling limitation, control-proven in R6.)

## 2. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ EXIT 0 / 0 errors (interim + final) |
| `backend/services/billing/subscription-activation.service.test.ts` | ✅ **14 pass / 1 skip (real-PG-gated concurrency) / 0 fail** (131 expect calls) — was 12+1skip; **+2 new** (reviews-lane credit, legacy interval-days quarantine) |
| `test/workflows/billing/subscription-purchase.journey.test.ts` | ✅ **11 pass / 0 fail** (107 expect calls) — was 10; **+1 new** (step 11 reviews-lane seeded plan); ran green twice consecutively + once post-refactor |
| `backend/services/billing/subscription-purchase.service.test.ts` | ✅ **18 pass / 1 skip / 0 fail** (127 expect calls) |
| `app/api/payments/webhook/test/payments-webhook-route.test.ts` | ✅ **33 pass / 0 fail** (131 expect calls) |
| `backend/graphql/test/subscription-purchase.schema.test.ts` | ✅ **14 pass / 0 fail** (86 expect calls) |
| `backend/graphql/test/subscription-purchase.roles.test.ts` | ✅ **10 pass / 0 fail** (32 expect calls) |
| `backend/graphql/test/subscription-purchase.replay.test.ts` | ✅ **9 pass / 0 fail** (42 expect calls) |
| `backend/db/test/logic/billing/plan-catalog.service.test.ts` | ✅ **24 pass / 0 fail** (79 expect calls) — re-run after the helpers export |
| sub-loop `<file> --lifecycle duplicates` | ✅ EXIT 0 on all **4 touched code files** (tsgo → oxlint → biome → lint:type-aware → jscpd). Note: the first draft of F3 failed the activation service's oxlint stage (`max-lines-per-function` 86 > 75); fixed by relocating the guard into `readActivationPlan` — no suppressions |
| `bun run check:duplicates` | ✅ **0 clones** |
| `bun run biome:check` (write+unsafe) | ✅ 1456 files checked, no fixes applied |
| `git status` | ✅ exactly the 4 code files + `docs/billing/subscription-purchase.md` + this outcome + worklog; NO COMMITS |

## 3. Notes for the Orchestrator

- The quarantine reuses the NULL-lane channel by construction: both fire inside `readActivationPlan` before ANY write, so a quarantined confirmed unit ends as an empty committed transaction — the tests pin zero writes (statuses, NULL dates, all three lanes, both notification seams).
- The reviews-lane mapper fix also makes the journey's step-11 end-to-end proof possible: without it, the seeded plan's confirmed delivery would have aborted the unit (the R5/R7 regression), so both suites together pin the fix at unit and cross-actor levels.
- The journey's step 11 treats the seeded plan as read-only catalog state (journey rule 9 untouched for fixtures): nothing about the row is mutated or registered; CI provisions it via `bun run db seed` before the service suites, and the local persistent PGlite test DB carries it (id 3, `reviews`, active, sessionCount 5).
- `MAX_INTERVAL_DAYS` remains the single source of the ceiling: catalog validators and the activation guard import the same constant (no literal duplication — jscpd clean).
- Pre-existing carries unchanged (QG-4 lint-service heap, B-1 snapshot.json gate-sanctioned formatting commit, PRE-1 plan-catalog anonymous-leg 401/403 split, sub-loop markdown oxlint limitation). Nothing committed.
