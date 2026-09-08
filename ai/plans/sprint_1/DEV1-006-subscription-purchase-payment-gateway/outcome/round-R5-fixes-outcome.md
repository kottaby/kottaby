# Round-R5 Fixes — Verification Outcome (Task R5-fixes)

**Date:** 2026-09-08 · **Tree:** `/home/z/feat-wt` (worktree, `feat/DEV1-006-subscription-purchase-payment-gateway`) · **Commits:** none (orchestrator owns commits)

All five R5 items (F1–F5) fixed sequentially with verification after each. Touched files: 7 (listed per fix below).

## 1. Fix Detail

| Fix | Change | File |
|---|---|---|
| **F1 (CRITICAL) — lowercase `dev1-006` tokens (case-sensitive-grep regression)** | 3 occurrences replaced with the file's established domain vocabulary: frozen-mutation docblock "the dev1-006 student purchase write" → "the subscription purchase write"; frozen-query docblock "the dev1-006 caller-scoped subscription read" → "the subscription purchase caller-scoped read"; Mutation-root test title "the dev1-006 purchase write" → "the subscription purchase write" (title stays accurate — the field IS `purchaseSubscription`; assertions untouched). Case-insensitive re-grep of the file AND `schema-surface.test.ts`: zero `dev1-006` tokens remain (schema-surface only ever carried the pre-existing uppercase other-task refs `DEV1-013`/`DEV1-005`, out of scope) | `backend/graphql/test/sdl-static-assertions.test.ts` |
| **F2 — locale dropped on `mySubscriptions`** | resolver now calls `SubscriptionPurchaseService.listOwn(ctx.user.id, ctx.locale)` — the optional `locale` parameter of `listOwn(studentUserId, locale?, tx?)` is fed exactly as the sibling `purchaseSubscription` mutation propagates `ctx.locale` (the context field is non-optional, always materialized per `gqlContextFactory.ts`). Service docblock needed no change (it already documents the optional-locale symmetry); the resolver file's docblock claim "Resolver delegates to the services layer with locale propagation" is now true in code | `backend/graphql/query/subscription.query.ts` |
| **F3 — `subscriptionCreditLaneOf` fail-open (unknown stored lane silently credited Reviews)** | mapper is now FAIL-CLOSED: explicit `Hifz`/`Tajweed` branches only; the unknown-stored-lane fallthrough calls `abortActivation("stored plan balance lane is not a member of the closed credit-lane vocabulary", { reference, subscriptionId, planId, storedLane })` — the same quarantine-style `logger.error` + generic `"Payment could not be processed."` `ConflictError` discipline the file's other mid-activation breaches use (`return abortActivation(...)` satisfies the `never` totality). Call site passes correlation ids from the tx scope; the throw rolls the whole activation unit back (subscription stays pending, zero credit, gateway retry re-classifies). Docblock rewritten from "total over the closed pg-enum vocabulary (the reviews member closes the union)" to the loud-over-silent-wrong fail-closed contract. Activation suite grepped: it NEVER pinned the old Reviews fallback (no test changes needed; NULL-lane fail-closed case untouched and green) | `backend/services/billing/subscription-activation.service.ts` |
| **F4 — client validation missing the 3650 `intervalDays` ceiling** | `validate()` now rejects `intervalDaysNum > MAX_INTERVAL_DAYS` (new `const MAX_INTERVAL_DAYS = 3650`, docblock cross-references the server-side `MAX_INTERVAL_DAYS` in `backend/services/billing/plan-catalog.helpers.ts`); 3651+ is stopped client-side with the field's own message instead of round-tripping into the generic server `PLAN_INTERVAL_DAYS_OUT_OF_RANGE` error. The existing `validationIntervalDaysMessage` key was reused (no new key needed) and its copy updated to state the bounds — en "Interval days must be a whole number between 1 and 3650." / ar "يجب أن تكون مدة الصلاحية بالأيام عددًا صحيحًا بين 1 و3650." (types file unchanged — key already declared; no new server-field-error projection seam built, per dispatch) | `frontend/views/admin/plans/hooks/usePlanForm.ts`, `shared/locale/en/plans/index.ts`, `shared/locale/ar/plans/index.ts` |
| **F5 — create-path toast fired before `await refetch()`** | create path reordered to mutation → refetch → toast → close. The refetch is extracted into module-level `refetchAfterCreate(refetch)`: a refetch rejection is logged (`logger.error`, caller-tagged, "the plan IS created; closing with the success toast.") and swallowed — it can no longer surface as `formGlobalError` after the success toast with the dialog left open (the contradiction that invited a duplicate submission). A failed refetch still toasts + closes because the create committed; failure of the mutation itself keeps the original catch path (error alert, dialog open). Mirrors the edit path, where the mutation alone decides the dialog's fate | `frontend/views/admin/plans/hooks/usePlanFormDialog.ts` |

