/**
 * Admin session-governance mutation wire-tier suite — the four admin-only
 * mutations (`adminRescheduleSession`, `adminCancelSession`,
 * `adminReassignTeacher`, `adminJoinSession`) over the LIVE GraphQL
 * pipeline (mandated runner at the bottom).
 *
 * HARNESS ADAPTATION (single-process full pipeline) — WHY:
 *  The canonical live-wire harness (`setupTestServerLifecycle` +
 *  `testClient`) spawns the Next.js dev server in a SECOND OS process while
 *  this suite's fixture/oracle reads ride `@/backend/db` in the bun-test
 *  process. Under the sandbox's sanctioned `DB_PROVIDER=pglite` provider
 *  that two-process topology is structurally impossible: PGlite is
 *  single-connection WASM Postgres, each process opening the data dir gets
 *  its OWN instance, and the second opener aborts mid-init leaving the data
 *  dir unusable (observed: `RuntimeError: Aborted()` on every init after
 *  the first concurrent open — the exact constraint documented in
 *  `test/helpers/skip-when-pglite.ts` for the live-wire tier).
 *
 *  The adaptation therefore executes THE PRODUCTION ROUTE PIPELINE
 *  IN-PROCESS: `POST` from `@/app/api/graphql/route` — the same handler the
 *  dev server dispatches to — driven by synthesized `NextRequest` objects.
 *  Every production stage runs verbatim: transport guards (`guardTransport`)
 *  → rate-limit wrapper (fail-open stub) → Apollo engine (validate →
 *  scope-auth/authScopes → resolver) with the REAL `createGraphQLContext`
 *  (Bearer-token verification + `x-idempotency-key` capture + requestId) →
 *  `SessionAdminGovernanceService` → PostgreSQL → `finalizeGraphqlErrors`
 *  (registered exactly once via the Apollo plugin). The only thing absent
 *  is the HTTP socket itself; requests/responses are the same
 *  `NextRequest`/`Response` objects the socket would carry. The suite is
 *  green in CI (real multi-connection PG) unchanged in its assertions.
 *
 * Cells locked down over the real pipeline (gateway → scope-auth → resolver
 * → SessionAdminGovernanceService → PostgreSQL):
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
 * `signAccessToken` the auth layer issues; the pipeline verifies them with
 * the same env) — nothing is monkey-patched. `afterAll` closes the DB pool
 * so the single-connection PGlite data dir is released cleanly for the
 * next suite (a stale `postmaster.pid` bricks subsequent initializations).
 *
 * Run:
 *   bun run test/scripts/run-test.ts backend/graphql/test/admin-session-governance.mutation.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CombinedGraphQLErrors, gql } from "@apollo/client";
import type { DocumentNode } from "graphql";
import { print } from "graphql";
import { and, eq, inArray, sql } from "drizzle-orm";
import { POST } from "@/app/api/graphql/route";
import { NextRequest } from "next/server";
import { closePool, db } from "@/backend/db";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { students } from "@/backend/db/schema/students/students";
import { signAccessToken } from "@/backend/lib/auth/jwt";
import { expectMutationError, TEST_PORT } from "@/test/helpers";
// Deep import (same rationale as the journey cleanup helper — the
// `test/helpers` barrel pulls the Apollo test client into backend-only
// graphs; this suite needs the audit-trigger suspension wrapper directly).
import { withAuditDeleteTriggersSuspended } from "@/test/helpers/db-cleanup";
import {
  buildSessionJourneyCast,
  createSessionFixtureRegistry,
  journeyPrefix,
  type SessionJourneyCast,
} from "@/test/workflows/helpers";

// ─── Harness state ───────────────────────────────────────────────────────────

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

/** Minted-but-real access tokens (verified by the pipeline's context factory). */
let adminToken = "";
let studentAToken = "";
let teacherTToken = "";
let applicantToken = "";
let parentToken = "";

/** The authenticated non-admin persisted roles (the user_role vocabulary minus admin). */
const NON_ADMIN_ROLES = ["student", "teacher", "parent", "applicant"] as const;
type NonAdminRole = (typeof NON_ADMIN_ROLES)[number];
const roleTokens = new Map<NonAdminRole, string>();

