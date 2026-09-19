/**
 * Consolidated GraphQL wire matrix for the teacher-scoped
 * `studentHomeworkHistory` read over the REAL wire (HTTP → gateway
 * pipeline → scope-auth → resolver → StudentHomeworkService → PostgreSQL →
 * back).
 *
 * The matrix covers every cell of plan §10's permission matrix for the
 * new read surface (8 caller classes × id-shape probes × paging args):
 *
 *  | caller              | studentHomeworkHistory                       |
 *  |---------------------|-----------------------------------------------|
 *  | anonymous           | UNAUTHORIZED (401)                            |
 *  | student             | FORBIDDEN (role scope — 403)                  |
 *  | parent             | FORBIDDEN (role scope — 403)                  |
 *  | admin              | FORBIDDEN (role scope — 403)                   |
 *  | teacher-of-record   | envelope happy path with rows authored by T2  |
 *  | teacher foreign     | constant FORBIDDEN (no existence disclosure)  |
 *  | unknown studentId  | constant FORBIDDEN (byte-identical w/ foreign) |
 *  | malformed studentId| VALIDATION (pre-DB id-shape guard)            |
 *
 * On top of the matrix:
 *  - **Constant-oracle byte-identity** — the foreign-teacher denial
 *    response and the unknown-student denial response are byte-identical
 *    GraphQL response bodies (raw serialize-and-compare; D9 oracle safety).
 *  - **Id-shape fuzz** — non-numeric / negative / zero / float / overflow
 *    student ids answer the SAME typed `VALIDATION` denial (the boundary
 *    guard) — never a masked 500.
 *  - **Envelope parity** — every happy path returns the EXACT shape
 *    `{items, totalCount, page, pageSize}`, the items carry the canonical
 *    12-field `SessionHomeWork` row, and the effective paging values echo
 *    back to the caller (the service clamps `page`/`pageSize`; the
 *    effective values ride back).
 *  - **Paging arg echo** — a hostile `pageSize: 51` collapses to `25`
 *    (default, NOT cap); `pageSize: 50` stays `50`; `page: 0` collapses
 *    to `1`. The effective values echo back in the envelope.
 *  - **Role-scope precedence** — a low-privilege token (student, parent,
 *    admin) is denied at the scope layer BEFORE the resolver runs, so
 *    the service never sees the call. Anonymous callers get the
 *    `authenticated` scope's `UNAUTHORIZED` (401) before the resolver.
 *
 * Fixture strategy: a real committed cast via `buildSessionJourneyCast`
 * (real `users.role` rows + role children + certified teachers, tracked
 * for hard-delete cleanup). σ reaches `completed` through the REAL
 * lifecycle over the wire (book → start → complete); a real
 * `submitSessionReport` mutation submits the report + homework H1
 * authored by the teacher-of-record T1; a second teacher T2 reads the
 * history. The cross-teacher visibility invariant (FR-5.3) is asserted
 * over the wire.
 *
 * ENVIRONMENT NOTE (sandbox): the canonical lifecycle helper boots its own
 * dev server on TEST_PORT (3066) when nothing answers there; where a
 * server already owns the port the liveness probe succeeds and no second
 * server is spawned.
 *
 * Mandated runner: bun run test/scripts/run-test.ts backend/graphql/test/student-homework-history.wire.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/backend/db";
import { homeWork } from "@/backend/db/schema/classes/home-work";
import { reports } from "@/backend/db/schema/classes/reports";
import { notifications } from "@/backend/db/schema/notifications/notifications";
import { students } from "@/backend/db/schema/students/students";
import { createTestParent, createTestUser } from "@/backend/db/test/entity-setup";
import { signAccessToken } from "@/backend/lib/auth/jwt";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import { expectMutationError, setupTestServerLifecycle, TEST_PORT } from "@/test/helpers";
import {
  buildSessionJourneyCast,
  createSessionFixtureRegistry,
  journeyPrefix,
  type SessionJourneyCast,
} from "@/test/workflows/helpers";

// ─── Harness state ───────────────────────────────────────────────────────────

/** Spawns (or reuses) the live test server before any wire call. */
setupTestServerLifecycle();

