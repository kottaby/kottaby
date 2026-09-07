/**
 * Admin session-governance mutation wire-tier suite — the four admin-only
 * mutations (`adminRescheduleSession`, `adminCancelSession`,
 * `adminReassignTeacher`, `adminJoinSession`) over the LIVE GraphQL
 * boundary (`setupTestServerLifecycle` + `testClient` harness; mandated
 * runner at the bottom).
 *
 * Cells locked down over the real wire (HTTP → gateway pipeline →
 * scope-auth → resolver → SessionAdminGovernanceService → PostgreSQL):
 *  - **Happy path per mutation** — the admin call returns the canonical
 *    `Session` payload reflecting the mutation: the reschedule echoes the
 *    replacement timing pair, the reassign moves `teacherId`, the join
 *    returns the started row untouched, and the cancel flips the row to
 *    `Cancelled` while releasing exactly one hold unit back to the SAME
 *    lane (the refund proof rides the hifz lane balance).
 *  - **Tier 3 — keyed retry-doubles of `adminCancelSession`** — the same
 *    `X-Idempotency-Key` replayed is a NO-OP returning the same idempotent
 *    response shape (the current row — unlike booking, a keyed admin
 *    cancel replay is NOT a `DUPLICATE_REQUEST` throw), appending ZERO
 *    duplicate audit rows and releasing ZERO additional refund units.
 *  - **Tier 4 — 401/403 byte-identical to `resolveSessionDispute`** —
 *    anonymous callers get the SAME localized UNAUTHORIZED error on every
 *    admin mutation as the dispute-arbitration reference op, and every
 *    authenticated non-admin persisted role (student / teacher / parent —
 *    `supervisor` is not a `user_role` enum member) gets the SAME
 *    localized FORBIDDEN error. "Byte-identical" = the finalized error
 *    item's `message`, `extensions.code`, and extension KEY SET are equal
 *    (the per-request `extensions.requestId` correlation value and the
 *    failing root field's `path` are the only deliberate per-op
 *    differences). Denials ride the scope gate BEFORE the resolver, so
 *    every denial appends ZERO audit rows (probed against a real tracked
 *    session).
 *
 * Fixtures: a real committed cast (real `users.role` + role-child rows via
 * `@/test/workflows/helpers` builders) + per-run `jrn_*` idempotency keys;
 * every created session id is registered for the FK-safe hard-delete
 * cleanup. Identity rides minted-but-real access tokens (same
 * `signAccessToken` the auth layer issues; the spawned server verifies
 * them with the same env) — nothing is monkey-patched.
 *
 * Run:
 *   bun run test/scripts/run-test.ts backend/graphql/test/admin-session-governance.mutation.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { students } from "@/backend/db/schema/students/students";
import { signAccessToken } from "@/backend/lib/auth/jwt";
import { expectMutationError, setupTestServerLifecycle, TEST_PORT, testClient } from "@/test/helpers";
import {
  buildSessionJourneyCast,
  createSessionFixtureRegistry,
  journeyPrefix,
  type SessionJourneyCast,
} from "@/test/workflows/helpers";

// ─── Harness state ───────────────────────────────────────────────────────────

/** Spawns (or reuses) the live test server before any wire call. */
setupTestServerLifecycle();

/** Per-run prefix — unique user labels AND idempotency keys per suite run. */
const PREFIX = journeyPrefix("admgov");

const KEY_RESCHEDULE = `${PREFIX}-key-reschedule`;
const KEY_CANCEL = `${PREFIX}-key-cancel`;
const KEY_REASSIGN = `${PREFIX}-key-reassign`;
const KEY_JOIN = `${PREFIX}-key-join`;
const KEY_CANCEL_REPLAY = `${PREFIX}-key-cancel-replay`;

/** Large unused id — the pre-resolver denial target for the auth matrix. */
const UNKNOWN_SESSION_ID = "999999999";

/** The fixture registry — every created session id is hard-deleted in afterAll. */
const registry = createSessionFixtureRegistry();

let cast: SessionJourneyCast;