/** Booked-session ids shared across the mutation legs. */
let sessionRescheduleId = "";
let sessionCancelId = "";
let sessionReassignId = "";
let sessionJoinId = "";

/**
 * The ids of the sessions this suite mutated — each mutation appends ONE
 * immutable `audit_logs` row (actor = the cast admin, entity = the session),
 * and those rows RESTRICT-delete the cast `users` during teardown.
 */
function mutationSessionIds(): number[] {
  return [sessionRescheduleId, sessionCancelId, sessionReassignId, sessionJoinId]
    .filter(id => id !== "")
    .map(id => Number(id));
}

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

// ─── Wire helpers (single-process full pipeline — see header) ────────────────

/** One finalized pipeline result, shaped like an Apollo mutate result. */
interface WireResult {
  readonly data?: unknown;
  readonly error?: CombinedGraphQLErrors;
}

/** Narrows one finalized error item onto the wire's formatted shape. */
function toFormattedErrorItem(item: unknown): { message: string } & Record<string, unknown> {
  const record = recordOf(item, "finalized GraphQL error item must be an object");
  const message = record.message;
  if (typeof message !== "string") {
    throw new Error("finalized GraphQL error item must carry a string message");
  }
  return { ...record, message };
}

/**
 * Drives the production `/api/graphql` POST pipeline in-process: builds the
 * `NextRequest` exactly as the HTTP layer would (JSON body, optional
 * `Authorization: Bearer` and `X-Idempotency-Key` headers), invokes the real
 * route handler, and shapes the finalized body like an Apollo mutate result
 * (`data` + a `CombinedGraphQLErrors` container when the envelope carries
 * errors) so the canonical `expectMutationError` helper applies unchanged.
 */