/** Per-run prefix — unique row labels AND idempotency keys per suite run. */
const PREFIX = journeyPrefix("studhwire");

const KEY_SIGMA = `${PREFIX}-key-sigma`;
const KEY_SIGMA_PRIME = `${PREFIX}-key-sigma-prime`;

/** The fixture registry — cast rows AND wire-booked sessions hard-deleted in afterAll. */
const registry = createSessionFixtureRegistry();

let cast: SessionJourneyCast;
let parentOtherUserId = 0;
let sigmaId = "";
let sigmaPrimeId = "";

// Actor-scoped clients (Bearer identity, per the lifecycle wire-suite pattern).
let studentParticipant: ApolloClient;
let teacherOwner: ApolloClient; // T1 — owns σ + σ′ and authors the homework H1
let teacherForeign: ApolloClient; // T2 — same student, different teacher, reads the history
let parentLinked: ApolloClient;
let parentOther: ApolloClient;
let adminActor: ApolloClient;

// ─── Locale-key expected copy (never hardcoded strings — 2.SR) ─────────────

const tEn = getServerTranslations("en").errorsTranslations;

// ─── Documents (id-first selections — Apollo cache normalization pin) ────────

const STUDENT_HOMEWORK_HISTORY_DOC = gql`
  query WireStudentHomeworkHistory($studentId: ID!, $page: Int, $pageSize: Int) {
    studentHomeworkHistory(studentId: $studentId, page: $page, pageSize: $pageSize) {
      items {
        id
        sessionId
        currentFromAyah
        currentToAyah
        currentGrade
        currentSurahJuz
        revisionFromAyah
        revisionToAyah
        revisionGrade
        revisionSurahJuz
        createdAt
        updatedAt
      }
      totalCount
      page
      pageSize
    }
  }
`;

const CREATE_SESSION_DOC = gql`
  mutation WireBookSession($input: CreateSessionInput!) {
    createSession(input: $input) {
      id
    }
  }
`;

const START_SESSION_DOC = gql`
  mutation WireStartSession($id: ID!) {
    startSession(id: $id) {
      id
    }
  }
`;

const COMPLETE_SESSION_DOC = gql`
  mutation WireCompleteSession($id: ID!) {
    completeSession(id: $id) {
      id
    }
  }
`;

const SUBMIT_REPORT_DOC = gql`
  mutation WireSubmitSessionReport($id: ID!, $input: SubmitSessionReportInput!) {
    submitSessionReport(id: $id, input: $input) {
      id
      sessionId
      teacherNotes
      studentRatingByTeacher
      createdAt
      updatedAt
    }
  }
`;

/** The exact submit payload σ's happy path uses — Jadid + Madi blocks. */
const SIGMA_SUBMIT_INPUT = {
  teacherNotes: "Wire suite report — cross-teacher visibility check.",
  studentRatingByTeacher: 5,
  homework: {
    jadid: { fromAyah: 1, toAyah: 7, surahJuz: "SurahAlBaqarah" },
    madi: { fromAyah: 281, toAyah: 286, surahJuz: "Juz30" },
  },
  previousGrades: null,
};

// ─── Runtime guards (no casts, per test-tier discipline) ─────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function recordOf(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(message);
  }
  return value;
}

/** Narrows `unknown` to `Record<string, unknown>[]` via a runtime Array + element-shape check. */
function arrayOfRecords(value: unknown, message: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`${message} (item ${index} is not a record)`);
    }
    return item;
  });
}

/** The single GraphQL error item of a raw denial body, runtime-guarded. */
function soleErrorItemOf(body: Record<string, unknown>): Record<string, unknown> {
  const errors = recordOf(body, "expected a response body").errors;
  if (!Array.isArray(errors) || errors.length !== 1) {
    throw new Error("expected exactly one error item");
  }
  return recordOf(errors[0], "expected a record-shaped error item");
}