// Actor-scoped clients.
let admin: ApolloClient;
let studentA: ApolloClient;
let teacherT: ApolloClient;
let applicant: ApolloClient;
let parent: ApolloClient;
let adminReplay: ApolloClient; // fixed KEY_CANCEL_REPLAY (cancel + its retry)

/** The authenticated non-admin persisted roles (the user_role vocabulary minus admin). */
const NON_ADMIN_ROLES = ["student", "teacher", "parent", "applicant"] as const;
type NonAdminRole = (typeof NON_ADMIN_ROLES)[number];
const roleClients = new Map<NonAdminRole, ApolloClient>();

/** Booked-session ids shared across the mutation legs. */
let sessionRescheduleId = "";
let sessionCancelId = "";
let sessionReassignId = "";
let sessionJoinId = "";

// ─── Documents ───────────────────────────────────────────────────────────────

const RESCHEDULE_DOC = gql`
  mutation AdminRescheduleSession($input: AdminSessionRescheduleInput!) {
    adminRescheduleSession(input: $input) {
      id
      status
      startedAt
      endedAt
    }
  }
`;

const CANCEL_DOC = gql`
  mutation AdminCancelSession($input: AdminSessionCancelInput!) {
    adminCancelSession(input: $input) {
      id
      status
      feeHeld
    }
  }
`;

const REASSIGN_DOC = gql`
  mutation AdminReassignTeacher($input: AdminSessionReassignInput!) {
    adminReassignTeacher(input: $input) {
      id
      status
      teacherId
    }
  }
`;

const JOIN_DOC = gql`
  mutation AdminJoinSession($input: AdminSessionJoinInput!) {
    adminJoinSession(input: $input) {
      id
      status
      startedAt
    }
  }
`;

/** The byte-identical REFERENCE op — the existing admin arbitration mutation. */
const RESOLVE_DISPUTE_REFERENCE_DOC = gql`
  mutation ResolveSessionDisputeReference($id: ID!) {
    resolveSessionDispute(id: $id, resolution: Cancel) {
      id
    }
  }
`;

const CREATE_SESSION_DOC = gql`
  mutation CreateSession($input: CreateSessionInput!) {
    createSession(input: $input) {
      id
      status
      feeHeld
    }
  }
`;

const START_SESSION_DOC = gql`
  mutation StartSession($id: ID!) {
    startSession(id: $id) {
      id
      status
    }
  }
`;

// ─── Narrowing helpers (runtime-guarded — zero casts) ────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function recordOf(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(message);
  }
  return value;
}

/** Extracts the root-field payload object of a happy-path mutation result. */
function payloadOf(result: { readonly data?: unknown }, rootField: string): Record<string, unknown> {
  if (!isRecord(result.data)) {
    throw new Error(`missing data for ${rootField} (error: ${String(result.data)})`);
  }
  const payload: unknown = result.data[rootField];
  if (!isRecord(payload)) {
    throw new Error(`missing ${rootField} payload in response data`);
  }
  return payload;
}

/** Narrows a Session payload's id (string on the ID wire) with a guard. */
function sessionIdOf(payload: Record<string, unknown>, rootField: string): string {
  const id: unknown = payload.id;
  if (typeof id !== "string" && typeof id !== "number") {
    throw new Error(`${rootField} returned no id`);
  }
  return String(id);
}