## 2. Verification Table

| Check | Result |
|---|---|
| `bun run tsgo` | ✅ EXIT 0 (run after F2, after F4/F5, and again final) |
| `backend/graphql/test/sdl-static-assertions.test.ts` | ✅ **33 pass / 0 fail** (179 expect calls) |
| `backend/graphql/test/schema-surface.test.ts` | ✅ **42 pass / 0 fail** (264 expect calls) |
| `backend/services/billing/subscription-activation.service.test.ts` | ✅ **12 pass / 1 skip / 0 fail** (108 expect calls) |
| `backend/db/test/logic/billing/plan-catalog.service.test.ts` | ✅ **24 pass / 0 fail** (79 expect calls) |
| `shared/locale/plans-namespace.parity.test.ts` | ✅ **4 pass / 0 fail** (266 expect calls) |
| `test/ui/components/admin/PlanCatalogContainer.test.tsx` (scoped: `KOTTABY_TEST_RUNNER_OK=1 TEST_CI=1 TEST_SERVER_MODE=production` + `.env.test` + the four UI preloads) | ✅ **7 pass / 0 fail** (59 expect calls) |
| Extra regression sweep around F2/F3: subscription-purchase schema / roles / replay suites | ✅ 14/0, 10/0, 9/0 |
| sub-loop per touched file (`sub-loop-uncommitted.ts --lifecycle duplicates --no-stage`: tsgo → oxlint → biome → lint:type-aware → check:duplicates) | ✅ EXIT 0 — all 7 files green on every stage |
| Artifact grep over ALL diff files `git diff --name-only ffce457 HEAD \| xargs grep -inE "dev1-006"` | ✅ zero source hits — every hit is the uppercase ticket id inside pre-existing `ai/plans/...` planning/outcome artifacts (the sanctioned home of the ticket id); lowercase `dev1-006` count across the diff = **0**; per-file `grep -inE "dev1-[0-9]{3}"` over the 7 touched files shows only pre-existing other-task cross-refs (`DEV1-013`, `DEV1-005`, `dev3-*`) at frozen-baseline comment sites |
| `git status` | ✅ exactly the 7 touched files + this outcome + worklog; NO COMMITS |

## 3. Notes for the Orchestrator

- F1's token at line 141 straddled a line wrap, so the phrase became "the subscription purchase caller-scoped read" across the break — same sentence, still alphabetical-order prose, no baseline arrays touched.
- F3's mapper signature now takes a small correlation object (`reference`, `subscriptionId`, `planId`) so the abort log carries the ids the other `abortActivation` call sites carry; the mapper stays module-private with exactly one call site.
- F4 reuses the existing message key (R5 dispatch's "if no suitable key exists" branch did not trigger); parity suite confirms en/ar key sets still match.
- F5 keeps `onSuccess` (the toast hand-off) OUT of the dialog-close error path only for the refetch leg — a genuine mutation failure still lands in the existing catch. The success toast now fires strictly after the refetch resolves, so no success+error simultaneity is possible.
- Pre-existing carries unchanged (QG-4 lint-service heap, B-1 snapshot.json gate-sanctioned formatting commit). Nothing committed.