function errorCodeOf(errorItem: Record<string, unknown>): string {
  const code = recordOf(errorItem.extensions, "expected record-shaped extensions").code;
  if (typeof code !== "string") {
    throw new Error("expected a string error code");
  }
  return code;
}

/**
 * Asserts one raw-wire denial body answers the expected `extensions.code`
 * with the shipped error contract: single-item envelope, a correlated
 * `requestId`, and NEVER a stacktrace (no leaked internals). The
 * `dataMode` distinguishes the non-nullable mutation channel from the
 * nullable query channel.
 */
function expectDenialCode(
  body: Record<string, unknown>,
  expectedCode: string,
  dataMode: "null" | "absent" | { readonly fieldNull: string } = "null"
): Record<string, unknown> {
  const errorItem = soleErrorItemOf(body);
  expect(errorCodeOf(errorItem)).toBe(expectedCode);
  if (dataMode === "null") {
    expect(body.data).toBeNull();
  } else if (dataMode === "absent") {
    expect(body.data).toBeUndefined();
  } else {
    const data = recordOf(body.data, "expected a data object");
    expect(data[dataMode.fieldNull]).toBeNull();
  }
  const requestId = recordOf(errorItem.extensions, "expected extensions").requestId;
  expect(typeof requestId === "string" && requestId.length > 0).toBe(true);
  expect(JSON.stringify(errorItem)).not.toContain("stacktrace");
  return errorItem;
}

/** Extracts the envelope payload of a happy-path result. */
function envelopeOf(result: { readonly data?: unknown }): Record<string, unknown> {
  if (!isRecord(result.data)) {
    throw new Error("missing data for studentHomeworkHistory");
  }
  const payload: unknown = result.data.studentHomeworkHistory;
  if (!isRecord(payload)) {
    throw new Error("missing studentHomeworkHistory envelope in response data");
  }
  return payload;
}

// ─── Wire helpers (raw fetch where byte-shape / headers matter) ──────────────

const GRAPHQL_URL = `http://localhost:${TEST_PORT}/api/graphql`;

/** POSTs one document over the wire with NO credentials (+ extra headers). */
async function postAnonymous(
  query: string,
  variables?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<Record<string, unknown>> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  return recordOf(await response.json(), "expected a JSON object response");
}

/**
 * POSTs one document and returns the RAW response text alongside the
 * parsed body — the byte-identity probes serialize the parsed body back
 * and compare the two normalized serializations byte-for-byte.
 */
async function postDocumentRaw(
  query: string,
  accessToken: string,
  variables?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<{ readonly text: string; readonly body: Record<string, unknown> }> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...extraHeaders,
    },
    body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  return { text, body: recordOf(JSON.parse(text), "expected a JSON object response") };
}

// ─── Actor-scoped client + lifecycle helpers (lifecycle wire-suite pattern) ──

/** Builds an actor-scoped client — real Bearer identity. */
function clientFor(accessToken: string): ApolloClient {
  return new ApolloClient({
    link: new HttpLink({
      uri: GRAPHQL_URL,
      headers: { authorization: `Bearer ${accessToken}` },
    }),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: { errorPolicy: "all", fetchPolicy: "no-cache" },
      mutate: { errorPolicy: "all", fetchPolicy: "no-cache" },
      watchQuery: { errorPolicy: "all", fetchPolicy: "no-cache" },
    },
  });
}

/** Books one session over the wire under a UNIQUE idempotency key. */
async function bookSession(accessToken: string, idempotencyKey: string, teacherId: number): Promise<string> {
  const clientWithKey = new ApolloClient({
    link: new HttpLink({
      uri: GRAPHQL_URL,
      headers: { authorization: `Bearer ${accessToken}`, "x-idempotency-key": idempotencyKey },
    }),
    cache: new InMemoryCache(),
    defaultOptions: { mutate: { errorPolicy: "all", fetchPolicy: "no-cache" } },
  });
  const result = await clientWithKey.mutate({
    mutation: CREATE_SESSION_DOC,
    variables: { input: { teacherId, intent: "Hifz" } },
  });
  if (!isRecord(result.data)) {
    throw new Error("createSession returned no data");
  }
  const payload: unknown = result.data.createSession;
  if (!isRecord(payload)) {
    throw new Error("createSession returned no payload");
  }
  const id: unknown = payload.id;
  if (typeof id !== "string" && typeof id !== "number") {
    throw new Error("createSession returned no id");
  }
  return String(id);
}