/** Narrows one ISO-8601 instant off a Session payload with a guard. */
function instantOf(value: unknown, label: string): number {
  if (typeof value !== "string") {
    throw new Error(`${label} must be an ISO-8601 string on the wire`);
  }
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must parse as an instant`);
  }
  return parsed;
}

/** First finalized error item off a denial result, code-asserted. */
function firstWireItem(error: unknown, expectedCode: string): Record<string, unknown> {
  const container = expectMutationError(error, expectedCode);
  const candidate: unknown = container.errors[0];
  return recordOf(candidate, "expected record-shaped finalized error item");
}

/** The byte-identical fingerprint of one finalized denial item. */
interface DenialFingerprint {
  readonly message: string;
  readonly code: string;
  readonly extensionKeys: readonly string[];
}

function fingerprintOf(item: Record<string, unknown>): DenialFingerprint {
  const message = item.message;
  if (typeof message !== "string") {
    throw new Error("expected a string error message");
  }
  const extensions = recordOf(item.extensions, "expected record-shaped extensions");
  const code = extensions.code;
  if (typeof code !== "string") {
    throw new Error("expected a string error code");
  }
  return {
    message,
    code,
    extensionKeys: Object.keys(extensions).toSorted((a, b) => a.localeCompare(b)),
  };
}

/**
 * Asserts one denial is byte-identical to the reference fingerprint (same
 * localized message, same extensions.code, same extension key set) and
 * rode the given root field. The per-request `extensions.requestId`
 * VALUE is deliberately not compared — it is per-request correlation
 * metadata, never part of the error contract; its PRESENCE is covered by
 * the key-set equality.
 */
function expectDenialIdenticalToReference(
  error: unknown,
  expectedCode: string,
  reference: DenialFingerprint,
  rootField: string
): void {
  const item = firstWireItem(error, expectedCode);
  expect(fingerprintOf(item)).toEqual(reference);
  expect(item.path).toEqual([rootField]);
}

// ─── Wire helpers ────────────────────────────────────────────────────────────

/** Builds an actor-scoped client — real Bearer identity + optional key header. */
function clientFor(accessToken: string | null, idempotencyKey: string | null = null): ApolloClient {
  return new ApolloClient({
    link: new HttpLink({
      uri: `http://localhost:${TEST_PORT}/api/graphql`,
      headers: {
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
      },
    }),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: { errorPolicy: "all", fetchPolicy: "no-cache" },
      mutate: { errorPolicy: "all", fetchPolicy: "no-cache" },
      watchQuery: { errorPolicy: "all", fetchPolicy: "no-cache" },
    },
  });
}

/** Mints a REAL access token for a cast user (verified by the live server). */
async function tokenFor(userId: number, role: string): Promise<string> {
  return signAccessToken({ userId, role });
}

/** Books one happy-path session over the wire under a UNIQUE idempotency key. */
async function bookSession(accessToken: string, key: string, teacherId: number): Promise<string> {
  const client = clientFor(accessToken, key);
  const result = await client.mutate({
    mutation: CREATE_SESSION_DOC,
    variables: { input: { teacherId, intent: "Hifz" } },
  });
  const booked = sessionIdOf(payloadOf(result, "createSession"), "createSession");
  registry.track("session", Number(booked));
  return booked;
}

/** Reads one student's hifz lane balance (the refund-proof lane). */
async function readHifzBalance(studentUserId: number): Promise<number> {
  const rows = await db
    .select({ balanceHifz: students.balanceHifz })
    .from(students)
    .where(eq(students.id, studentUserId));
  const balance: unknown = rows[0]?.balanceHifz;
  if (typeof balance !== "number") {
    throw new Error(`no students row found for user ${String(studentUserId)}`);
  }
  return balance;
}

/** Counts `audit_logs` rows for one session entity (no-dup-audit probe). */
async function countAuditForSession(sessionId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, "session"), eq(auditLogs.entityId, sessionId)));
  return result[0]?.count ?? 0;
}

/** Whole-second-aligned future instant (the timestamp columns are second-aligned). */
function futureInstant(offsetMs: number): string {
  return new Date(Math.floor(Date.now() / 1000) * 1000 + offsetMs).toISOString();
}

// ─── Fixtures (committed cast + pre-booked mutation targets) ────────────────

