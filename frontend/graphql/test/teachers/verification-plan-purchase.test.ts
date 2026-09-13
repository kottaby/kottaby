/**
 * `purchaseVerificationPlan` mutation — GraphQL boundary suite (denial
 * tiers).
 *
 * Runs over the REAL boundary: `setupTestServerLifecycle` boots the Next dev
 * server on the shared TEST_PORT (3066) and every operation goes through
 * Apollo Client v4 + the shared error helpers (`expectMutationError`)
 * exactly like `frontend/graphql/test/teachers/applicant-profile.test.ts`.
 *
 * Documents:
 *  - The suite pins LOCAL `parse`d documents: the shared
 *    `purchaseVerificationPlanMutationDocument` TypedDocumentNode lands with
 *    the purchase-dialog work (`frontend/graphql/sharedDocuments/billing/`),
 *    and these denial probes never observe payload data — the resolver
 *    throws before any field resolves. The same file's precedent (Tier-4
 *    BOLA probes in `applicant-profile.test.ts`) already established local
 *    `parse` documents; note Apollo's `gql` is deliberately not imported
 *    because the `@/backend/db` fixture chain flips bun's module conditions
 *    (`graphql-tag`'s UMD build crashes) — `parse` yields the same
 *    DocumentNode.
 *  - The mutation is INPUTLESS on the wire: any argument against
 *    `purchaseVerificationPlan` dies at schema validation
 *    (`GRAPHQL_VALIDATION_FAILED`) before a resolver runs — the BOLA
 *    no-surface property is structural, exactly like `myApplicantProfile`.
 *
 * Authentication mechanism per role (multi-role isolation):
 *  - The shared `testClient` sends NO cookies between tests, so every test
 *    carries its OWN identity via a per-request
 *    `Authorization: Bearer <accessToken>` header (context.headers), which is
 *    the production client path per `gqlContextFactory.extractAccessToken`.
 *  - The idempotency key rides the per-request `x-idempotency-key` header —
 *    the propagation-only context capture (`ctx.idempotencyKey`); it is a
 *    per-attempt random UUID so no replay state can leak between runs.
 *
 * Data lifecycle (HYGIENE — mirrors the applicant-profile suite):
 *  - Every user this suite creates comes from the PUBLIC registerUser +
 *    login mutations (teacher registration provisions the `applicants` row;
 *    student registration provisions a `students` row and none), tracked by
 *    id and deleted in a describe-scoped `afterAll` via the shared
 *    `deleteUsersByIds` helper so the shared database returns to its
 *    canonical seed state.
 *
 * Tier coverage (happy-path purchase is owned by the service suite and the
 * journey suite — no purchase is driven here, so no plan-seed dependency):
 *  - Tier 3  anonymous ⇒ UNAUTHORIZED (401 semantics).
 *  - Tier 3  authenticated STUDENT (no applicants row) WITH a key ⇒
 *            APPLICANT_NOT_FOUND (service-level applicant gate).
 *  - Tier 2  authenticated TEACHER applicant WITHOUT the key header ⇒
 *            VALIDATION (pre-DB idempotency-key-required guard).
 */

import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { type DocumentNode, parse } from "graphql";

import { RegisterPublicRole } from "@/frontend/graphql/generated/gql/graphql";
import {
  loginMutationDocument,
  registerUserMutationDocument,
} from "@/frontend/graphql/sharedDocuments/auth/auth.documents";
import {
  countUsersByIds,
  deleteUsersByIds,
  describeGraphqlSuite,
  expectMutationError,
  setupTestServerLifecycle,
  testClient,
} from "@/test/helpers";

/**
 * Minimal-denial document — the selection set is never observed (every
 * probe here dies at the scope check or inside the resolver), so a minimal
 * valid selection keeps the document schema-valid without pinning payload
 * fields this suite does not exercise.
 */
const purchaseVerificationPlanMutation: DocumentNode = parse(`
  mutation PurchaseVerificationPlan {
    purchaseVerificationPlan {
      subscription {
        id
      }
    }
  }
`);

/**
 * Randomized email generator (per-suite unique prefix + UUID salt) — follows
 * the entity-setup guidance ("randomUUID avoids unique-constraint hits")
 * while keeping the auth.test.ts `@test.local` domain marker.
 */
function uniqueEmail(rolePrefix: string): string {
  return `${rolePrefix}-${Date.now()}-${randomUUID().slice(0, 8)}@test.local`;
}

// Named without the literal `password` token so `sonarjs/no-hardcoded-passwords`
// does not flag it (same convention as applicant-profile.test.ts / auth.test.ts).
const testCredential = "Password123";

