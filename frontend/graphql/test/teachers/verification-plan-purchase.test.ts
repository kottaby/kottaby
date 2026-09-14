/**
 * `purchaseVerificationPlan` mutation — wire-boundary integration suite.
 *
 * Runs over the REAL boundary: `setupTestServerLifecycle` boots the Next dev
 * server on the shared TEST_PORT (3066) and every call goes through Apollo
 * Client v4 + the shared error helpers (`expectMutationError`) exactly like
 * `frontend/graphql/test/teachers/applicant-profile.test.ts` (the pattern
 * source for the register/login + Bearer-header harness in this file).
 *
 * Denial matrix (the happy-path purchase is owned by the service suite
 * `backend/services/teachers/verification-purchase.service.test.ts` and the
 * J1 journey — deliberately NOT duplicated here, so this suite has no
 * dependency on a purchasable-catalog happy path):
 *  - anonymous (no Bearer) → UNAUTHORIZED — the `authenticated` authScope
 *    denies before the resolver (401 channel, never FORBIDDEN).
 *  - authenticated STUDENT (non-applicant) with a VALID idempotency key →
 *    APPLICANT_NOT_FOUND — the applicant eligibility gate lives at the
 *    SERVICE level (scope-composition rule: the surface declares only
 *    `{ authenticated: true }`), so the wire proof is the propagated
 *    extensions.code of the in-transaction guard.
 *  - teacher applicant (public registration provisions the pending
 *    `applicants` row) WITHOUT a key → VALIDATION — the pre-DB key guard
 *    rejects the absent header before any database work.
 *
 * Documents:
 *  - A LOCAL `parse`d document carries the selection set. The shared
 *    TypedDocumentNode for this mutation is shipped by the dialog task
 *    (`frontend/graphql/sharedDocuments/billing/`); a local document keeps
 *    this suite decoupled from that landing order. `parse` yields the same
 *    DocumentNode — Apollo's `gql` is deliberately not imported: the
 *    `@/backend/db` fixture chain flips bun's module conditions so
 *    `graphql-tag`'s UMD build crashes (mirrors the sibling suite's note).
 *
 * Idempotency key transport:
 *  - The key rides the per-request `x-idempotency-key` header exactly as
 *    `gqlContextFactory` captures it (propagation-only; raw verbatim value,
 *    `null` when absent). The keyless probe simply omits the header.
 *
 * Data lifecycle (HYGIENE — mirrors the sibling suite):
 *  - Every user this suite creates is tracked by id and deleted in a
 *    describe-scoped `afterAll` via the shared `deleteUsersByIds` helper
 *    (RESTRICT-gated references first, then the users; child rows cascade).
 *  - The ACTIVE verification plan is provisioned as a committed direct-DB
 *    fixture: the purchase flow resolves the plan SERVER-side (by the
 *    canonical title constant) BEFORE the applicant gate, so without a
 *    catalog member the student probe would surface PLAN_NOT_FOUND instead
 *    of the mandated APPLICANT_NOT_FOUND. The fixture mirrors the seeded
 *    product (canonical title constant, 5 sessions, "150.00"/EGP/14,
 *    Reviews lane, active). Resolution picks the oldest active same-title
 *    row, so on a seeded catalog the pre-existing row wins and this fixture
 *    is inert — either way the gate under test is reached. The row is
 *    tracked by id and hard-deleted in the same `afterAll` (explicit id,
 *    never a title sweep), and the committed-state probes assert every
 *    denial wrote zero purchase rows.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { parse } from "graphql";

import { db } from "@/backend/db";
import { plans } from "@/backend/db/schema/billing/plans";
import { subscriptionPurchaseIdempotency } from "@/backend/db/schema/billing/subscription-purchase-idempotency";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { RegisterPublicRole } from "@/frontend/graphql/generated/gql/graphql";
import {
  loginMutationDocument,
  registerUserMutationDocument,
} from "@/frontend/graphql/sharedDocuments/auth/auth.documents";
/** Canonical verification plan identity + contract (shared constants). */
import {
  VERIFICATION_PLAN_SESSION_COUNT,
  VERIFICATION_PLAN_TITLE,
} from "@/shared/constants/verification-plan.constants";
import {
  countUsersByIds,
  deleteUsersByIds,
  describeGraphqlSuite,
  expectMutationError,
  setupTestServerLifecycle,
  testClient,
} from "@/test/helpers";

/** Per-run idempotency-key salt — unique keys, never shared across runs. */
const PREFIX = randomUUID().slice(0, 8);
const KEY_STUDENT = `${PREFIX}-key-student`;