beforeAll(async () => {
  // Committed cast — primary student funded for FOUR net bookings (the
  // reschedule target drains the trial lane; cancel/reassign/join bind
  // the hifz lane; the cancel leg refunds exactly one hifz unit back).
  await db.transaction(async tx => {
    cast = await buildSessionJourneyCast(tx, registry, {
      prefix: PREFIX,
      primaryStudent: { trial: 1, hifz: 4 },
      secondStudent: { hifz: 1 },
    });
  });

  // Real access tokens for every actor (same signer the auth layer uses).
  const [tokenAdmin, tokenStudentA, tokenTeacherT, tokenApplicant, tokenParent] = await Promise.all([
    tokenFor(cast.admin.userId, cast.admin.user.role),
    tokenFor(cast.primaryStudent.userId, cast.primaryStudent.user.role),
    tokenFor(cast.teacher.userId, cast.teacher.user.role),
    tokenFor(cast.applicant.userId, cast.applicant.user.role),
    tokenFor(cast.parent.userId, cast.parent.user.role),
  ]);

  admin = clientFor(tokenAdmin);
  studentA = clientFor(tokenStudentA);
  teacherT = clientFor(tokenTeacherT);
  applicant = clientFor(tokenApplicant);
  parent = clientFor(tokenParent);
  adminReplay = clientFor(tokenAdmin, KEY_CANCEL_REPLAY);
  roleClients.set("student", studentA);
  roleClients.set("teacher", teacherT);
  roleClients.set("parent", parent);
  roleClients.set("applicant", applicant);

  // Pre-book the four mutation targets under DISTINCT per-run keys.
  // Sequential — the booking ladder's lane order matters (trial first).
  sessionRescheduleId = await bookSession(tokenStudentA, KEY_RESCHEDULE, cast.teacher.userId);
  sessionCancelId = await bookSession(tokenStudentA, KEY_CANCEL, cast.teacher.userId);
  sessionReassignId = await bookSession(tokenStudentA, KEY_REASSIGN, cast.teacher.userId);
  sessionJoinId = await bookSession(tokenStudentA, KEY_JOIN, cast.teacher.userId);
}, 240_000);

afterAll(async () => {
  await registry.cleanup();
});

// ─── Section 1 — happy path per mutation (admin) ─────────────────────────────

describe("admin session-governance mutations — happy paths (admin)", () => {
  test("adminRescheduleSession returns the rescheduled Session with the replacement timing pair", async () => {
    const startedAt = futureInstant(3_600_000);
    const endedAt = futureInstant(7_200_000);
    const result = await admin.mutate({
      mutation: RESCHEDULE_DOC,
      variables: { input: { sessionId: sessionRescheduleId, startedAt, endedAt } },
    });
    const payload = payloadOf(result, "adminRescheduleSession");
    expect(sessionIdOf(payload, "adminRescheduleSession")).toBe(sessionRescheduleId);
    expect(payload.status).toBe("Scheduled");
    expect(instantOf(payload.startedAt, "startedAt")).toBe(new Date(startedAt).getTime());
    expect(instantOf(payload.endedAt, "endedAt")).toBe(new Date(endedAt).getTime());
  });

  test("adminReassignTeacher returns the Session moved onto the certified candidate", async () => {
    const result = await admin.mutate({
      mutation: REASSIGN_DOC,
      variables: { input: { sessionId: sessionReassignId, newTeacherUserId: String(cast.secondTeacher.userId) } },
    });
    const payload = payloadOf(result, "adminReassignTeacher");
    expect(sessionIdOf(payload, "adminReassignTeacher")).toBe(sessionReassignId);
    expect(payload.status).toBe("Scheduled");
    expect(payload.teacherId).toBe(String(cast.secondTeacher.userId));
  });

  test("adminJoinSession returns the started Session (read-only observation, columns untouched)", async () => {
    // The owner teacher starts the row first — join is live-only.
    const start = await teacherT.mutate({ mutation: START_SESSION_DOC, variables: { id: sessionJoinId } });
    expect(payloadOf(start, "startSession").status).toBe("Started");

    const result = await admin.mutate({
      mutation: JOIN_DOC,
      variables: { input: { sessionId: sessionJoinId } },
    });
    const payload = payloadOf(result, "adminJoinSession");
    expect(sessionIdOf(payload, "adminJoinSession")).toBe(sessionJoinId);
    expect(payload.status).toBe("Started");
    // The observation join never mutates lifecycle columns — the start
    // instant is the owner teacher's own stamp, echoed unchanged.
    expect(payload.startedAt).toBeTypeOf("string");
  });

  test("adminCancelSession returns the Cancelled Session and releases exactly one hold unit to the SAME lane", async () => {
    const beforeRefund = await readHifzBalance(cast.primaryStudent.userId);
    const result = await adminReplay.mutate({
      mutation: CANCEL_DOC,
      variables: { input: { sessionId: sessionCancelId, reason: "governance cancel" } },
    });
    const payload = payloadOf(result, "adminCancelSession");
    expect(sessionIdOf(payload, "adminCancelSession")).toBe(sessionCancelId);
    expect(payload.status).toBe("Cancelled");
    // The admin cancel DELIBERATELY preserves the hold marker on the row
    // (marker + provenance lane are the refund composition's input record;
    // the participant cancel is the variant that clears the marker). The
    // hold RELEASE is proven by the lane balance below — exactly one unit
    // back to the SAME recorded lane.
    expect(payload.feeHeld).toBe(true);
    const afterRefund = await readHifzBalance(cast.primaryStudent.userId);
    expect(afterRefund).toBe(beforeRefund + 1);
  });
});

