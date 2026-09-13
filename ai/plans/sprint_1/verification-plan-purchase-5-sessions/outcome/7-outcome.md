# Task 7 — `purchaseVerificationPlan` GraphQL mutation — Outcome

**Date**: 2026-09-14
**Branch**: `feat/verification-plan-purchase-5-sessions`
**Environment**: sandbox, `DB_PROVIDER=pglite`

## Summary

The applicant-facing purchase surface is live: `purchaseVerificationPlan` is a
ZERO-ARGUMENT root mutation on the wire (`purchaseVerificationPlan:
PurchaseSubscriptionPayload!`) that resolves the purchaser identity exclusively
from `ctx.user.id`, consumes the propagation-only `ctx.idempotencyKey` verbatim,
propagates `ctx.locale`, and delegates in one call to
`VerificationPurchaseService.purchase(ctx.user.id, ctx.idempotencyKey ?? null,
ctx.locale)`. There is no input object at all (BOLA/BOPLA-proof by
construction — no plan id, no amount, no user id exists on the wire; an
argument-carrying probe dies at schema validation, never at the resolver), the
payload reuses the student purchase surface's `PurchaseSubscriptionPayload`
Pothos object (zero new Pothos types), and every DomainError (UNAUTHORIZED,
APPLICANT_NOT_FOUND, APPLICANT_COOLDOWN_ACTIVE, APPLICANT_ALREADY_CERTIFIED,
VALIDATION, PLAN_NOT_FOUND, DUPLICATE_REQUEST, PAYMENT_NOT_FOUND) propagates
UNCAUGHT to the masking boundary — no try/catch in the resolver.

## Files created

| File | Content |
|---|---|
| `backend/graphql/mutation/verification-plan-purchase.mutation.ts` | **CREATE** — flat file (same wiring as `subscription-purchase.mutation.ts`) registering the root field via `gqlSchemaBuilder.mutationField` at import time (no named exports). `authScopes: { authenticated: true }` ONLY — the applicant gate is service-level (keeps post-conversion re-application reachable for callers whose role has moved on while the effective audience stays identical); the `if (!ctx.user) throw new UnauthorizedError("Authentication required.")` branch is the TypeScript-narrowing guard, mirroring the `authenticated` scope's own denial verbatim (the applicant query's established pattern). Header docblock documents the inputless contract, the payload reuse, the key-propagation discipline, the uncaught-error posture, and the 401-channel rationale. |
| `frontend/graphql/test/teachers/verification-plan-purchase.test.ts` | **CREATE** — the GraphQL boundary suite (3 tests, see 7.TE). Mirrors `applicant-profile.test.ts` helpers (`describeGraphqlSuite`, `setupTestServerLifecycle` with the `TEST_SERVER_EXTERNAL` sandbox adaptation, `testClient`, per-request Bearer auth, `registerAndLogin` via the PUBLIC registerUser+login mutations, tracked-ids `afterAll` hygiene via `deleteUsersByIds`/`countUsersByIds`). Local `parse`d documents with the reason documented (the shared TypedDocumentNode lands with the purchase-dialog work; these denial probes never observe payload data). |

## Files modified

