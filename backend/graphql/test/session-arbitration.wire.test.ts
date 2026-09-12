/**
 * Session arbitration wire matrix — the post-confirmation dispute surface
 * (`openPostConfirmationDispute`, the extended `resolveSessionDispute`
 * input, and `adminDisputeCase`) over the LIVE GraphQL boundary
 * (`setupTestServerLifecycle` + `testClient` harness; mandated runner at
 * the bottom).
 *
 * Cells locked down over the real pipeline (gateway → scope-auth →
 * resolver → session services → PostgreSQL):
 *  - **Anonymous denials** — every new surface answers UNAUTHORIZED with a
 *    denial byte-identical to the shipped `resolveSessionDispute`
 *    reference (same localized message, same `extensions.code`, same
 *    extension key set; only the per-request `requestId` value and the
 *    failing root field's `path` differ by design).
 *  - **Non-admin FORBIDDEN byte-identity** — student / teacher / parent
 *    callers get the SAME localized FORBIDDEN denial on
 *    `adminDisputeCase` as on the shipped arbitration reference op (the
 *    explicit `$all` scope conjunction; the service additionally
 *    re-asserts the governance-clean admin role from the user row).
 *  - **Student dispute entry** — the row's own teacher, a foreign student,
 *    and a nonexistent id collapse to the SAME oracle-safe
 *    `SESSION_NOT_FOUND`; an owned row that is not a dual-confirmed
 *    completion with its escrow consumed is the
 *    `SESSION_INVALID_TRANSITION` conflict; the happy path moves the row
 *    into `disputed` with the reason persisted; the immediate
 *    double-submission loses as the state conflict; an empty/whitespace
 *    reason is the pre-DB `VALIDATION` denial.
 *  - **Admin case read** — the bundle returns the disputed row, honest
 *    `null`s for the never-produced artifacts, and the (initially empty)
 *    session-scoped audit trail; after an arbitration commits, the trail
 *    surfaces the `override` row; unknown ids are localized not-found
 *    denials.
 *  - **Outcome-family dispatch** — the single `resolveSessionDispute`
 *    entry routes by the submitted outcome: the held-family values
 *    (`Cancel`/`Complete`) reach the shipped held-escrow service
 *    (`Cancel` refunds the lane; `Complete` on a never-started row is the
 *    shipped pre-DB validation denial), while the consumed-family values
 *    (`Refund`/`PartialRefund`/`Uphold`) reach the arbitration service —
 *    proven on BOTH sides: a `Refund` submitted for a held-escrow dispute
 *    is the arbitration service's classification-mismatch denial (the
 *    dedicated localized copy), an `Uphold` completes a consumed dispute
 *    with zero financial movement, a full `Refund` reverses the teacher's
 *    wallet by the session fee and restores the student's lane credit, and
 *    the amount policy denies a malformed/out-of-range `partialAmount`
 *    plus stray money alongside any non-partial outcome (dedicated
 *    localized copy) — all pre-DB, leaving the row untouched.
 *
 * Fixtures: a real committed cast (real `users.role` + role-child rows via
 * `@/test/workflows/helpers` builders) + per-run `jrn_*` idempotency keys;
 * every created session id is registered for the FK-safe hard-delete
 * cleanup. Identity rides minted-but-real access tokens (same
 * `signAccessToken` the auth layer issues; the spawned server verifies
 * them with the same env) — nothing is monkey-patched. The append-only
 * ledgers the arbitrations produce (`audit_logs`, `teacher_transaction`)
 * are swept in `afterAll` under the sanctioned trigger suspensions before
 * the cast teardown, mirroring the sessions journey cleanup.
 *
 * Run:
 *   bun run test/scripts/run-test.ts backend/graphql/test/session-arbitration.wire.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/backend/db";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import { wallet } from "@/backend/db/schema/billing/wallet";
import { session } from "@/backend/db/schema/classes/session";
import { students } from "@/backend/db/schema/students/students";
import {
  expectDenialIdenticalToReference,
  fingerprintOf,
  firstWireItem,
} from "@/backend/graphql/test/helpers/admin-session-governance.wire";
import { signAccessToken } from "@/backend/lib/auth/jwt";
import { SESSION_FEE_HIFZ } from "@/shared/constants/session-fees.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import { expectMutationError, setupTestServerLifecycle, TEST_PORT, testClient } from "@/test/helpers";
import { withAuditDeleteTriggersSuspended, withImmutabilityTriggersSuspended } from "@/test/helpers/db-cleanup";
import {
  buildSessionJourneyCast,
  createSessionFixtureRegistry,
  journeyPrefix,
  type SessionJourneyCast,
} from "@/test/workflows/helpers";

// ─── Harness state ───────────────────────────────────────────────────────────

/** Spawns (or reuses) the live test server before any wire call. */
setupTestServerLifecycle();