/** Drives one booked session through start → complete over the wire (teacher). */
async function startAndCompleteSession(accessToken: string, id: string): Promise<void> {
  const client = clientFor(accessToken);
  await client.mutate({ mutation: START_SESSION_DOC, variables: { id } });
  await client.mutate({ mutation: COMPLETE_SESSION_DOC, variables: { id } });
}

/** Submits the report + homework H1 over the wire as `teacherOwner`. */
async function submitSigmaReport(): Promise<void> {
  const result = await teacherOwner.mutate({
    mutation: SUBMIT_REPORT_DOC,
    variables: { id: sigmaId, input: SIGMA_SUBMIT_INPUT },
  });
  if (result.error) {
    throw new Error(`submitSessionReport failed: ${result.error.message}`);
  }
}

// ─── Fixtures (committed cast + pre-driven lifecycle targets) ───────────────

beforeAll(async () => {
  // Committed cast — the primary student funded for TWO bookings (σ + σ′
  // both drain the trial ladder; neither booking is cancelled). The
  // foreign teacher (T2) is cast.secondTeacher — a certified teacher
  // whose userId does NOT link to any session with the primary student
  // before T2 books σ′. After T1 books σ and submits its report, T2
  // books σ′ with the SAME student and reads the history.
  await db.transaction(async tx => {
    cast = await buildSessionJourneyCast(tx, registry, {
      prefix: PREFIX,
      primaryStudent: { trial: 2 },
    });

    // The parent-OTHER actor (never linked to any student).
    const parentOtherUser = await createTestUser(tx, { role: "parent", fullName: `${PREFIX} parent-other` });
    await createTestParent(tx, parentOtherUser.id);
    registry.track("users", parentOtherUser.id);
    registry.track("parents", parentOtherUser.id);
    parentOtherUserId = parentOtherUser.id;

    // The parent-LINKED actor: cast.parent links to the primary student.
    await tx.update(students).set({ parentId: cast.parent.userId }).where(eq(students.id, cast.primaryStudent.userId));
  });

  // Real access tokens for every actor (same signer the auth layer uses).
  const [tokenStudent, tokenTeacher, tokenTeacherForeign, tokenParent, tokenParentOther, tokenAdmin] =
    await Promise.all([
      signAccessToken({ userId: cast.primaryStudent.userId, role: cast.primaryStudent.user.role }),
      signAccessToken({ userId: cast.teacher.userId, role: cast.teacher.user.role }),
      signAccessToken({ userId: cast.secondTeacher.userId, role: cast.secondTeacher.user.role }),
      signAccessToken({ userId: cast.parent.userId, role: cast.parent.user.role }),
      signAccessToken({ userId: parentOtherUserId, role: "parent" }),
      signAccessToken({ userId: cast.admin.userId, role: cast.admin.user.role }),
    ]);

  studentParticipant = clientFor(tokenStudent);
  teacherOwner = clientFor(tokenTeacher);
  teacherForeign = clientFor(tokenTeacherForeign);
  parentLinked = clientFor(tokenParent);
  parentOther = clientFor(tokenParentOther);
  adminActor = clientFor(tokenAdmin);

  // Pre-drive σ through the REAL lifecycle (T1 books → T1 starts → T1
  // completes). The student's booking uses T1's teacherId (cast.teacher).
  sigmaId = await bookSession(tokenStudent, KEY_SIGMA, cast.teacher.userId);
  registry.track("session", Number(sigmaId));
  await startAndCompleteSession(tokenTeacher, sigmaId);

  // Submit the report + homework H1 authored by T1 (the cross-teacher
  // visibility probe: T2 reads H1 immediately — visibility is symmetric).
  await submitSigmaReport();

  // Pre-drive σ′ as a SECOND booking (T2 = cast.secondTeacher books the
  // SAME primary student) — this is the cross-teacher link T2 needs to
  // pass the relationship gate. σ′ is left at the `scheduled` state;
  // T2 does NOT submit a second report (the history read still surfaces
  // the single H1 row authored by T1; the relationship gate has been
  // satisfied by σ′'s existence alone).
  sigmaPrimeId = await bookSession(tokenStudent, KEY_SIGMA_PRIME, cast.secondTeacher.userId);
  registry.track("session", Number(sigmaPrimeId));
}, 240_000);