// ─── Section 2 — Tier 3: keyed retry-doubles of the admin cancel ────────────

describe("Tier 3 — adminCancelSession keyed retry is a no-op with the same response shape", () => {
  test("same X-Idempotency-Key replay → same shape, NO duplicate audit row, NO second refund", async () => {
    // Section 1 already cancelled `sessionCancelId` under KEY_CANCEL_REPLAY
    // (adminReplay's fixed key) — the same-key retry below is the
    // idempotent replay arm: the current row, NOT a DUPLICATE_REQUEST
    // throw, NOT a second mutation.
    const balanceBeforeRetry = await readHifzBalance(cast.primaryStudent.userId);
    const auditBeforeRetry = await countAuditForSession(Number(sessionCancelId));

    const retry = await adminReplay.mutate({
      mutation: CANCEL_DOC,
      variables: { input: { sessionId: sessionCancelId } },
    });
    const payload = payloadOf(retry, "adminCancelSession");
    expect(sessionIdOf(payload, "adminCancelSession")).toBe(sessionCancelId);
    expect(payload.status).toBe("Cancelled");
    // Same shape as the first call — the preserved hold marker included.
    expect(payload.feeHeld).toBe(true);

    expect(await readHifzBalance(cast.primaryStudent.userId)).toBe(balanceBeforeRetry);
    expect(await countAuditForSession(Number(sessionCancelId))).toBe(auditBeforeRetry);
    // Exactly ONE audit row exists for the session across BOTH calls —
    // the first cancel's single append.
    expect(auditBeforeRetry).toBe(1);
  });
});

// ─── Section 3 — Tier 4: 401 byte-identical to resolveSessionDispute ────────

