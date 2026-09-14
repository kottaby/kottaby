# Task 7 — `purchaseVerificationPlan` GraphQL mutation

- **Date:** 2026-09-14
- **Branch:** `feat/verification-plan-purchase-5-sessions`
- **Requirements:** REQ-2.1-2.6, REQ-8.4, REQ-9 · **Design:** plan.md §4.5 (binding mutation code), §5.1-5.3 (SDL + permission matrix + error contract)

## Summary of what was implemented

1. **CREATE `backend/graphql/mutation/verification-plan-purchase.mutation.ts`** per plan §4.5 EXACTLY — `gqlSchemaBuilder.mutationField("purchaseVerificationPlan", t => t.field({...}))` with `type: PurchaseSubscriptionPayloadPothosObject` (REUSED from `pothos/billing/purchase-checkout.pothos.ts` — zero new Pothos types), `authScopes: { authenticated: true }`, and an INPUTLESS resolve: `VerificationPurchaseService.purchase(ctx.user.id, ctx.idempotencyKey ?? null, ctx.locale)`. Context field names verified at the canonical factory (`gqlContextFactory.ts`): `ctx.user` (`RegistrationReturnType | null`), `ctx.locale` (`string`, always materialized), `ctx.idempotencyKey` (`string | null`, captured EXACTLY once from the raw `X-Idempotency-Key` header, optional in the type only so pre-existing fixtures stay compile-clean — the `?? null` leg is the type-level accommodation, mirrored byte-for-byte from the DEV1-006 pattern). The narrowing guard (`if (!ctx.user) throw new UnauthorizedError("Authentication required.")`) with the `query/billing/wallet.query.ts` cross-reference comment, the `UnauthorizedError` import (`@/backend/lib/errors`), the service import (top `@/backend/services` barrel — the service is barrel-exported via `backend/services/teachers/index.ts`), and the docblock conventions (contract / key-propagation / DomainErrors-uncaught / authScopes rationale / per-`mutation/AGENTS.md` notes) all mirror `subscription-purchase.mutation.ts` exactly. NO local types, NO input argument, NO try/catch — DomainErrors propagate uncaught to the masking boundary. The `authenticated`-only scope (no role leg) is the deliberate scope-composition posture: the applicant eligibility predicate lives at the SERVICE level inside the purchase transaction, so no role check is duplicated or split across layers.
2. **Register the barrel wiring** — `backend/graphql/mutation/index.ts` gained `import "./verification-plan-purchase.mutation";` (side-effect import, appended after `./user.mutation` per the barrel's flat-file alphabetical tail: plan-catalog < subscription-purchase < user < verification-plan-purchase) AND the header docblock gained the narration line ("`verification-plan-purchase.mutation.ts` wires the teacher-applicant verification purchase mutation (`purchaseVerificationPlan` — inputless; identity from the session, plan resolved server-side).") so the narrating header never drifts from the wired file set.
3. **Regeneration** — `bun run generate:gqlSchema && bun codegen` (both exit 0). `frontend/graphql/generated/schema.graphql` gained exactly the 5-line SDL delta below. `frontend/graphql/generated/gql/graphql.ts` is UNCHANGED by design: the codegen emits operation types only from documents under `frontend/graphql/sharedDocuments/**` + `frontend/views/**.documents.ts`, and the shared purchase document is Task 9's deliverable — when it lands, codegen will emit its `TypedDocumentNode`. Schema diff:
   ```graphql
   extend-equivalent within `type Mutation` (lexicographically sorted):
     """
     Purchase the teacher verification plan; identity from the session, plan resolved server-side.
     """
     purchaseVerificationPlan: PurchaseSubscriptionPayload!
   ```
4. **7.TE — CREATE `frontend/graphql/test/teachers/verification-plan-purchase.test.ts`** (3 wire-boundary denial tests) mirroring `applicant-profile.test.ts` EXACTLY for the harness: `describeGraphqlSuite` + `setupTestServerLifecycle()` + shared `testClient`, public `registerUserMutationDocument` → `loginMutationDocument` `registerAndLogin` helper (same shape: `uniqueEmail` randomizer, `testCredential` const named to dodge `sonarjs/no-hardcoded-passwords`, `RegistrationOutcome`, `createdUserIds` id-tracking), per-request `Authorization: Bearer <accessToken>` context headers, describe-scoped `afterAll` hygiene via shared `deleteUsersByIds` + `countUsersByIds`, and error assertions through the shared `expectMutationError` helper (Apollo v4 `CombinedGraphQLErrors` → `extractErrorCode`). Cases:
   - **anonymous (no Bearer) → UNAUTHORIZED** — the `authenticated` authScope denies pre-resolver (401 channel, never FORBIDDEN).
   - **STUDENT (non-applicant) + valid `x-idempotency-key` header → APPLICANT_NOT_FOUND** — the key rides the per-request header exactly as `gqlContextFactory` captures it (propagation-only); the service's in-tx applicant gate rejects the non-applicant; zero committed writes pinned by a committed-state probe (`subscriptions`/`subscription_purchase_idempotency` counts by user id = 0/0).
   - **TEACHER applicant (public registration provisions the pending `applicants` row) WITHOUT a key → VALIDATION** — the pre-DB key guard rejects the absent header before any database work; same zero-writes probe.
   - The happy-path purchase is deliberately NOT duplicated here (owned by the service suite + J1 journey; REQ-8.4's seed-dependency note).
   - **Document:** a LOCAL `parse`d document carries the selection set (payload contract: `subscription { id status } payment { id status } checkout { provider providerReference checkoutUrl }`) — the shared TypedDocumentNode is Task 9's file; `parse` yields the same DocumentNode and avoids the `graphql-tag` UMD crash under the `@/backend/db` fixture chain (the sibling's documented posture). The header-key mechanism is the live-server counterpart of the in-process replay suite's context capture.
   - **Plan fixture:** the ACTIVE verification plan is provisioned as a committed direct-DB fixture in `beforeAll` (canonical title constant + `VERIFICATION_PLAN_SESSION_COUNT`, "150.00"/EGP/14, `SubscriptionCreditLane.Reviews`, active — the seeded product shape) because the flow resolves the plan SERVER-side BEFORE the applicant gate: without a catalog member the student probe would surface `PLAN_NOT_FOUND`, not the mandated `APPLICANT_NOT_FOUND`. Resolution picks the oldest active same-title row, so on a seeded catalog the pre-existing row wins and the fixture is inert; it is tracked by id and hard-deleted (with a re-probe) in the same `afterAll`.

## Files created/modified

| File | Change |
|---|---|
| `backend/graphql/mutation/verification-plan-purchase.mutation.ts` | **CREATE** — the inputless `purchaseVerificationPlan` root field (plan §4.5, DEV1-006 pattern mirrored) |
| `backend/graphql/mutation/index.ts` | + side-effect import (alphabetical tail position) + header narration line for the new file |
| `frontend/graphql/generated/schema.graphql` | **GENERATED** (+5 lines) — the new `purchaseVerificationPlan: PurchaseSubscriptionPayload!` field + description block |
| `frontend/graphql/generated/gql/graphql.ts` | **GENERATED — verified UNCHANGED** (no shared document references the field yet; Task 9's document will produce its TypedDocumentNode) |
| `frontend/graphql/test/teachers/verification-plan-purchase.test.ts` | **CREATE** — 3-case wire-boundary denial suite (7.TE) |
| `ai/plans/.../outcome/7-outcome.md`, `tasks.md`, `worklog.md` | Plan artifacts (this file; Task-7 checkbox flips; worklog entry) |

**Files NOT modified (deliberately):** `backend/graphql/pothos/billing/purchase-checkout.pothos.ts` (payload objects reused as-is), `backend/graphql/gqlSchema.ts` / `gqlSchema.definitions.ts` (the mutation barrel is already imported there), `backend/services/teachers/verification-purchase.service.ts` (consumed verbatim through the top services barrel), `frontend/graphql/sharedDocuments/**` (Task 9's surface — the test uses a local `parse`d document to stay decoupled), `test/workflows/**` (read-only), all repos/schema/types/locale files (no surface change), `.agents/**` + root `AGENTS.md` (hand-curated).

## Verification results

### Sub-loop (per edited/created file, `--lifecycle duplicates`) — 3/3 exit 0

| File | Result |
|---|---|
| `backend/graphql/mutation/verification-plan-purchase.mutation.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `backend/graphql/mutation/index.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates ✅ |
| `frontend/graphql/test/teachers/verification-plan-purchase.test.ts` | exit 0 — tsgo ✅ oxlint ✅ biome ✅ lint:type-aware ✅ duplicates (auto-skip: outside jscpd scan scope) ✅ (one mid-task tsgo TS2339 pair — payload assertions on an untyped local document — removed in favor of the stronger committed-state zero-writes probes; re-run green) |

Printed rule files read per run — mutation file: root `AGENTS.md`, `backend/graphql/AGENTS.md`, `backend/AGENTS.md`, `.agents/instructions/backend.instructions.md`; barrel: same set; test file: root `AGENTS.md`, `frontend/graphql/test/AGENTS.md`, `frontend/graphql/AGENTS.md`, `frontend/AGENTS.md`, `.agents/instructions/tests.instructions.md`, `.agents/instructions/frontend.instructions.md` (all read in full before validation).

### tsgo final count

`bun tsgo` (full project) → **0 errors** (exit 0; baseline 0 preserved).

### Regeneration

`bun run generate:gqlSchema` → wrote `frontend/graphql/generated/schema.graphql` (34949 bytes); `bun codegen` → 0 errors, `graphql.ts` unchanged (expected; see above).

### Test run (exact command + counts)

| Command | Result |
|---|---|
| `bun run test:graphql frontend/graphql/test/teachers/verification-plan-purchase.test.ts` (scoped runner: `run-locked-cmd test:graphql → run-server-tests.ts <path>`; boots the dev server on TEST_PORT 3066 via `setupTestServerLifecycle`) | **3 pass / 0 fail (13 expect calls), 1 file passed / 1 total, 10.61s** |

### Generated SDL (exact lines in `frontend/graphql/generated/schema.graphql`, inside `type Mutation`)

```graphql
  """
  Purchase the teacher verification plan; identity from the session, plan resolved server-side.
  """
  purchaseVerificationPlan: PurchaseSubscriptionPayload!
```

Non-null exactly as the builder produces (Pothos default non-null; plan §5.1 matched). `PurchaseSubscriptionPayload`/`PaymentCheckout`/`Subscription`/`StudentPayment` unchanged.

## 7.SEC — Security review conclusion

**Inputless surface (BOPLA/BOLA): the wire carries ZERO client-owned fields** — no argument exists to mass-assign; identity is `ctx.user.id` only (the resolver never reads any other identity source), the plan is resolved server-side by the canonical title constant, and amount/currency ride the DB plan row verbatim. **BFLA:** `authScopes: { authenticated: true }` is the ENTIRE declared scope; the applicant eligibility predicate (pending/failed, cooldown, certified) lives at the service level inside the purchase transaction — the surface grants nothing beyond self-purchase and no role is either excluded or privileged at the wire (a role leg would wrongly hard-lock the surface). **Error channel:** every denial propagates uncaught to the masking boundary (`finalizeGraphqlErrors` plugin, registered exactly once at the route) — no try/catch, no formatting, no logging in the resolver; `extensions.code` passes through verbatim (UNAUTHORIZED / APPLICANT_NOT_FOUND / VALIDATION / APPLICANT_COOLDOWN_ACTIVE / APPLICANT_ALREADY_CERTIFIED / PLAN_NOT_FOUND / DUPLICATE_REQUEST / PAYMENT_NOT_FOUND). **Key hygiene:** the idempotency key is consumed exactly as captured (propagation-only; never re-derived, never trimmed, never logged; never an authorization input — pinned at the context factory). **Narrowing guard:** the `!ctx.user` guard is TypeScript narrowing over the non-optional runtime materialization — defense-in-depth behind the scope check, byte-identical to the DEV1-006 pattern. The 401/403 split is preserved: anonymous → `UNAUTHORIZED` (UnauthorizedError channel), never a bare `FORBIDDEN`.

## 7.SR — Semantic review checklist

- **No local types:** the mutation file imports the pre-existing `PurchaseSubscriptionPayloadPothosObject` and defines nothing; the test file declares no response-shape types (generated types + structural narrowing only).
- **Payload object reused:** `PurchaseSubscriptionPayloadPothosObject` (and transitively `SubscriptionPothosObject`, `StudentPaymentPothosObject`, `PaymentCheckoutPothosObject`) — zero new Pothos types, zero schema type drift.
- **Barrel wiring per `backend/graphql/mutation/AGENTS.md`:** side-effect import only; no named exports from the `.mutation.ts` file; no direct import of the mutation file from outside the directory; the narrating header extended so it never drifts; resolver delegates to the services layer (never repos) with `ctx.locale` propagation; top-level static imports only.
- **No plan-artifact references in code/JSDoc:** verified — docblocks describe the wire contract and scope posture only.
- **No `console.*`, no `oxlint-disable`, no `any`, no dead branches, no module state:** the mutation file is a single registration expression; the test file's module state is the two sanctioned fixture-tracking structures (id sets / plan id) drained in `afterAll`.
- **Test hygiene:** explicit id-list cleanup (never a sweep); committed-state zero-writes probes for both denials; no `runInRollback` (live-server harness posture per the sibling template); bun:test imports only; no `.only`/`.skip`/`.todo`; unique per-run emails + idempotency keys (randomUUID salt).

## 7.IV — Instruction verification

Rule files read (printed by the three sub-loops + pre-task dispatch): root `AGENTS.md`, `backend/AGENTS.md`, `backend/graphql/AGENTS.md`, `backend/graphql/mutation/AGENTS.md`, `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md`, `frontend/graphql/test/AGENTS.md`, `.agents/instructions/backend.instructions.md`, `.agents/instructions/frontend.instructions.md`, `.agents/instructions/tests.instructions.md`. Validation per layer:

- **Mutation file (`backend/AGENTS.md` + `backend/graphql/AGENTS.md` + `backend.instructions.md`):** no local type definitions; resolvers delegate to services; `ctx.locale` propagated into the service call; resolver-local thrown error (`UnauthorizedError`) is the exact DEV1-006 idiom (constant message, DomainError subclass → extensions.code); no dynamic imports; side-effect registration with no named exports; the flat-file placement follows the binding plan §4.5 and the existing flat siblings (`subscription-purchase.mutation.ts` precedent) with the root-barrel side-effect import.
- **Barrel:** side-effect imports only; relative `./` paths; alphabetical tail position preserved; header narration kept truthful (root AGENTS.md barrel mechanics + `mutation/AGENTS.md` wiring rules).
- **Test file (`frontend/graphql/test/AGENTS.md` + `tests.instructions.md` + `frontend.instructions.md`):** shared helpers via `@/test/helpers` (no hand-rolled server bootstrap or client); `setupTestServerLifecycle` at the describe root; `testClient` only (no raw fetch/string queries); error assertions via `result.error` + the shared `expectMutationError` code helper (errorPolicy "all"); dynamic headers per-request via the Apollo context; no backend repos/services imported (drizzle schema tables used for FIXTURE provisioning + committed-state probes only — the documented direct-DB posture of the pattern-source sibling in this exact directory); no `getServerTranslations` direct call; bun:test imports; no `console.*`; no `any`; explicit id-based cleanup with re-probes.
- **Mutation argument coverage rule (N/A):** the mutation is inputless by design — there are no variables to cover; the inputless property is itself pinned by the tests (a document with no arguments is the only valid form; REQ-2.2).

## Carry-forward knowledge for future tasks

- **Task 9 (documents + dialog):** the shared document file `frontend/graphql/sharedDocuments/billing/verification-purchase.documents.ts` must export `purchaseVerificationPlanMutationDocument` (inputless; `id` on `subscription`/`payment`; `checkout { provider providerReference checkoutUrl }`), then `bun codegen` will populate `PurchaseVerificationPlanMutation` types in `graphql.ts` (this task's run left `graphql.ts` UNCHANGED precisely because no document exists yet). The barrel export lands in `billing/index.ts` per the sharedDocuments conventions. The dialog's per-attempt `x-idempotency-key` header rides the SAME context capture this suite exercised (`context.headers["x-idempotency-key"]` at the Apollo request level → `ctx.idempotencyKey`).
- **Test DB environment notes:** (a) `kottaby_db.plans` currently holds ONE pre-existing leftover row (id 89, "Test Plan b957b86b", active) from an earlier suite run — pre-existing residue, NOT created by this task, left untouched (outside edit rights; candidates for a shared-DB residue sweep). (b) One pre-existing `@test.local` user residue (id 184, prefix `test-`) also predates this task. Neither affects this suite (id-based fixtures + service-identical resolution).
- **Scoped graphql runner:** `bun run test:graphql <path>` works (args forward through `run-locked-cmd` → `run-server-tests.ts` testPaths) and is timeout-exempt under the process lock — the cheap way to run one live-server suite without the full `test:graphql` sweep.
- **Plan-resolve ordering caveat for wire tests:** the service resolves the plan BEFORE the applicant gate, so any live-wire probe that expects the gate's `APPLICANT_NOT_FOUND` needs at least one ACTIVE row titled `VERIFICATION_PLAN_TITLE` to exist; this suite provisions one (inert on a seeded catalog — oldest-active-row resolution wins). Task 9's UI tests and any future wire suites should reuse this posture rather than assuming a seeded catalog.
- **The `TEST_SERVER_EXTERNAL` guard in the sibling file** is vestigial relative to the current `test-lifecycle.ts` (which already reuses a warm server when the port answers) — this suite calls `setupTestServerLifecycle()` unconditionally per the helper's own contract; behavior is identical in both harness modes.

## Cross-file dependencies discovered

- **`frontend/graphql/sharedDocuments/billing/verification-purchase.documents.ts` (Task 9, DOES NOT EXIST YET) ↔ this task's generated output:** the schema surface is committed (`schema.graphql`); the frontend operation types materialize the moment Task 9's document lands and `bun codegen` re-runs. No backend change is needed.
- **`backend/graphql/mutation/index.ts` ↔ `backend/graphql/gqlSchema.definitions.ts`:** the definitions barrel imports the mutation barrel — verified wired already; no edit was needed beyond the barrel line itself.
- **None outstanding.** The mutation consumes `VerificationPurchaseService.purchase` exactly as pinned by Task 5 (barrel-exported; no outerTx on the production path); Tasks 1-6 surfaces are consumed read-only.
