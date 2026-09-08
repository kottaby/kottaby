# Round-R2 Fixes — Verification Outcome (Task R2-fixes)

**Date:** 2026-09-06 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

All six R2 review items (F1–F6) fixed sequentially with per-fix verification. Accepted items left untouched as mandated. Domain-only comments throughout; artifact grep clean (only pre-existing other-task cross-refs confirmed present at HEAD).

## 1. Per-Fix Verification

| Fix | Change | Verification |
|---|---|---|
| F1 (HIGH) — production-path chaos test | `subscription-purchase.service.test.ts` chaos block now mints ONE idempotency key (`sharedKey`) and rides it on BOTH `Promise.allSettled` attempts (mirrors the activation suite's chaos test, which reuses `pair.reference`); in-code comment pins the same-key double-submit invariant. `Promise.allSettled` structure + one-success/one-conflict (`ConflictError`, `DUPLICATE_REQUEST`)/one-pair + claim→winner assertions unchanged | Suite 18 pass / 0 fail / 1 sanctioned PGlite skip (the chaos test is `testOnRealPostgres`-gated and skipped here — same gate as the activation mirror). Coverage-map bullet ("SAME key") now matches the test body exactly |
| F2 (LOW) — webhook reader hardening | `route.ts`: (a) the bounded body read moved under its own `try/catch` → a mid-stream `reader.read()` rejection now answers the masked 400-family envelope (`PAYMENT_WEBHOOK_BODY_UNREADABLE`, generic "Webhook payload rejected." copy) with exactly ONE correlated `logger.error` line (fixed diagnostic + requestId; the raw transport error is deliberately unread) instead of escaping as an uncaught route error; (b) `readBoundedBody` rewritten: chunks accumulate as `Uint8Array`s, ONE join (`joinChunks`) + single UTF-8 decode after the last chunk (no per-chunk string concatenation → no O(n²) under adversarial 1-byte chunks), and `reader.cancel()` (best-effort, rejection swallowed) fires before the over-cap `null`; still the sanctioned recursive helper (no await in loop). Route docblock envelope bullet extended | Suite 32 pass / 0 fail = baseline 31 + 1 new abort-pin test ("a request stream that ERRORS mid-read answers the masked 400-family envelope"): broken `ReadableStream` (enqueue → `controller.error`) → asserts 400 + `PAYMENT_WEBHOOK_BODY_UNREADABLE` + zero payload/transport echo on the wire + exactly one correlated log with requestId parity + service never invoked. 64_000/64_001 boundary tests stayed green; multibyte-split-across-chunks test stayed green (single decode over reassembled bytes is byte-faithful) |
| F3 (LOW) — mapper consistency | `subscription-purchase.service.ts`: `paymentGatewayOf` now aborts with ONE correlated diagnostic log (`storedGateway`) + `throw new ConflictError(PAYMENT_PROCESSING_CONFLICT_MESSAGE)` — the client-safe "Payment could not be processed." copy, mirroring the activation service's `abortActivation` discipline (the internal vocabulary text no longer reaches `mySubscriptions`); `subscriptionStatusOf` made fail-closed: the suspended member is mapped explicitly (`STATUS_SUSPENDED` widened const), and an unknown stored status logs + throws the same generic conflict instead of silently degrading to `Suspended` (loud > silent-wrong; pgEnum makes it unreachable) | Suite 18 pass / 0 fail / 1 skip — mappers exercised via the listing happy-path rows (typed-enum ordering test) still green; tsgo confirms all paths return/throw |
| F4 (LOW) — plan-catalog helpers | `plan-catalog.helpers.ts`: the `23505` leg of `toPlanWriteDomainError` now delegates to the shared `isPgUniqueViolation` (`@/backend/lib/errors`, cycle-safe visited set, Error-cause walk) — the local duplicate handling is deleted; the `23514` leg stays local as `isPgCheckViolation`, rewritten into the same cycle-safe iterative walk style as the shared helper (the old ad-hoc recursive object walk lacked the visited set) | plan-catalog service suite 22/0, repo suite 16/0 |
| F5 (LOW) — comment-only fixes | (a) `schema-surface.test.ts` subscription-root test title + comment reworded to the enforced contract: the entity ships as `StudentSubscription` on the wire, `Subscription` is reserved by default-root naming (matches the `SUBSCRIPTION_PURCHASE_TYPE_NAMES` docblock); assertion unchanged. (b) `sdl-static-assertions.test.ts` retirement rationale reworded to the accurate indistinguishability rationale (the AST ban is undecidable on the artifact tier, not because the entity "legitimately carries" the name). (c) `schema-surface.test.ts` file-header freeze enumeration extended with the subscription-purchase pins (purchaseSubscription, mySubscriptions, the four settlement enums, the five named types) + the `RECONCILED_*` re-anchoring sentence | schema-surface 42/0, sdl-static-assertions 33/0 — zero behavior deltas, comment-only |
| F6 (LOW) — lane vocabulary | NEW `frontend/views/admin/plans/balanceLaneVocabulary.ts`: ONE `as const` tuple (`BALANCE_LANE_MEMBERS`, `as const satisfies readonly SubscriptionCreditLane[]`) as the single source; BOTH consumers derive from it — the select options (`BALANCE_LANE_OPTIONS`) are the tuple, and the value→member map (`BALANCE_LANE_BY_VALUE`) is reduce-derived from the tuple with a compile-time exhaustiveness gate (`BalanceLaneVocabulary`: `Exclude<SubscriptionCreditLane, BalanceLaneMember> extends never ? lookup-type : "BALANCE_LANE_MEMBERS must list every … member"` — a lane joining/leaving the wire enum without the tuple fails the build with a self-documenting error; drift probe verified via a throwaway tsgo run). `PlanFormFields.tsx` + `usePlanForm.ts` now import from the vocabulary module; their local duplicate literals are deleted. No casts, no behavior change (lookup still answers `SubscriptionCreditLane \| undefined` for raw strings) | Scoped UI run (10.2 mechanism: `TEST_SERVER_MODE=production` + `.env.test.ci` + the four preloads): `PlanCatalogContainer.test.tsx` **7 pass / 0 fail** (expect-count 60–61 across runs — `waitFor` poll variance, not coverage; 12.1 pinned 7/0/61) |

## 2. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ 0 errors (re-run after F2/F3, after F6, and again at the end) |
| Suites (mandated runner, serialized) | ✅ see §3 |
| `sub-loop <file> --lifecycle duplicates` ×10 touched files | ✅ 10/10 exit 0 (tsgo → oxlint → biome → lint:type-aware → check:duplicates each) |
| `bun run check:duplicates` (repo-wide) | ✅ "Found 0 clones." exit 0 |
| Artifact grep over touched files (`DEV1-[0-9]{3}`, `REQ-[0-9]+`, `Task x.y`, R1/R2) | ✅ zero refs introduced; only pre-existing other-task cross-refs (DEV1-005/013, DEV3-*, REQ-*) confirmed present at HEAD |
| `git status` | ✅ exactly the 10 intended files (9 modified + 1 new `balanceLaneVocabulary.ts`) + this outcome + worklog + the pre-existing untracked R1 outcome file; NO COMMITS |

One oxlint warning caught and fixed during verification: `no-accumulating-spread` on the vocabulary reduce → accumulator mutation form (lint help-sanctioned); re-lint 0 warnings, UI suite re-run green.

## 3. Suite Counts (final state)

| Suite | Pass | Fail | Notes |
|---|---:|---:|---|
| `backend/services/billing/subscription-purchase.service.test.ts` | 18 | 0 | +1 sanctioned PGlite skip (F1 chaos test, same-key now, real-PG gated) |
| `app/api/payments/webhook/test/payments-webhook-route.test.ts` | **32** | 0 | baseline 31 + 1 new F2 abort-pin test (the dispatch's "webhook 31" was the pre-fix count; F2 explicitly mandates pinning the abort behavior) |
| `backend/services/billing/subscription-activation.service.test.ts` | 12 | 0 | +1 sanctioned skip — untouched by R2, re-run as regression |
| `backend/db/test/logic/billing/plan-catalog.service.test.ts` | 22 | 0 | F4 |
| `backend/db/test/logic/billing/plan-catalog.repository.test.ts` | 16 | 0 | F4 |
| `backend/graphql/test/schema-surface.test.ts` | 42 | 0 | F5a/F5c comment-only |
| `backend/graphql/test/sdl-static-assertions.test.ts` | 33 | 0 | F5b comment-only |
| `backend/graphql/test/subscription-purchase.roles.test.ts` | 10 | 0 | untouched, re-run as regression |
| `backend/graphql/test/subscription-purchase.replay.test.ts` | 9 | 0 | untouched, re-run as regression |
| `backend/graphql/test/subscription-purchase.schema.test.ts` | 14 | 0 | untouched, re-run as regression |
| `test/workflows/billing/subscription-purchase.journey.test.ts` | 10 | 0 | F1/F3 guards cross its path — stayed 10/10 |
| `test/ui/components/admin/PlanCatalogContainer.test.tsx` (scoped, 10.2 mechanism) | 7 | 0 | F6; expect-count 60–61 (waitFor poll variance; 12.1 pinned 61) |

## 4. Accepted Items (not changed, rationale)

| Item | Rationale |
|---|---|
| `paymentAmountMismatch` locale key | Plan-mandated surface (REQ-051 lists it); the quarantine answers `processed: false` without throwing, so the key is reachable copy, not dead text — kept verbatim |
| `SubscriptionRepository.findById` | Plan-mandated repo surface with a test pin of its own; removing it would break the pinned contract, not just an unused method |

## 5. Notes for the Orchestrator

- The webhook suite count moves 31 → 32 (+1): F2's mandate ("the abort behavior can be pinned by a test asserting the masked envelope is produced when the body stream errors") required one new test; all pre-existing 31 pass unchanged.
- The new `frontend/views/admin/plans/balanceLaneVocabulary.ts` is deliberately NOT added to the plans barrel `index.ts` — it is view-internal (direct-path import, `planCatalogFormatting` precedent), consumed exactly twice.
- Working tree = the 10 fix files + this outcome + worklog entry; the untracked R1 outcome file predates this round. Nothing committed, per dispatch.