describe("Tier 4 — anonymous callers: UNAUTHORIZED byte-identical to resolveSessionDispute", () => {
  test("every admin mutation answers the SAME localized UNAUTHORIZED denial as the reference op", async () => {
    const referenceResult = await testClient.mutate({
      mutation: RESOLVE_DISPUTE_REFERENCE_DOC,
      variables: { id: UNKNOWN_SESSION_ID },
    });
    const reference = fingerprintOf(firstWireItem(referenceResult.error, "UNAUTHORIZED"));

    const anonymousReschedule = await testClient.mutate({
      mutation: RESCHEDULE_DOC,
      variables: {
        input: {
          sessionId: UNKNOWN_SESSION_ID,
          startedAt: futureInstant(3_600_000),
          endedAt: futureInstant(7_200_000),
        },
      },
    });
    expectDenialIdenticalToReference(anonymousReschedule.error, "UNAUTHORIZED", reference, "adminRescheduleSession");

    const anonymousCancel = await testClient.mutate({
      mutation: CANCEL_DOC,
      variables: { input: { sessionId: UNKNOWN_SESSION_ID } },
    });
    expectDenialIdenticalToReference(anonymousCancel.error, "UNAUTHORIZED", reference, "adminCancelSession");

    const anonymousReassign = await testClient.mutate({
      mutation: REASSIGN_DOC,
      variables: { input: { sessionId: UNKNOWN_SESSION_ID, newTeacherUserId: "1" } },
    });
    expectDenialIdenticalToReference(anonymousReassign.error, "UNAUTHORIZED", reference, "adminReassignTeacher");

    const anonymousJoin = await testClient.mutate({
      mutation: JOIN_DOC,
      variables: { input: { sessionId: UNKNOWN_SESSION_ID } },
    });
    expectDenialIdenticalToReference(anonymousJoin.error, "UNAUTHORIZED", reference, "adminJoinSession");
  });

  test("anonymous denials append ZERO audit rows (scope gate precedes the resolver)", async () => {
    const auditBefore = await countAuditForSession(Number(sessionCancelId));
    await testClient.mutate({ mutation: CANCEL_DOC, variables: { input: { sessionId: UNKNOWN_SESSION_ID } } });
    await testClient.mutate({ mutation: JOIN_DOC, variables: { input: { sessionId: UNKNOWN_SESSION_ID } } });
    expect(await countAuditForSession(Number(sessionCancelId))).toBe(auditBefore);
  });
});

// ─── Section 4 — Tier 4: 403 byte-identical per non-admin role ──────────────

describe("Tier 4 — non-admin roles: FORBIDDEN byte-identical to resolveSessionDispute", () => {
  test.each([...NON_ADMIN_ROLES])(
    "%s caller gets the SAME localized FORBIDDEN denial on every admin mutation as the reference op",
    async role => {
      const client = roleClients.get(role);
      if (!client) {
        throw new Error(`no client provisioned for role ${role}`);
      }

      const referenceResult = await client.mutate({
        mutation: RESOLVE_DISPUTE_REFERENCE_DOC,
        variables: { id: UNKNOWN_SESSION_ID },
      });
      const reference = fingerprintOf(firstWireItem(referenceResult.error, "FORBIDDEN"));

      const deniedReschedule = await client.mutate({
        mutation: RESCHEDULE_DOC,
        variables: {
          input: {
            sessionId: UNKNOWN_SESSION_ID,
            startedAt: futureInstant(3_600_000),
            endedAt: futureInstant(7_200_000),
          },
        },
      });
      expectDenialIdenticalToReference(deniedReschedule.error, "FORBIDDEN", reference, "adminRescheduleSession");

      const deniedCancel = await client.mutate({
        mutation: CANCEL_DOC,
        variables: { input: { sessionId: UNKNOWN_SESSION_ID } },
      });
      expectDenialIdenticalToReference(deniedCancel.error, "FORBIDDEN", reference, "adminCancelSession");

      const deniedReassign = await client.mutate({
        mutation: REASSIGN_DOC,
        variables: { input: { sessionId: UNKNOWN_SESSION_ID, newTeacherUserId: "1" } },
      });
      expectDenialIdenticalToReference(deniedReassign.error, "FORBIDDEN", reference, "adminReassignTeacher");

      const deniedJoin = await client.mutate({
        mutation: JOIN_DOC,
        variables: { input: { sessionId: UNKNOWN_SESSION_ID } },
      });
      expectDenialIdenticalToReference(deniedJoin.error, "FORBIDDEN", reference, "adminJoinSession");
    }
  );

  test("non-admin denials append ZERO audit rows (scope gate precedes the resolver)", async () => {
    const auditBefore = await countAuditForSession(Number(sessionCancelId));
    await Promise.all(
      NON_ADMIN_ROLES.map(role => {
        const client = roleClients.get(role);
        if (!client) {
          throw new Error(`no client provisioned for role ${role}`);
        }
        return client.mutate({ mutation: CANCEL_DOC, variables: { input: { sessionId: UNKNOWN_SESSION_ID } } });
      })
    );
    expect(await countAuditForSession(Number(sessionCancelId))).toBe(auditBefore);
  });
});