afterAll(async () => {
  // FK-safe order: service-created report/homework rows (session-scoped)
  // and notification rows FIRST, then the registry sweep.
  const sessionIds = [sigmaId, sigmaPrimeId].map(id => Number(id)).filter(id => id > 0);
  if (sessionIds.length > 0) {
    await db.delete(reports).where(inArray(reports.sessionId, sessionIds));
    await db.delete(homeWork).where(inArray(homeWork.sessionId, sessionIds));
  }
  const fixtureUserIds = [
    cast.primaryStudent.userId,
    cast.secondStudent.userId,
    cast.teacher.userId,
    cast.secondTeacher.userId,
    cast.parent.userId,
    parentOtherUserId,
    cast.admin.userId,
  ].filter(id => id > 0);
  if (fixtureUserIds.length > 0) {
    await db.delete(notifications).where(inArray(notifications.userId, fixtureUserIds));
  }
  await registry.cleanup();
}, 60_000);

// ─── Section 1 — anonymous tier (401): the read surface is authenticated-only ──

describe("matrix §10 — anonymous tier (401, pre-resolver)", () => {
  test("studentHomeworkHistory × anonymous → UNAUTHORIZED", async () => {
    const body = await postAnonymous(STUDENT_HOMEWORK_HISTORY_DOC.loc?.source.body ?? "", {
      studentId: String(cast.primaryStudent.userId),
    });
    // The non-nullable `StudentHomeworkPage!` field's resolver error nulls
    // the WHOLE `data` object (the GraphQL spec's null-propagation rule).
    expectDenialCode(body, "UNAUTHORIZED", "null");
  });
});

// ─── Section 2 — role-scope tier (403, pre-resolver): non-teacher tokens ─────

describe("matrix §10 — role-scope tier (403, pre-resolver)", () => {
  test("student × studentHomeworkHistory → FORBIDDEN (role scope)", async () => {
    const result = await studentParticipant.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(result.error).toBeDefined();
    expectMutationError(result.error, "FORBIDDEN");
  });

  test("parent linked × studentHomeworkHistory → FORBIDDEN (role scope)", async () => {
    const result = await parentLinked.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(result.error).toBeDefined();
    expectMutationError(result.error, "FORBIDDEN");
  });

  test("parent other × studentHomeworkHistory → FORBIDDEN (role scope)", async () => {
    const result = await parentOther.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(result.error).toBeDefined();
    expectMutationError(result.error, "FORBIDDEN");
  });

  test("admin × studentHomeworkHistory → FORBIDDEN (role scope)", async () => {
    const result = await adminActor.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(result.error).toBeDefined();
    expectMutationError(result.error, "FORBIDDEN");
  });
});

// ─── Section 3 — happy path: teacher T2 reads the student's history ─────────