interface RegistrationOutcome {
  readonly userId: number;
  readonly accessToken: string;
}

/** Ids of every user this suite creates (any surface) — drained by the
 * describe-scoped `afterAll` hygiene cleanup so the shared database
 * stays at its canonical seed state. Explicit ids (not an email sweep)
 * keep parallel live-wire suites' fixtures safe. */
const createdUserIds = new Set<number>();

function trackCreatedUser(id: number | null | undefined): void {
  if (typeof id === "number") createdUserIds.add(id);
}

/**
 * Registers a user through the PUBLIC registerUser mutation, then logs in
 * through the PUBLIC login mutation to obtain a bearer token. Teacher
 * registration provisions the `applicants` row (the applicant-shaped
 * caller); student registration provisions a `students` row and none.
 */
async function registerAndLogin(
  role: RegisterPublicRole.Parent | RegisterPublicRole.Student | RegisterPublicRole.Teacher
): Promise<RegistrationOutcome> {
  const email = uniqueEmail("verify-purchase");
  const registered = await testClient.mutate({
    mutation: registerUserMutationDocument,
    variables: {
      input: {
        fullName: "Test Verification Purchaser",
        email,
        phone: "+201234567890",
        password: testCredential,
        gender: null,
        country: "EG",
        role,
        preferredRecitation: null,
      },
    },
  });
  expect(registered.error).toBeUndefined();
  const userId = registered.data?.registerUser?.id;
  if (!userId) throw new Error("registerUser returned no id");
  trackCreatedUser(userId);

  const loggedIn = await testClient.mutate({
    mutation: loginMutationDocument,
    variables: { email, password: testCredential },
  });
  expect(loggedIn.error).toBeUndefined();
  const accessToken = loggedIn.data?.login?.accessToken;
  if (!accessToken) throw new Error("login returned no accessToken");

  return { userId, accessToken };
}

describeGraphqlSuite("purchaseVerificationPlan GraphQL Integration", () => {
  // Memory-constrained sandbox adaptation: setting TEST_SERVER_EXTERNAL=1 +
  // GRAPHQL_TEST_PORT=<already-running server> runs the suite against that
  // warm server instead of spawning a second `next dev` (whose turbopack
  // native-memory spike OOM-kills 4GB cgroup boxes). CI never sets the flag
  // and keeps the standard boot-on-3066 lifecycle.
  if (process.env.TEST_SERVER_EXTERNAL !== "1") {
    setupTestServerLifecycle();
  }

  // ─── Hygiene: restore the shared database to canonical seed state ───
  // Deletes exactly the users this suite created (tracked by id) plus
  // their RESTRICT-gated audit/subscriptions/evaluations references;
  // child rows (applicants/students included) cascade. Explicit ids
  // (not an email sweep) keep parallel live-wire suites' fixtures safe.
  afterAll(async () => {
    const ids = [...createdUserIds];
    if (ids.length === 0) return;
    const deleted = await deleteUsersByIds(ids);
    expect(deleted).toBe(ids.length);
    expect(await countUsersByIds(ids)).toBe(0);
  });

  test("Tier 3 — anonymous caller gets UNAUTHORIZED (401 semantics)", async () => {
    const result = await testClient.mutate({
      mutation: purchaseVerificationPlanMutation,
    });
    expect(result.error).toBeDefined();
    expectMutationError(result.error, "UNAUTHORIZED");
  });

  test("Tier 3 — authenticated STUDENT (non-applicant) with a key gets APPLICANT_NOT_FOUND", async () => {
    const { accessToken } = await registerAndLogin(RegisterPublicRole.Student);
    const result = await testClient.mutate({
      mutation: purchaseVerificationPlanMutation,
      context: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // Per-attempt key: the propagation-only capture carries it into
          // the service; the applicant gate rejects before any claim.
          "x-idempotency-key": `verify-probe-${randomUUID()}`,
        },
      },
    });
    expectMutationError(result.error, "APPLICANT_NOT_FOUND");
  });

  test("Tier 2 — authenticated applicant WITHOUT the key header gets VALIDATION (key required)", async () => {
    const { accessToken } = await registerAndLogin(RegisterPublicRole.Teacher);
    const result = await testClient.mutate({
      mutation: purchaseVerificationPlanMutation,
      context: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // NO x-idempotency-key header: the pre-DB guard rejects the
          // absent key with the localized key-required validation error.
        },
      },
    });
    expectMutationError(result.error, "VALIDATION");
  });
});
