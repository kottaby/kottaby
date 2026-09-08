# Round-R9 Fixes — Outcome (Task R9-fixes)

**Date:** 2026-09-08 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

All five R9 items implemented and verified. Touched files: 9 code/test files (2 backend route+test, 1 backend service test, 1 frontend hook, 3 locale bundles/types, 1 UI component test, 1 gateway integration test) + this outcome + worklog. NO COMMITS.

## 1. Per-Fix Summary

### F1 (MEDIUM) — chaos afterAll deleted the append-only ledger outside the sanctioned suspension

`backend/services/billing/subscription-purchase.service.test.ts:585-595` — the production-tx chaos block's afterAll hard-deleted `student_payments` (and the `subscriptions` leg that fires the FK set-null UPDATE against surviving ledger rows) with NO `withImmutabilityTriggersSuspended` teardown. On a migrate-provisioned real PG the append-only DELETE guard + the amended UPDATE guard block both legs — the sibling schema/replay/roles/journey suites wrap this exact leg.

- The payments delete now runs inside `withImmutabilityTriggersSuspended(["student_payments"], …)` (imported from `@/test/helpers/db-cleanup`, the sibling import source), FIRST, before the claims/junction/subscriptions legs in strict child-first order — so the subscriptions delete never fires a set-null write against a surviving payment row (on trigger-less push-provisioned DBs the wrapper is a zero-DDT pass-through; the suite's afterAll stays correct on PGlite too).
- **Zero-residue probe added** — the siblings' load-bearing proof: post-teardown `Promise.all` `$count` over subscriptions / studentPayments / studentSubscriptions / subscriptionPurchaseIdempotency / users scoped to the chaos student, every count asserted 0.
- Misleading comment corrected ("the append-only ledger guard blocks this delete" → the payments ledger rows are un-deletable through their append-only DELETE guard — and the amended UPDATE guard also blocks the FK set-null the subscriptions delete would fire — so that leg runs under the sanctioned teardown-window trigger suspension, the sibling schema/replay/roles/journey teardowns wrap this exact leg).

### F2 — webhook body read: per-read deadline didn't bound TOTAL delivery + lingering per-read timers

`app/api/payments/webhook/route.ts:138-152` — the per-read deadline (`BODY_READ_DEADLINE_MS`, 30s) bounds ONE inter-chunk gap, not the delivery: a compliant drip (1 byte per 29s forever) held the connection indefinitely; and each incremental read allocated a fresh `AbortSignal.timeout` timer that lingered ~30s after every won read.

- **(a) Total delivery deadline**: new injectable holder `export const BODY_READ_TOTAL_DEADLINE_MS = { current: 60_000 }` (same single-field test-seam idiom as the per-read holder). `readBoundedBody` now races the ENTIRE recursive read against it; on timeout the reader is cancelled (best-effort, idempotent against the inner cancels) and the rejection rides the existing `PAYMENT_WEBHOOK_BODY_UNREADABLE` path — masked 400 envelope + the ONE correlated log line. The total timer is a manual `AbortController` + `setTimeout` cleared in `finally` the moment the read settles either way. Docblock: must exceed the per-read deadline (it bounds the SUM of many per-read windows plus decode work).
- **(b) No lingering timers**: `readChunkWithDeadline` replaced `AbortSignal.timeout(...)` with a manual `AbortController` + `setTimeout` + `clearTimeout` in `finally` — a won read leaves no surviving handle (and a deadline firing after an already-won read cannot fire at all, its timer being cleared).
- Route docblock updated honestly: the body bound bullet is now "**bounded THREE ways**" — byte cap (Content-Length up-front + incremental budget), per-read deadline (stall between chunks), total delivery deadline (the endless drip both other bounds cannot stop) — both timeouts cancel the reader and answer the same masked unreadable-body envelope.
- **Test** (`payments-webhook-route.test.ts`, +1): `a compliant-but-endless DRIP is cut off by the TOTAL delivery deadline → the same masked envelope` — per-read deadline injected WIDE (200ms) and total deadline injected SHORT (60ms), both restored in the finally; the stream drips a second chunk 40ms in (inside the per-read window) then never closes/never errors. Pins masked `PAYMENT_WEBHOOK_BODY_UNREADABLE` 400, zero payload echo, exactly one correlated log line, elapsed < 5s, `drippedChunks === 2` (the drip PROGRESSED — the per-read deadline provably never fired; the total deadline did), `cancelCalls === 1`, service never invoked. Existing per-read stall test untouched and green; suite re-run ×4 for the timing-sensitive path (stable).

### F3 — client sessionCount unbounded above the server ceiling

`frontend/views/admin/plans/hooks/usePlanForm.ts:102-105` — `intervalDays` mirrored `MAX_INTERVAL_DAYS` client-side but `sessionCount` did not mirror `MAX_SESSION_COUNT` (the R8 int4-overflow ceiling), so an over-cap value round-tripped into a generic server validation error.

- **Import-direction check performed (per the brief)**: frontend→backend imports are established only for generated types and pure enums (`@/backend/enum/*` in `RoleDashboardPage.tsx`/`withPageAuth.ts`); `plan-catalog.helpers.ts` is backend RUNTIME machinery (it drags `backend/lib/errors` into the client bundle) — importing it would violate the cross-layer rule. The literal is therefore **duplicated**: `const MAX_SESSION_COUNT = 1_000_000` next to `MAX_INTERVAL_DAYS`, with a docblock naming the mirrored server constant, the int4-overflow reason, why the duplication is deliberate, and that the server ceiling stays the authority (drift degrades to the generic server error, never to a persisted over-cap plan).
- Validation: the sessionCount check gained the `> MAX_SESSION_COUNT` leg (same shape as the intervalDays check) reusing the existing `validationSessionCountMessage` key — no new key needed (the brief's "add if missing" condition: it already exists in types+en+ar).
- Copy updated to the intervalDays message-key pattern (range in the copy): en `"Session count must be a whole number between 1 and 1000000."`, ar `"يجب أن يكون عدد الجلسات عددًا صحيحًا بين 1 و1000000."`; types docblock mentions the mirrored ceiling. Parity test green (the server-side errors-namespace `planSessionCountInvalid` copy is a different channel — the pre-ceiling invalid leg — untouched).

### F4 — updatePlan mock claimed the configured row's id for the laneless row

`test/ui/components/admin/PlanCatalogContainer.test.tsx:187` — `updatePlanMock` hardcoded `id: PLAN_CONFIGURED.id` in the mocked update result, so the laneless-row (id "12") edit test was handed a payload claiming row "11"'s id — Apollo's normalized cache would write the mocked fields onto the wrong entry.

- `updatePlanMock` now takes the edited row's `sourceRow: PlanFixture` (first param) and echoes the edited row's identity: `id` read from the mutation VARIABLES (`${variables.id}` — the generated variable type carries the ID scalar's `string | number` input union while the Plan result field is `string`; the template interpolation narrows without an assertion) and every untouched stored field (sessionCount/price/currency/intervalDays/isActive/deactivatedAt/createdAt/updatedAt) sourced from `sourceRow` — all four call sites updated (`PLAN_CONFIGURED` ×3, `PLAN_LANELESS` ×1).
- The laneless-row test gained the identity pin `expect(captures[0].id).toBe(PLAN_LANELESS.id)` (the update targeted the laneless row's OWN id). Suite stays **7/0**.

### F5 — gateway integration phone fixture was a PII-scrubber artifact

`frontend/graphql/test/gateway/gateway.integration.test.ts:231` — `phone: "+2[CPF_REDACTED]"` (a scrubber artifact baked into the fixture) restored to a plain synthetic number `"+201000000000"`. Registration validates presence only; the suite stays green (16/0).

## 2. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ EXIT 0 / 0 errors (interim failure caught & fixed at root: `variables.id` ID-scalar `string \| number` union vs the `string` result field — template interpolation, no assertion; final run clean) |
| `backend/services/billing/subscription-purchase.service.test.ts` | ✅ **19 pass / 1 skip (real-PG-gated concurrency) / 0 fail** (134 expect calls) — afterAll now suspension-wrapped + zero-residue probe |
| `app/api/payments/webhook/test/payments-webhook-route.test.ts` | ✅ **34 pass / 0 fail** (142 expect calls) — was 33; **+1 new** (total-deadline drip cut-off); timing-sensitive path re-run ×4, stable |
| `shared/locale/plans-namespace.parity.test.ts` | ✅ **4 pass / 0 fail** (266 expect calls) |
| `test/ui/components/admin/PlanCatalogContainer.test.tsx` | ✅ **7 pass / 0 fail** (58 expect calls) — scoped runner (bypass + `.env.test.ci` + four preloads); identity pin added without changing the count |
| `frontend/graphql/test/gateway/gateway.integration.test.ts` | ✅ **16 pass / 0 fail** — scoped run via `run-test.ts` (boots the server harness); synthetic phone accepted |
| `backend/services/billing/subscription-activation.service.test.ts` | ✅ **16 pass / 1 skip / 0 fail** (150 expect calls) — untouched, insurance re-run |
| `test/workflows/billing/subscription-purchase.journey.test.ts` | ✅ **11 pass / 0 fail** (107 expect calls) — REQUIRED gate; untouched this round (carries the R8 recipient-locale fixture change, uncommitted) |
| Sub-loop (`scripts/health/sub-loop.ts --lifecycle biome`, the R8 convention) | ✅ EXIT 0 on all **9** touched TS files (tsgo → oxlint → biome each), first-pass, no suppressions |
| `bun run check:duplicates` | ✅ 0 clones |

## 3. Notes & Carry-forward

- F1's chaos block still runs its concurrent test only on real Postgres (`testOnRealPostgres`); the afterAll suspension wrapper is environment-safe by construction (trigger-less DBs discover zero triggers and run the leg directly — zero DDL round-trips), matching the sibling teardowns' posture on PGlite.
- F2's total deadline deliberately shares the masked `PAYMENT_WEBHOOK_BODY_UNREADABLE` envelope and log path — from the wire, a total-deadline cut-off is indistinguishable from a stall or a mid-stream abort (no oracle for which bound fired).
- F3's duplicate literal is the sanctioned posture per the brief's cross-layer check: the only established frontend→backend runtime imports are pure enums; a client-bundle import of `plan-catalog.helpers` would drag the backend error machinery along. Drift risk is bounded: the server ceiling remains the authority.
- Pre-existing carries unchanged (QG-4 lint-service heap, B-1 snapshot.json gate-sanctioned formatting commit, PRE-1 plan-catalog anonymous-leg 401/403 split, sub-loop markdown oxlint limitation).
- Scope: `git status` = 9 code/test files (one of which, the journey suite, carries only the pre-existing uncommitted R8 change, untouched this round) + this outcome + worklog. **NO COMMITS** (orchestrator owns commits).