/** The suite's fixed locale (drives the expected localized denial copy). */
const LOCALE = "en";

/** Per-run prefix — unique user labels AND idempotency keys per suite run. */
const PREFIX = journeyPrefix("sessarb");

const KEY_ORACLE = `${PREFIX}-oracle`;
const KEY_WRONG_STATE = `${PREFIX}-wrong-state`;
const KEY_HELD_MISMATCH = `${PREFIX}-held-mismatch`;
const KEY_HELD_COMPLETE = `${PREFIX}-held-complete`;
const KEY_HELD_CANCEL = `${PREFIX}-held-cancel`;
const KEY_UPHOLD = `${PREFIX}-uphold`;
const KEY_REFUND = `${PREFIX}-refund`;
const KEY_AMOUNT = `${PREFIX}-amount`;

/** The fixture registry — every created session id is hard-deleted in afterAll. */
const registry = createSessionFixtureRegistry();

let cast: SessionJourneyCast;

// Actor-scoped clients (Bearer identity; the dispute surfaces carry no
// idempotency semantics of their own — only the bookings need keys).
let studentA: ApolloClient; // primary student (the dispute entrant)
let studentB: ApolloClient; // second student (foreign actor)
let teacherT: ApolloClient; // certified owner teacher
let parent: ApolloClient;
let admin: ApolloClient;

/** Booked-session ids shared across the sequential legs. */
let sessionOracleId = ""; // consumed completion → the entry-matrix target
let sessionWrongStateId = ""; // scheduled row → the wrong-state denial target
let sessionHeldMismatchId = ""; // held dispute → consumed-family denial probe
let sessionHeldCompleteId = ""; // held dispute → shipped Complete denial probe
let sessionHeldCancelId = ""; // held dispute → shipped Cancel happy path
let sessionUpholdId = ""; // consumed dispute → uphold (zero financial writes)
let sessionRefundId = ""; // consumed dispute → full refund (financial proof)
let sessionAmountId = ""; // consumed dispute → amount-policy denial probes

// ─── Documents ───────────────────────────────────────────────────────────────

const CREATE_SESSION_DOC = gql`
  mutation CreateSession($input: CreateSessionInput!) {
    createSession(input: $input) {
      id
      status
      fee
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

const COMPLETE_SESSION_DOC = gql`
  mutation CompleteSession($id: ID!) {
    completeSession(id: $id) {
      id
      status
    }
  }
`;

const CONFIRM_SESSION_DOC = gql`
  mutation ConfirmSessionCompletion($id: ID!) {
    confirmSessionCompletion(id: $id) {
      id
      status
      feeHeld
      confirmedByStudentAt
    }
  }
`;

const OPEN_SESSION_DISPUTE_DOC = gql`
  mutation OpenSessionDispute($id: ID!, $reason: String!) {
    openSessionDispute(id: $id, reason: $reason) {
      id
      status
    }
  }
`;

const OPEN_POST_CONFIRMATION_DISPUTE_DOC = gql`
  mutation OpenPostConfirmationDispute($id: ID!, $reason: String!) {
    openPostConfirmationDispute(id: $id, reason: $reason) {
      id
      status
      feeHeld
      disputeReason
      disputedAt
    }
  }
`;

const RESOLVE_DISPUTE_DOC = gql`
  mutation ResolveSessionDispute($id: ID!, $resolution: DisputeResolution!, $note: String, $partialAmount: String) {
    resolveSessionDispute(id: $id, resolution: $resolution, note: $note, partialAmount: $partialAmount) {
      id
      status
      feeHeld
      resolutionNote
      resolvedAt
    }
  }