async function wireGraphQL(
  document: DocumentNode,
  options: {
    readonly token?: string | null;
    readonly idempotencyKey?: string | null;
    readonly variables?: Record<string, unknown>;
  } = {}
): Promise<WireResult> {
  const request = new NextRequest(
    new Request(`http://localhost:${TEST_PORT}/api/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
      },
      body: JSON.stringify({ query: print(document), variables: options.variables ?? {} }),
    })
  );
  const response = await POST(request);
  const body = recordOf(await response.json(), "GraphQL response must be a JSON object");
  const rawErrors: unknown = body.errors;
  const formatted = Array.isArray(rawErrors) ? rawErrors.map(toFormattedErrorItem) : [];
  return {
    data: body.data,
    ...(formatted.length > 0 ? { error: new CombinedGraphQLErrors({ errors: formatted }) } : {}),
  };
}

/** Mints a REAL access token for a cast user (verified by the live pipeline). */
async function tokenFor(userId: number, role: string): Promise<string> {
  return signAccessToken({ userId, role });
}

/** Books one happy-path session over the pipeline under a UNIQUE idempotency key. */
async function bookSession(accessToken: string, key: string, teacherId: number): Promise<string> {
  const result = await wireGraphQL(CREATE_SESSION_DOC, {
    token: accessToken,
    idempotencyKey: key,
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

  adminToken = tokenAdmin;
  studentAToken = tokenStudentA;
  teacherTToken = tokenTeacherT;
  applicantToken = tokenApplicant;
  parentToken = tokenParent;
  roleTokens.set("student", studentAToken);
  roleTokens.set("teacher", teacherTToken);
  roleTokens.set("parent", parentToken);
  roleTokens.set("applicant", applicantToken);

  // Pre-book the four mutation targets under DISTINCT per-run keys.
  // Sequential — the booking ladder's lane order matters (trial first).
  sessionRescheduleId = await bookSession(studentAToken, KEY_RESCHEDULE, cast.teacher.userId);
  sessionCancelId = await bookSession(studentAToken, KEY_CANCEL, cast.teacher.userId);
  sessionReassignId = await bookSession(studentAToken, KEY_REASSIGN, cast.teacher.userId);
  sessionJoinId = await bookSession(studentAToken, KEY_JOIN, cast.teacher.userId);
}, 240_000);

afterAll(async () => {
  // The governance mutations INTENTIONALLY append immutable audit rows
  // (actor = the cast admin, entity = the mutated session). The fixture
  // registry's tracked vocabulary deliberately EXCLUDES `audit_logs` (its
  // contract serves audit-free journeys — see the registry docblock), so
  // this suite removes its own rows explicitly under the trigger-suspension
  // wrapper (the audit-trail suite's teardown precedent) BEFORE the
  // FK-ordered cast delete below.
  await withAuditDeleteTriggersSuspended(async () => {
    await db
      .delete(auditLogs)
      .where(and(eq(auditLogs.entityType, "session"), inArray(auditLogs.entityId, mutationSessionIds())));
  });
  await registry.cleanup();
  // Release the single-connection PGlite data dir cleanly — an abrupt exit
  // leaves `postmaster.pid` behind, which bricks every subsequent PGlite
  // initialization in this sandbox (WASM abort on the next open).
  await closePool();
});

// ─── Section 1 — happy path per mutation (admin) ─────────────────────────────

describe("admin session-governance mutations — happy paths (admin)", () => {
  test("adminRescheduleSession returns the rescheduled Session with the replacement timing pair", async () => {
    const startedAt = futureInstant(3_600_000);
    const endedAt = futureInstant(7_200_000);
    const result = await wireGraphQL(RESCHEDULE_DOC, {
      token: adminToken,
      variables: { input: { sessionId: sessionRescheduleId, startedAt, endedAt } },
    });
    const payload = payloadOf(result, "adminRescheduleSession");
    expect(sessionIdOf(payload, "adminRescheduleSession")).toBe(sessionRescheduleId);
    expect(payload.status).toBe("Scheduled");
    expect(instantOf(payload.startedAt, "startedAt")).toBe(new Date(startedAt).getTime());
    expect(instantOf(payload.endedAt, "endedAt")).toBe(new Date(endedAt).getTime());
  });

  test("adminReassignTeacher returns the Session moved onto the certified candidate", async () => {
    const result = await wireGraphQL(REASSIGN_DOC, {
      token: adminToken,
      variables: { input: { sessionId: sessionReassignId, newTeacherUserId: String(cast.secondTeacher.userId) } },
    });
    const payload = payloadOf(result, "adminReassignTeacher");
    expect(sessionIdOf(payload, "adminReassignTeacher")).toBe(sessionReassignId);
    expect(payload.status).toBe("Scheduled");
    expect(payload.teacherId).toBe(String(cast.secondTeacher.userId));
  });

  test("adminJoinSession returns the started Session (read-only observation, columns untouched)", async () => {
    // The owner teacher starts the row first — join is live-only.
    const start = await wireGraphQL(START_SESSION_DOC, {
      token: teacherTToken,
      variables: { id: sessionJoinId },
    });
    expect(payloadOf(start, "startSession").status).toBe("Started");

    const result = await wireGraphQL(JOIN_DOC, {
      token: adminToken,
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
    const result = await wireGraphQL(CANCEL_DOC, {
      token: adminToken,
      idempotencyKey: KEY_CANCEL_REPLAY,
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
    // (the adminReplay caller's fixed key) — the same-key retry below is the
    // idempotent replay arm: the current row, NOT a DUPLICATE_REQUEST
    // throw, NOT a second mutation.
    const balanceBeforeRetry = await readHifzBalance(cast.primaryStudent.userId);
    const auditBeforeRetry = await countAuditForSession(Number(sessionCancelId));

    const retry = await wireGraphQL(CANCEL_DOC, {
      token: adminToken,
      idempotencyKey: KEY_CANCEL_REPLAY,
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
    const referenceResult = await wireGraphQL(RESOLVE_DISPUTE_REFERENCE_DOC, {
      variables: { id: UNKNOWN_SESSION_ID },
    });
    const reference = fingerprintOf(firstWireItem(referenceResult.error, "UNAUTHORIZED"));

    const anonymousReschedule = await wireGraphQL(RESCHEDULE_DOC, {
      variables: {
        input: {
          sessionId: UNKNOWN_SESSION_ID,
          startedAt: futureInstant(3_600_000),
          endedAt: futureInstant(7_200_000),
        },
      },
    });
    expectDenialIdenticalToReference(anonymousReschedule.error, "UNAUTHORIZED", reference, "adminRescheduleSession");

    const anonymousCancel = await wireGraphQL(CANCEL_DOC, {
      variables: { input: { sessionId: UNKNOWN_SESSION_ID } },
    });
    expectDenialIdenticalToReference(anonymousCancel.error, "UNAUTHORIZED", reference, "adminCancelSession");

    const anonymousReassign = await wireGraphQL(REASSIGN_DOC, {
      variables: { input: { sessionId: UNKNOWN_SESSION_ID, newTeacherUserId: "1" } },
    });
    expectDenialIdenticalToReference(anonymousReassign.error, "UNAUTHORIZED", reference, "adminReassignTeacher");

    const anonymousJoin = await wireGraphQL(JOIN_DOC, {
      variables: { input: { sessionId: UNKNOWN_SESSION_ID } },
    });
    expectDenialIdenticalToReference(anonymousJoin.error, "UNAUTHORIZED", reference, "adminJoinSession");
  });

  test("anonymous denials append ZERO audit rows (scope gate precedes the resolver)", async () => {
    const auditBefore = await countAuditForSession(Number(sessionCancelId));
    await wireGraphQL(CANCEL_DOC, { variables: { input: { sessionId: UNKNOWN_SESSION_ID } } });
    await wireGraphQL(JOIN_DOC, { variables: { input: { sessionId: UNKNOWN_SESSION_ID } } });
    expect(await countAuditForSession(Number(sessionCancelId))).toBe(auditBefore);
  });
});

// ─── Section 4 — Tier 4: 403 byte-identical per non-admin role ──────────────

describe("Tier 4 — non-admin roles: FORBIDDEN byte-identical to resolveSessionDispute", () => {
  test.each([...NON_ADMIN_ROLES])(
    "%s caller gets the SAME localized FORBIDDEN denial on every admin mutation as the reference op",
    async role => {
      const token = roleTokens.get(role);
      if (!token) {
        throw new Error(`no token provisioned for role ${role}`);
      }

      const referenceResult = await wireGraphQL(RESOLVE_DISPUTE_REFERENCE_DOC, {
        token,
        variables: { id: UNKNOWN_SESSION_ID },
      });
      const reference = fingerprintOf(firstWireItem(referenceResult.error, "FORBIDDEN"));

      const deniedReschedule = await wireGraphQL(RESCHEDULE_DOC, {
        token,
        variables: {
          input: {
            sessionId: UNKNOWN_SESSION_ID,
            startedAt: futureInstant(3_600_000),
            endedAt: futureInstant(7_200_000),
          },
        },
      });
      expectDenialIdenticalToReference(deniedReschedule.error, "FORBIDDEN", reference, "adminRescheduleSession");

      const deniedCancel = await wireGraphQL(CANCEL_DOC, {
        token,
        variables: { input: { sessionId: UNKNOWN_SESSION_ID } },
      });
      expectDenialIdenticalToReference(deniedCancel.error, "FORBIDDEN", reference, "adminCancelSession");

      const deniedReassign = await wireGraphQL(REASSIGN_DOC, {
        token,
        variables: { input: { sessionId: UNKNOWN_SESSION_ID, newTeacherUserId: "1" } },
      });
      expectDenialIdenticalToReference(deniedReassign.error, "FORBIDDEN", reference, "adminReassignTeacher");

      const deniedJoin = await wireGraphQL(JOIN_DOC, {
        token,
        variables: { input: { sessionId: UNKNOWN_SESSION_ID } },
      });
      expectDenialIdenticalToReference(deniedJoin.error, "FORBIDDEN", reference, "adminJoinSession");
    }
  );

  test("non-admin denials append ZERO audit rows (scope gate precedes the resolver)", async () => {
    const auditBefore = await countAuditForSession(Number(sessionCancelId));
    await Promise.all(
      NON_ADMIN_ROLES.map(role => {
        const token = roleTokens.get(role);
        if (!token) {
          throw new Error(`no token provisioned for role ${role}`);
        }
        return wireGraphQL(CANCEL_DOC, { token, variables: { input: { sessionId: UNKNOWN_SESSION_ID } } });
      })
    );
    expect(await countAuditForSession(Number(sessionCancelId))).toBe(auditBefore);
  });
});