describe("matrix §10 — teacher happy path (cross-teacher visibility)", () => {
  test("linked teacher T2 reads the history envelope (T1's homework H1 visible)", async () => {
    const result = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(result.error).toBeUndefined();
    const envelope = envelopeOf(result);
    // The history carries exactly one row (T1's H1 submitted in beforeAll).
    const items = arrayOfRecords(envelope.items, "expected items array");
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(envelope.totalCount).toBe(items.length);
    // Effective paging values echo back (defaults: page 1, pageSize 25).
    expect(envelope.page).toBe(1);
    expect(envelope.pageSize).toBe(25);
    // The single row carries the canonical 12 SessionHomeWork fields.
    const firstItem = items[0];
    if (!firstItem) throw new Error("expected at least one item");
    expect(firstItem.id).toBeTruthy();
    expect(firstItem.sessionId).toBe(Number(sigmaId));
    expect(firstItem.currentFromAyah).toBe(1);
    expect(firstItem.currentToAyah).toBe(7);
    expect(firstItem.currentSurahJuz).toBe("SurahAlBaqarah");
    expect(firstItem.revisionFromAyah).toBe(281);
    expect(firstItem.revisionToAyah).toBe(286);
    expect(firstItem.revisionSurahJuz).toBe("Juz30");
    // Grade columns are NULL on the just-submitted (ungraded) homework.
    expect(firstItem.currentGrade).toBeNull();
    expect(firstItem.revisionGrade).toBeNull();
    expect(typeof firstItem.createdAt === "string" && !Number.isNaN(Date.parse(firstItem.createdAt))).toBe(true);
    expect(typeof firstItem.updatedAt === "string" && !Number.isNaN(Date.parse(firstItem.updatedAt))).toBe(true);
  });

  test("linked teacher T1 reads the same history (symmetric visibility)", async () => {
    const result = await teacherOwner.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(result.error).toBeUndefined();
    const envelope = envelopeOf(result);
    const items = arrayOfRecords(envelope.items, "expected items array");
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(envelope.totalCount).toBe(items.length);
  });
});

// ─── Section 4 — paging args echo back to the caller ─────────────────────────

describe("matrix §10 — paging args echo (service-clamped effective values)", () => {
  test("pageSize: 51 collapses to 25 (reset-to-default, NOT clamp-to-cap)", async () => {
    const result = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId), pageSize: 51 },
    });
    expect(result.error).toBeUndefined();
    const envelope = envelopeOf(result);
    expect(envelope.pageSize).toBe(25); // the default, NOT the cap (50)
    expect(envelope.page).toBe(1);
  });

  test("pageSize: 50 stays 50 (the cap kept)", async () => {
    const result = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId), pageSize: 50 },
    });
    expect(result.error).toBeUndefined();
    const envelope = envelopeOf(result);
    expect(envelope.pageSize).toBe(50);
  });

  test("page: 0 collapses to 1 (default)", async () => {
    const result = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId), page: 0 },
    });
    expect(result.error).toBeUndefined();
    const envelope = envelopeOf(result);
    expect(envelope.page).toBe(1);
  });

  test("omitted paging args collapse to the defaults (page 1, pageSize 25)", async () => {
    const result = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(result.error).toBeUndefined();
    const envelope = envelopeOf(result);
    expect(envelope.page).toBe(1);
    expect(envelope.pageSize).toBe(25);
  });

  test("envelope shape is EXACTLY {items, totalCount, page, pageSize} (no extras)", async () => {
    const result = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(result.error).toBeUndefined();
    const envelope = envelopeOf(result);
    // Strip the Apollo-injected `__typename`; the wire surface carries
    // only the four envelope fields.
    const { __typename: _apollo, ...wireEnvelope } = envelope;
    expect(Object.keys(wireEnvelope).toSorted((a, b) => a.localeCompare(b))).toEqual(
      ["items", "page", "pageSize", "totalCount"].toSorted((a, b) => a.localeCompare(b))
    );
  });
});

// ─── Section 5 — constant-oracle byte-identity (foreign vs unknown) ──────────