| File | Change |
|---|---|
| `backend/graphql/mutation/index.ts` | Barrel wiring — `import "./verification-plan-purchase.mutation";` appended (alphabetical, after `user.mutation`) AND the header docblock's per-file narration extended with the verification line so the header never drifts. |
| `frontend/graphql/generated/schema.graphql` | **Generated** (`bun run generate:gqlSchema`) — the Mutation type gains `purchaseVerificationPlan: PurchaseSubscriptionPayload!` with its description (5-line diff; no other schema churn — lexicographic sort kept it clean). |
| `frontend/graphql/test/warnings/warning-surfacing.test.ts` | Mutation census refresh (REQUIRED by that file's own contract — "every deployed Mutation root field is enumerated", enforced by its A1 drift-guard test): `purchaseVerificationPlan` added to `KNOWN_LIVE_MUTATION_FIELDS` + a docblock refresh note recording the explicit warning-propagation decision (resolves to the canonical `PurchaseSubscriptionPayload`, warning-incapable like `purchaseSubscription` — every denial rides `errors[]`). Without this row, the A1 introspection census fails CI the moment the mutation lands. |
| `ai/plans/.../tasks.md` | Task 7 checkbox lifecycle (7 + 7.QL/7.TE/7.SEC/7.SR/7.IV). |

## Generated outputs (what `generate:gqlSchema && bun codegen` produce)

- `bun run generate:gqlSchema` → **`frontend/graphql/generated/schema.graphql`** — CHANGED (the new root field; committed).
- `bun codegen` → **`frontend/graphql/generated/gql/graphql.ts`** — ran clean (✔ Generate) but produced a **zero-byte diff**: that file contains ONLY operation-derived types (input types, enums, operation results, TypedDocumentNodes — no base `Mutation` object type), and no document references the new field yet. The TypedDocumentNode types materialize when the shared purchase document lands in Task 9 and codegen re-runs (see carry-forward).

## Files NOT modified (and why)

- `backend/graphql/pothos/billing/purchase-checkout.pothos.ts` — the payload/checkout/input Pothos objects are reused verbatim; zero changes (the input type stays for the student mutation only).
- `backend/services/teachers/verification-purchase.service.ts` — the resolver is a one-line delegate; the service contract (Task 5) needed nothing.
- `backend/graphql/mutation/billing/index.ts` — the new file is a flat root-level mutation (plan §4.5 ruling: same wiring as `subscription-purchase.mutation.ts`), NOT a billing sub-directory member.
- Parallel-agent files (`test/workflows/**`, Task 4 journey) — untouched per coordination protocol.

## Verification results

| Check | Result |
|---|---|
| 7.QL sub-loop `--lifecycle duplicates` — `verification-plan-purchase.mutation.ts` | **exit 0** (tsgo → oxlint → biome → lint:type-aware → duplicates) |
| 7.QL — `mutation/index.ts` (barrel) | **exit 0** |
| 7.QL — `verification-plan-purchase.test.ts` | **exit 0** |
| 7.QL — `warning-surfacing.test.ts` (census) | **exit 0** |
| `bun tsgo` (project-wide) | **0 errors** (`grep -c "error TS"` → 0; combined tree incl. parallel Task 4/5/6 files) |
| `bun biome:check` (project-wide) | **0 warnings** ("Checked 1798 files … No fixes applied") |
| 7.TE `bun run test:graphql frontend/graphql/test/teachers/verification-plan-purchase.test.ts` (canonical scoped runner) | **exit 0 — ALL TESTS PASSED (0 failed)**. On pglite the suite is skipped wholesale by design (`describeGraphqlSuite` = `describe.skip` per `test/helpers/skip-when-pglite.ts` — the dev server + test process cannot share pglite state); raw bun accounting: `0 pass / 6 skip / 0 fail`. The suite executes for real against real PostgreSQL in CI (the skip helper's documented contract). |

### 7.TE — coverage delivered (the three mandated denial tiers)

1. **Anonymous → UNAUTHORIZED** — no `Authorization` header; the `authenticated`
   scope's UnauthorizedError is asserted via `expectMutationError(..., "UNAUTHORIZED")`
   (401 semantics — never FORBIDDEN).
2. **Student (non-applicant) WITH a key → APPLICANT_NOT_FOUND** — public
   registration (role student → `students` row, no `applicants` row) + login +
   per-attempt random-UUID `x-idempotency-key` header; the service's in-tx
   applicant gate rejects (BFLA: no privilege gain possible; the checkout
   attempt rolls back with the transaction).
3. **Applicant WITHOUT the key header → VALIDATION** — public registration
   (role teacher → `applicants` row `pending`) + login; the pre-DB
   `isCarryableIdempotencyKey` guard rejects the absent key with the localized
   `subscriptionPurchase.idempotencyKeyRequired` validation error.

Happy-path purchase deliberately NOT driven here (no plan-seed dependency) —
owned by `verification-purchase.service.test.ts` (15 pass / 0 fail / 1 skip)
and the journey suite.

## 7.SEC — authScope + narrowing guard + error channel

- **authScopes**: `{ authenticated: true }` exactly — the anonymous leg throws
  the scope's UnauthorizedError (401 channel); the narrowing guard duplicates
  that denial only for TypeScript (no non-null assertion dereference of the
  nullable context), matching the `myApplicantProfile` query's reviewed
  pattern. NO role leg — the applicant predicate is service-side per the
  scope-composition rule (never widened for admins; post-conversion
  re-appliers stay reachable).
- **BOLA/BOPLA**: inputless operation — there is structurally no id, plan, or
  amount on the wire; identity is `ctx.user.id` only.
- **Uncaught errors**: the resolver body is guard → one delegate call; no
  try/catch, no error formatting, no log-classification (masking belongs to
  the boundary finalizer alone).
- **Key hygiene**: the key is passed through verbatim (`ctx.idempotencyKey ??
  null` — the `?? null` leg is type-level only); the mutation file logs
  nothing and imports no logger; grep-verified no key material reaches any
  log call in the flow (Task 5's `logDomainError` sites log
  code/entity/entityId/locale only).

## 7.SR — semantic checklist

- **No local types**: the mutation file defines zero types — only the reused
  `PurchaseSubscriptionPayloadPothosObject` import; the payload object,
  checkout descriptor, subscription, and payment Pothos objects are all
  unchanged and shared with the student surface.
- **Barrel wiring per `backend/graphql/mutation/AGENTS.md`**: flat
  `<entity>.mutation.ts`, side-effect import in the root barrel, no named
  exports, no direct imports from outside the directory, header docblock kept
  truthful.
- **No plan-artifact references**: `rg "REQ-[0-9]|DEV1-|DEV2-|tasks\.md|specs\.md|plan\.md|§"`
  over mutation + barrel + test files → zero matches; comments/JSDoc describe
  domain behavior only.
- **No dead code, no module state, no env reads, no `console.*`, no
  `oxlint-disable`**; the census addition is data + a docblock note only.
- **git scope**: mutation (new) + barrel + generated schema + 2 test files
  (new boundary suite; census refresh) + tasks.md + this outcome file. Task
  5/6 files remain untouched uncommitted work of their own tasks.

## 7.IV — rule files read and honored

Printed by the sub-loops and read in full: root `AGENTS.md`,
`backend/AGENTS.md`, `backend/graphql/AGENTS.md`,
`backend/graphql/mutation/AGENTS.md`,
`.agents/instructions/backend.instructions.md`; plus
`frontend/graphql/test/AGENTS.md` (test-suite rules) and the plan protocol
files. Compliance highlights: resolvers delegate to services with locale
propagation (never repos, never inline business logic); DomainError-only
throws; masking boundary owns finalization; no dynamic imports in Pothos
files; mutation files never define Pothos types; test rules — shared helpers
from `@/test/helpers` only, no raw fetch/string queries, per-request headers,
explicit-id hygiene cleanup, generated enums/types from the generated module
(where documents exist), interface-layer separation respected (the suite
provisions identities through the PUBLIC GraphQL mutations — no backend repo/
schema/service imports at all).

## Carry-forward for Task 9 (frontend purchase dialog + documents)

1. **Create the shared document, then re-run codegen** —
   `frontend/graphql/sharedDocuments/billing/verification-purchase.documents.ts`
   with `purchaseVerificationPlanMutationDocument`
   (`mutation PurchaseVerificationPlan { purchaseVerificationPlan {
   subscription { id … } payment { id … } checkout { provider
   providerReference checkoutUrl } } }` — `id` on every object), exported
   through `billing/index.ts`. After it lands, `bun run generate:gqlSchema &&
   bun codegen` will extend `frontend/graphql/generated/gql/graphql.ts` with
   the operation types. The schema side is ALREADY committed (the SDL root
   field exists; `PurchaseSubscriptionPayload`/`PaymentCheckout` types are
   unchanged from DEV1-006).
2. **Exact generated type names to expect** (typed-document-node +
   typescript-operations plugins, `extractAllFieldsToTypesCompact`): the
   operation result type `PurchaseVerificationPlanMutation` with the picked
   selection types (`…SubscriptionFragment`-style inline picks of the
   `Subscription`/`StudentPayment`/`PaymentCheckout` schema objects), plus the
   variables type `PurchaseVerificationPlanMutationVariables` = `{}`
   (Record<never, never>-shaped exact object — the mutation is inputless, so
   the document must declare NO variables and `useMutation` calls pass none).
   The payload field paths mirror the student surface:
   `data.purchaseVerificationPlan.subscription.{id,status,planId,…}`,
   `.payment.{id,amount,currency,status,…}`,
   `.checkout.{provider,providerReference,checkoutUrl}` (`checkoutUrl` is
   `string | null` — the mock gateway's null must not trigger a redirect).
3. **Wire contract**: `useMutation(purchaseVerificationPlanMutationDocument)`
   from `@apollo/client/react`, per-attempt `x-idempotency-key` context header
   (rotate on success only), failure branching on `extensions.code`
   (`extractErrorCode`) — the three denial codes this suite pins
   (UNAUTHORIZED never reaches the UI's authenticated tree;
   APPLICANT_NOT_FOUND/VALIDATION are the boundary-possible shapes there) plus
   the service-tier codes (APPLICANT_COOLDOWN_ACTIVE, APPLICANT_ALREADY_CERTIFIED,
   DUPLICATE_REQUEST, PLAN_NOT_FOUND).

## Cross-file dependencies

- `verification-plan-purchase.mutation.ts` ← imports
  `VerificationPurchaseService` from the `@/backend/services` barrel
  (registered by Task 5) and `PurchaseSubscriptionPayloadPothosObject` from
  the billing Pothos module (DEV1-006, unchanged).
- `mutation/index.ts` (side-effect barrel) ← `gqlSchema.ts` single import —
  the field registration order in the barrel does not matter; the barrel
  header narration and the SDL are the two drift mirrors for this surface.
- `warning-surfacing.test.ts` census ← must enumerate every future root
  mutation (A1 fails CI otherwise) — any plan amending the mutation surface
  updates both the barrel narration and that census.
- `verification-plan-purchase.test.ts` ← CI (real PostgreSQL) executes it;
  Task 9's shared document replaces nothing here (the local parse documents
  stay as the denial-tier probes).

## Deferred items

None added — no out-of-scope discoveries this task (ledger D1–D6 unchanged).