`;

const ADMIN_DISPUTE_CASE_DOC = gql`
  query AdminDisputeCase($id: ID!) {
    adminDisputeCase(id: $id) {
      session {
        id
        status
        feeHeld
        disputeReason
        disputedAt
      }
      report {
        id
      }
      homework {
        id
      }
      recitation {
        id
      }
      auditTrail {
        id
        actionType
        actorId
        entityType
        entityId
      }
    }
  }
`;

// ─── Narrowing helpers (runtime-guarded — zero casts) ────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extracts the root-field payload object of a happy-path result. */
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
  const id = sessionIdOf(payloadOf(result, "createSession"), "createSession");
  registry.track("session", Number(id));
  return id;
}

/** Drives one booked session through the full dual confirmation (wire ops). */
async function completeAndConfirm(sessionId: string): Promise<void> {
  const started = await teacherT.mutate({ mutation: START_SESSION_DOC, variables: { id: sessionId } });
  expect(payloadOf(started, "startSession").status).toBe("Started");
  const completed = await teacherT.mutate({ mutation: COMPLETE_SESSION_DOC, variables: { id: sessionId } });
  expect(payloadOf(completed, "completeSession").status).toBe("Completed");
  const confirmed = await studentA.mutate({ mutation: CONFIRM_SESSION_DOC, variables: { id: sessionId } });
  const confirmedPayload = payloadOf(confirmed, "confirmSessionCompletion");
  expect(confirmedPayload.status).toBe("Completed");
  expect(confirmedPayload.feeHeld).toBe(false);
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

/** Reads the teacher's wallet balance (a missing wallet counts as zero). */
async function readTeacherWalletBalance(teacherUserId: number): Promise<number> {
  const rows = await db.select({ balance: wallet.balance }).from(wallet).where(eq(wallet.teacherId, teacherUserId));
  const balance: unknown = rows[0]?.balance;
  if (balance === undefined || balance === null) {
    return 0;
  }
  return Number(balance);
}

/** The expected localized denial copy for the suite's fixed locale. */
function expectedCopy(key: "disputeResolutionMismatch" | "partialRefundAmountInvalid" | "validation"): string {
  const t = getServerTranslations(LOCALE).errorsTranslations;
  return t[key];
}

// ─── Fixtures (committed cast + the full dispute-state setup) ───────────────

beforeAll(async () => {
  // Committed cast — the primary student funds EIGHT net bookings (the
  // trial lane drains first, then the hifz lane carries the remaining
  // seven); the refund outcomes restore their own units, so the ladder
  // never goes negative mid-suite. Second student is unfunded (a foreign
  // actor only).
  await db.transaction(async tx => {
    cast = await buildSessionJourneyCast(tx, registry, {
      prefix: PREFIX,
      primaryStudent: { trial: 1, hifz: 7 },
      secondStudent: { hifz: 0 },
    });
  });

  const [tokenStudentA, tokenStudentB, tokenTeacherT, tokenParent, tokenAdmin] = await Promise.all([
    tokenFor(cast.primaryStudent.userId, cast.primaryStudent.user.role),
    tokenFor(cast.secondStudent.userId, cast.secondStudent.user.role),
    tokenFor(cast.teacher.userId, cast.teacher.user.role),
    tokenFor(cast.parent.userId, cast.parent.user.role),
    tokenFor(cast.admin.userId, cast.admin.user.role),
  ]);

  studentA = clientFor(tokenStudentA);
  studentB = clientFor(tokenStudentB);
  teacherT = clientFor(tokenTeacherT);
  parent = clientFor(tokenParent);
  admin = clientFor(tokenAdmin);

  // Book the eight lifecycle targets under DISTINCT per-run keys, all
  // against the same owner teacher. Sequential — lane order matters (the
  // first booking drains the trial lane; every later one binds hifz).
  sessionOracleId = await bookSession(tokenStudentA, KEY_ORACLE, cast.teacher.userId);
  sessionWrongStateId = await bookSession(tokenStudentA, KEY_WRONG_STATE, cast.teacher.userId);
  sessionHeldMismatchId = await bookSession(tokenStudentA, KEY_HELD_MISMATCH, cast.teacher.userId);
  sessionHeldCompleteId = await bookSession(tokenStudentA, KEY_HELD_COMPLETE, cast.teacher.userId);
  sessionHeldCancelId = await bookSession(tokenStudentA, KEY_HELD_CANCEL, cast.teacher.userId);
  sessionUpholdId = await bookSession(tokenStudentA, KEY_UPHOLD, cast.teacher.userId);
  sessionRefundId = await bookSession(tokenStudentA, KEY_REFUND, cast.teacher.userId);
  sessionAmountId = await bookSession(tokenStudentA, KEY_AMOUNT, cast.teacher.userId);

  // Dual-confirm the four consumed-generation targets.
  await completeAndConfirm(sessionOracleId);
  await completeAndConfirm(sessionUpholdId);
  await completeAndConfirm(sessionRefundId);
  await completeAndConfirm(sessionAmountId);

  // Open the pre-disputed states:
  //  - the three held-generation rows are disputed while still scheduled;
  //  - the uphold / refund / amount rows are disputed AFTER the dual
  //    confirmation (consumed escrow). The oracle row stays a clean
  //    completion until its own matrix cell opens the dispute.
  const heldOpens = [sessionHeldMismatchId, sessionHeldCompleteId, sessionHeldCancelId].map(async id => {
    const opened = await studentA.mutate({
      mutation: OPEN_SESSION_DISPUTE_DOC,
      variables: { id, reason: "held-generation dispute fixture" },
    });
    expect(payloadOf(opened, "openSessionDispute").status).toBe("Disputed");
  });
  const consumedOpens = [sessionUpholdId, sessionRefundId, sessionAmountId].map(async id => {
    const opened = await studentA.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id, reason: "consumed-generation dispute fixture" },
    });
    expect(payloadOf(opened, "openPostConfirmationDispute").status).toBe("Disputed");
  });
  await Promise.all([...heldOpens, ...consumedOpens]);
}, 240_000);

afterAll(async () => {
  const sessionIds = [
    sessionOracleId,
    sessionWrongStateId,
    sessionHeldMismatchId,
    sessionHeldCompleteId,
    sessionHeldCancelId,
    sessionUpholdId,
    sessionRefundId,
    sessionAmountId,
  ]
    .filter(id => id !== "")
    .map(id => Number(id));

  // The arbitration audit rows are append-only (DELETE-blocked) and
  // restrict-delete into `users` — swept FIRST under the sanctioned trigger
  // suspension, by the arbiter actor and by session entity.
  await withAuditDeleteTriggersSuspended(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.actorId, cast.admin.userId));
    if (sessionIds.length > 0) {
      await db
        .delete(auditLogs)
        .where(and(eq(auditLogs.entityType, "session"), inArray(auditLogs.entityId, sessionIds)));
    }
  });

  // The ledger rows (the confirmations' earnings + the refund's
  // compensating reversal) are append-only and restrict-delete into the
  // wallet — swept under the trigger suspension while the wallets exist.
  const walletRows = await db
    .select({ id: wallet.id })
    .from(wallet)
    .where(inArray(wallet.teacherId, [cast.teacher.userId, cast.secondTeacher.userId]));
  const walletIds = walletRows.map(row => row.id);
  if (walletIds.length > 0) {
    await withImmutabilityTriggersSuspended(["teacher_transaction"], async () => {
      await db.delete(teacherTransaction).where(inArray(teacherTransaction.walletId, walletIds));
    });
  }

  // Hard-deletes every tracked fixture inside one committed transaction,
  // FK-safe order (the notifications cascade away with their users).
  await registry.cleanup();

  // Zero-residue self-check: the suite's session rows are gone.
  await Promise.all(sessionIds.map(async id => expect(await db.$count(session, eq(session.id, id))).toBe(0)));
});

// ─── Section 1 — anonymous callers: UNAUTHORIZED byte-identity ───────────────

describe("anonymous callers — UNAUTHORIZED byte-identical to the arbitration reference", () => {
  test("anonymous openPostConfirmationDispute / adminDisputeCase / resolveSessionDispute → the SAME UNAUTHORIZED denial", async () => {
    const referenceResult = await testClient.mutate({
      mutation: RESOLVE_DISPUTE_DOC,
      variables: { id: "999999999", resolution: "Cancel" },
    });
    const reference = fingerprintOf(firstWireItem(referenceResult.error, "UNAUTHORIZED"));

    const opened = await testClient.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id: sessionOracleId, reason: "anonymous probe" },
    });
    expectDenialIdenticalToReference(opened.error, "UNAUTHORIZED", reference, "openPostConfirmationDispute");

    const caseRead = await testClient.query({
      query: ADMIN_DISPUTE_CASE_DOC,
      variables: { id: sessionOracleId },
    });
    expectDenialIdenticalToReference(caseRead.error, "UNAUTHORIZED", reference, "adminDisputeCase");
  });
});

// ─── Section 2 — non-admin roles: FORBIDDEN byte-identity on admin surfaces ──

describe("non-admin roles — FORBIDDEN byte-identical to the arbitration reference", () => {
  const NON_ADMIN_CLIENTS: ReadonlyArray<[string, () => ApolloClient]> = [
    ["student", () => studentA],
    ["teacher", () => teacherT],
    ["parent", () => parent],
  ];

  for (const [role, clientOf] of NON_ADMIN_CLIENTS) {
    test(`${role} caller gets the SAME localized FORBIDDEN denial on adminDisputeCase as on resolveSessionDispute`, async () => {
      const referenceResult = await clientOf().mutate({
        mutation: RESOLVE_DISPUTE_DOC,
        variables: { id: "999999999", resolution: "Cancel" },
      });
      const reference = fingerprintOf(firstWireItem(referenceResult.error, "FORBIDDEN"));

      const caseRead = await clientOf().query({
        query: ADMIN_DISPUTE_CASE_DOC,
        variables: { id: sessionOracleId },
      });
      expectDenialIdenticalToReference(caseRead.error, "FORBIDDEN", reference, "adminDisputeCase");
    });
  }
});

// ─── Section 3 — openPostConfirmationDispute: predicate + oracle + exactly-once

describe("openPostConfirmationDispute — student predicate, oracle collapse, exactly-once", () => {
  test("owner student on a scheduled row → SESSION_INVALID_TRANSITION (not a dual-confirmed completion)", async () => {
    const result = await studentA.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id: sessionWrongStateId, reason: "too early" },
    });
    expectMutationError(result.error, "SESSION_INVALID_TRANSITION");
  });

  test("the row's own teacher → SESSION_NOT_FOUND (oracle collapse: teacher is not the student)", async () => {
    const result = await teacherT.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id: sessionOracleId, reason: "the teacher cannot use the student entry" },
    });
    expectMutationError(result.error, "SESSION_NOT_FOUND");
  });

  test("foreign student → SESSION_NOT_FOUND (indistinguishable from a nonexistent id)", async () => {
    const result = await studentB.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id: sessionOracleId, reason: "not mine" },
    });
    expectMutationError(result.error, "SESSION_NOT_FOUND");
  });

  test("nonexistent id → SESSION_NOT_FOUND (the oracle pair of the foreign denial)", async () => {
    const result = await studentA.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id: "999999999", reason: "nowhere" },
    });
    expectMutationError(result.error, "SESSION_NOT_FOUND");
  });

  test("owner student happy path → Disputed with the reason persisted, escrow untouched", async () => {
    const result = await studentA.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id: sessionOracleId, reason: "the recorded lesson does not match what was taught" },
    });
    const payload = payloadOf(result, "openPostConfirmationDispute");
    expect(payload.status).toBe("Disputed");
    expect(payload.feeHeld).toBe(false);
    expect(payload.disputeReason).toBe("the recorded lesson does not match what was taught");
    expect(payload.disputedAt).toBeTypeOf("string");
  });

  test("immediate double submission → SESSION_INVALID_TRANSITION (exactly-once)", async () => {
    const result = await studentA.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id: sessionOracleId, reason: "a second submission must never win" },
    });
    expectMutationError(result.error, "SESSION_INVALID_TRANSITION");
  });

  test("whitespace-only reason → VALIDATION (pre-DB reason guard)", async () => {
    const result = await studentA.mutate({
      mutation: OPEN_POST_CONFIRMATION_DISPUTE_DOC,
      variables: { id: sessionOracleId, reason: "   " },
    });
    expectMutationError(result.error, "VALIDATION");
  });
});

// ─── Section 4 — adminDisputeCase: the evidence bundle with honest nulls ─────

describe("adminDisputeCase — the admin case-review read", () => {
  test("the disputed bundle returns the session row, honest nulls, and the (empty) trail", async () => {
    const result = await admin.query({ query: ADMIN_DISPUTE_CASE_DOC, variables: { id: sessionOracleId } });
    const payload = payloadOf(result, "adminDisputeCase");
    const sessionPayload: unknown = payload.session;
    if (!isRecord(sessionPayload)) {
      throw new Error("adminDisputeCase must carry the session member");
    }
    expect(sessionPayload.id).toBe(sessionOracleId);
    expect(sessionPayload.status).toBe("Disputed");
    expect(sessionPayload.feeHeld).toBe(false);
    // No report/homework/recitation was ever produced for the row — the
    // read fabricates nothing.
    expect(payload.report).toBeNull();
    expect(payload.homework).toBeNull();
    expect(payload.recitation).toBeNull();
    // A dispute OPEN writes zero audit rows — the trail starts empty.
    expect(payload.auditTrail).toEqual([]);
  });

  test("unknown id → SESSION_NOT_FOUND (localized not-found denial)", async () => {
    const result = await admin.query({ query: ADMIN_DISPUTE_CASE_DOC, variables: { id: "999999999" } });
    expectMutationError(result.error, "SESSION_NOT_FOUND");
  });
});

// ─── Section 5 — resolveSessionDispute: the outcome-family dispatch matrix ───

describe("resolveSessionDispute — held-family values ride the shipped held-escrow service", () => {
  test("Refund on a held-escrow dispute → the arbitration service's classification-mismatch denial (row untouched)", async () => {
    const before = await admin.query({ query: ADMIN_DISPUTE_CASE_DOC, variables: { id: sessionHeldMismatchId } });
    expect(payloadOf(before, "adminDisputeCase").session).toBeTruthy();

    const result = await admin.mutate({
      mutation: RESOLVE_DISPUTE_DOC,
      variables: { id: sessionHeldMismatchId, resolution: "Refund" },
    });
    expectMutationError(result.error, "VALIDATION");
    const item = firstWireItem(result.error, "VALIDATION");
    expect(item.message).toBe(expectedCopy("disputeResolutionMismatch"));

    // The denial wrote nothing: the row is still disputed for the held
    // family's own vocabulary.
    const after = await admin.query({ query: ADMIN_DISPUTE_CASE_DOC, variables: { id: sessionHeldMismatchId } });
    const sessionPayload: unknown = payloadOf(after, "adminDisputeCase").session;
    if (!isRecord(sessionPayload)) {
      throw new Error("adminDisputeCase must carry the session member");
    }
    expect(sessionPayload.status).toBe("Disputed");
  });

  test("Complete on a never-started held-escrow dispute → the shipped service's own pre-DB validation denial", async () => {
    const result = await admin.mutate({
      mutation: RESOLVE_DISPUTE_DOC,
      variables: { id: sessionHeldCompleteId, resolution: "Complete" },
    });
    expectMutationError(result.error, "VALIDATION");
    const item = firstWireItem(result.error, "VALIDATION");
    // The GENERIC validation copy — NOT the classification-mismatch one —
    // proves the held-family value reached the shipped service (which owns
    // the never-started guard), never the arbitration service.
    expect(item.message).toBe(expectedCopy("validation"));
    expect(item.message).not.toBe(expectedCopy("disputeResolutionMismatch"));
  });

  test("Cancel on a held-escrow dispute → Cancelled with the lane refunded (the byte-stable shipped path)", async () => {
    const beforeRefund = await readHifzBalance(cast.primaryStudent.userId);
    const result = await admin.mutate({
      mutation: RESOLVE_DISPUTE_DOC,
      variables: { id: sessionHeldCancelId, resolution: "Cancel", note: "held dispute cancelled" },
    });
    const payload = payloadOf(result, "resolveSessionDispute");
    expect(payload.status).toBe("Cancelled");
    expect(payload.feeHeld).toBe(false);
    expect(payload.resolutionNote).toBe("held dispute cancelled");
    const afterRefund = await readHifzBalance(cast.primaryStudent.userId);
    expect(afterRefund).toBe(beforeRefund + 1);
  });
});

describe("resolveSessionDispute — consumed-family values ride the arbitration service", () => {
  test("Uphold on a consumed dispute → Completed with ZERO financial movement", async () => {
    const walletBefore = await readTeacherWalletBalance(cast.teacher.userId);
    const laneBefore = await readHifzBalance(cast.primaryStudent.userId);

    const result = await admin.mutate({
      mutation: RESOLVE_DISPUTE_DOC,
      variables: { id: sessionUpholdId, resolution: "Uphold", note: "the completion stands" },
    });
    const payload = payloadOf(result, "resolveSessionDispute");
    expect(payload.status).toBe("Completed");
    expect(payload.feeHeld).toBe(false);
    expect(payload.resolvedAt).toBeTypeOf("string");

    expect(await readTeacherWalletBalance(cast.teacher.userId)).toBe(walletBefore);
    expect(await readHifzBalance(cast.primaryStudent.userId)).toBe(laneBefore);
  });

  test("Refund on a consumed dispute → Completed, the teacher's wallet reversed by the fee, the lane credit restored", async () => {
    const walletBefore = await readTeacherWalletBalance(cast.teacher.userId);
    const laneBefore = await readHifzBalance(cast.primaryStudent.userId);

    const result = await admin.mutate({
      mutation: RESOLVE_DISPUTE_DOC,
      variables: { id: sessionRefundId, resolution: "Refund", note: "fee returned after case review" },
    });
    const payload = payloadOf(result, "resolveSessionDispute");
    expect(payload.status).toBe("Completed");
    expect(payload.feeHeld).toBe(false);

    expect(await readTeacherWalletBalance(cast.teacher.userId)).toBe(walletBefore - Number(SESSION_FEE_HIFZ));
    expect(await readHifzBalance(cast.primaryStudent.userId)).toBe(laneBefore + 1);
  });

  test("PartialRefund with a zero amount → the amount-policy denial (pre-DB, row untouched)", async () => {
    const result = await admin.mutate({
      mutation: RESOLVE_DISPUTE_DOC,
      variables: { id: sessionAmountId, resolution: "PartialRefund", partialAmount: "0" },
    });
    expectMutationError(result.error, "VALIDATION");
    const item = firstWireItem(result.error, "VALIDATION");
    expect(item.message).toBe(expectedCopy("partialRefundAmountInvalid"));
  });

  test("stray partialAmount alongside Uphold → the same amount-policy denial (no money input is silently ignored)", async () => {
    const result = await admin.mutate({
      mutation: RESOLVE_DISPUTE_DOC,
      variables: { id: sessionAmountId, resolution: "Uphold", partialAmount: "1.00" },
    });
    expectMutationError(result.error, "VALIDATION");
    const item = firstWireItem(result.error, "VALIDATION");
    expect(item.message).toBe(expectedCopy("partialRefundAmountInvalid"));
  });
});

// ─── Section 6 — the case read after arbitration composes the real trail ─────

describe("adminDisputeCase after arbitration — the audit trail surfaces the override row", () => {
  test("the resolved case carries the session's override audit entry", async () => {
    const result = await admin.query({ query: ADMIN_DISPUTE_CASE_DOC, variables: { id: sessionRefundId } });
    const payload = payloadOf(result, "adminDisputeCase");
    const sessionPayload: unknown = payload.session;
    if (!isRecord(sessionPayload)) {
      throw new Error("adminDisputeCase must carry the session member");
    }
    expect(sessionPayload.status).toBe("Completed");

    const trail: unknown = payload.auditTrail;
    if (!Array.isArray(trail) || trail.length !== 1) {
      throw new Error("the arbitrated case must expose exactly one audit trail entry");
    }
    const entry: unknown = trail[0];
    if (!isRecord(entry)) {
      throw new Error("the audit trail entry must be an object");
    }
    expect(entry.actionType).toBe("Override");
    expect(entry.entityType).toBe("session");
    expect(entry.entityId).toBe(Number(sessionRefundId));
    expect(entry.actorId).toBe(cast.admin.userId);
  });
});