/** Inline mutation document — selection set mirrors the payload contract. */
const purchaseVerificationPlanMutation = parse(`
  mutation PurchaseVerificationPlan {
    purchaseVerificationPlan {
      subscription {
        id
        status
      }
      payment {
        id
        status
      }
      checkout {
        provider
        providerReference
        checkoutUrl
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
// does not flag it (same convention as the sibling suites).
const testCredential = "Password123";

interface RegistrationOutcome {
  readonly userId: number;
  readonly accessToken: string;
}

/** Ids of every user this suite creates (any surface) — drained by the
 * describe-scoped `afterAll` hygiene cleanup so the shared dev database
 * stays at its canonical seed state. Explicit ids (not an email sweep)
 * keep parallel live-wire suites' fixtures safe. */
const createdUserIds = new Set<number>();

function trackCreatedUser(id: number | null | undefined): void {
  if (typeof id === "number") createdUserIds.add(id);
}

/** The tracked catalog-fixture row id (inserted in beforeAll, deleted in afterAll). */
let verificationPlanId = 0;

/**
 * Registers a user through the PUBLIC registerUser mutation, then logs in
 * through the PUBLIC login mutation to obtain a bearer token. A `teacher`
 * registration provisions the pending `applicants` row as a side effect of
 * the real registration service — the suite never hand-inserts one.
 */
async function registerAndLogin(
  role: RegisterPublicRole.Student | RegisterPublicRole.Teacher
): Promise<RegistrationOutcome> {
  const email = uniqueEmail(role === RegisterPublicRole.Teacher ? "applicant" : "student");
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

/** Committed purchase-row counters for one user (the zero-writes oracle). */
async function committedPurchaseRowCounts(userId: number): Promise<{ subs: number; claims: number }> {
  const [subs, claims] = await Promise.all([
    db.$count(subscriptions, eq(subscriptions.userId, userId)),
    db.$count(subscriptionPurchaseIdempotency, eq(subscriptionPurchaseIdempotency.userId, userId)),
  ]);
  return { subs, claims };
}

describeGraphqlSuite("purchaseVerificationPlan GraphQL Integration", () => {
  setupTestServerLifecycle();

  // ─── Fixtures: the ACTIVE verification plan the service resolves ────
  beforeAll(async () => {
    const [planRow] = await db
      .insert(plans)
      .values({
        title: VERIFICATION_PLAN_TITLE,
        sessionCount: VERIFICATION_PLAN_SESSION_COUNT,
        price: "150.00",
        currency: "EGP",
        intervalDays: 14,
        balanceLane: SubscriptionCreditLane.Reviews,
        isActive: true,
      })
      .returning();
    if (!planRow) throw new Error("verification-plan fixture insert returned no rows");
    verificationPlanId = planRow.id;
  });

  // ─── Hygiene: restore the shared dev database to canonical seed state ───
  // Deletes exactly the rows this suite created (users tracked by id plus
  // the tracked plan fixture) — explicit ids, never a sweep.
  afterAll(async () => {
    const ids = [...createdUserIds];
    if (ids.length > 0) {
      const deleted = await deleteUsersByIds(ids);
      expect(deleted).toBe(ids.length);
      expect(await countUsersByIds(ids)).toBe(0);
    }
    if (verificationPlanId > 0) {
      await db.delete(plans).where(eq(plans.id, verificationPlanId));
      expect(await db.$count(plans, eq(plans.id, verificationPlanId))).toBe(0);
    }
  });

  test("Tier 3 — anonymous caller gets UNAUTHORIZED (401 semantics, never FORBIDDEN)", async () => {
    const result = await testClient.mutate({
      mutation: purchaseVerificationPlanMutation,
    });
    expect(result.error).toBeDefined();
    expectMutationError(result.error, "UNAUTHORIZED");
  });

  test("Tier 3 — authenticated STUDENT with a valid idempotency key gets APPLICANT_NOT_FOUND (service-level applicant gate)", async () => {
    const { userId, accessToken } = await registerAndLogin(RegisterPublicRole.Student);
    const result = await testClient.mutate({
      mutation: purchaseVerificationPlanMutation,
      context: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // Valid key: present, non-empty, within the claim column's length —
          // the key guard passes so the denial comes from the applicant gate.
          "x-idempotency-key": KEY_STUDENT,
        },
      },
    });
    expectMutationError(result.error, "APPLICANT_NOT_FOUND");
    // Zero committed writes: the guard runs before the claim/pair inserts
    // (the payload-absence itself is enforced by the error channel — a
    // non-null root field that throws never yields data).
    expect(await committedPurchaseRowCounts(userId)).toEqual({ subs: 0, claims: 0 });
  });

  test("Tier 1 boundary — teacher applicant WITHOUT an idempotency key gets VALIDATION (pre-DB key guard)", async () => {
    const { userId, accessToken } = await registerAndLogin(RegisterPublicRole.Teacher);
    const result = await testClient.mutate({
      mutation: purchaseVerificationPlanMutation,
      context: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // NO x-idempotency-key header — the context captures null and the
          // service's pre-DB key guard rejects before any database work.
        },
      },
    });
    expectMutationError(result.error, "VALIDATION");
    expect(await committedPurchaseRowCounts(userId)).toEqual({ subs: 0, claims: 0 });
  });
});