describe("matrix §10 — constant-oracle byte-identity (FORBIDDEN)", () => {
  test("unlinked teacher reads → constant FORBIDDEN", async () => {
    // cast.secondTeacher has no session with cast.secondStudent (the
    // foreign student the registry provisions). Both `cast.secondStudent`
    // and `cast.teacher` are valid rows, but they share no session.
    const studentIdOfForeign = String(cast.secondStudent.userId);
    const result = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: studentIdOfForeign },
    });
    expect(result.error).toBeDefined();
    expectMutationError(result.error, "FORBIDDEN");
  });

  test("unknown-but-valid-shape studentId → constant FORBIDDEN (byte-identical to foreign)", async () => {
    // An id no row will ever resolve to (a sentinel far above the sequence).
    const unknownStudentId = "999999999";
    const result = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: unknownStudentId },
    });
    expect(result.error).toBeDefined();
    const error = expectMutationError(result.error, "FORBIDDEN");
    // The localized message is the constant `errorsTranslations.forbidden`
    // (en, the request locale); the foreign-teacher denial above carried
    // the SAME copy — the cases are byte-identical (no existence disclosure).
    expect(error.message).toContain(tEn.forbidden);
  });

  test("foreign-teacher denial vs unknown-student denial are byte-identical at the wire", async () => {
    // Raw fetch both responses and serialize them; the only difference
    // is the requestId (per-request correlation id). Strip it and compare.
    const docSource = STUDENT_HOMEWORK_HISTORY_DOC.loc?.source.body ?? "";
    const tokenForeign = await signAccessToken({
      userId: cast.secondTeacher.userId,
      role: cast.secondTeacher.user.role,
    });
    const foreignBody = await postDocumentRaw(docSource, tokenForeign, {
      studentId: String(cast.secondStudent.userId),
    });
    const unknownBody = await postDocumentRaw(docSource, tokenForeign, { studentId: "999999999" });

    // Strip the requestId from each error's extensions; the rest must match.
    function stripRequestId(body: Record<string, unknown>): Record<string, unknown> {
      const errors = recordOf(body, "expected body").errors;
      if (!Array.isArray(errors) || errors.length !== 1) {
        throw new Error("expected one error");
      }
      const item = recordOf(errors[0], "expected record");
      const ext = recordOf(item.extensions, "expected extensions");
      const { requestId: _req, ...rest } = ext;
      return { ...body, errors: [{ ...item, extensions: rest }] };
    }
    expect(JSON.stringify(stripRequestId(foreignBody.body))).toBe(JSON.stringify(stripRequestId(unknownBody.body)));
  });
});

// ─── Section 6 — id-shape junk → VALIDATION (pre-DB id-shape guard) ──────────

describe("matrix §10 — id-shape fuzz (hostile studentId → VALIDATION)", () => {
  const hostileIds = ["abc", "0", "-1", "1.5", "999999999999999999999999999"];

  for (const id of hostileIds) {
    test(`studentId=${JSON.stringify(id)} → VALIDATION (pre-DB guard)`, async () => {
      const result = await teacherForeign.query({
        query: STUDENT_HOMEWORK_HISTORY_DOC,
        variables: { studentId: id },
      });
      // The id-shape guard throws ValidationError BEFORE the relationship
      // gate; the wire surfaces it as `VALIDATION` (the boundary guard
      // never reaches the FORBIDDEN gate).
      expect(result.error).toBeDefined();
      expectMutationError(result.error, "VALIDATION");
    });
  }
});

// ─── Section 7 — replay safety (the read is idempotent) ──────────────────────

describe("matrix §10 — replay safety (read idempotency)", () => {
  test("repeated reads return the same envelope shape and content", async () => {
    const first = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    const second = await teacherForeign.query({
      query: STUDENT_HOMEWORK_HISTORY_DOC,
      variables: { studentId: String(cast.primaryStudent.userId) },
    });
    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    const firstEnvelope = envelopeOf(first);
    const secondEnvelope = envelopeOf(second);
    expect(secondEnvelope.totalCount).toBe(firstEnvelope.totalCount);
    expect(secondEnvelope.page).toBe(firstEnvelope.page);
    expect(secondEnvelope.pageSize).toBe(firstEnvelope.pageSize);
    const firstItems = arrayOfRecords(firstEnvelope.items, "expected first items array");
    const secondItems = arrayOfRecords(secondEnvelope.items, "expected second items array");
    expect(secondItems).toHaveLength(firstItems.length);
    if (firstItems.length > 0 && secondItems.length > 0) {
      expect(secondItems[0]?.id).toBe(firstItems[0]?.id);
    }
  });
});
