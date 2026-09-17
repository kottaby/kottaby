/**
 * Shared scaffolding for the parent read-only monitoring portal component
 * suites (`test/ui/components/parent/monitoring/**`). Centralizes the
 * Apollo `MockedProvider` + traffic-recording link composition, the five
 * portal-document mock builders, the closed wire-row fixture factories,
 * and the read-only-posture network assertion every suite runs against
 * the recorded traffic.
 *
 * Every suite mounts a RECORDING `ApolloLink` in front of the `MockLink` so
 * the wire-traffic proofs (zero mutations, per-student re-keying, the
 * `?session=` deep-link forwarding) read real link traffic instead of
 * spied-on mock functions.
 *
 * All fixture builders return CLOSED shapes typed against the codegen-emitted
 * `*Query_*_items` extracted-field types — never `Partial<...>` stand-ins.
 */

import { expect } from "bun:test";
import { ApolloLink } from "@apollo/client";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import {
  type MyLinkedChildrenQuery_myLinkedChildren,
  type ParentChildHomeworkQuery_parentChildHomework_items,
  type ParentChildHomeworkQuery_parentChildHomework_items_jadid,
  type ParentChildProgressQuery_parentChildProgress,
  type ParentChildReportsQuery_parentChildReports_items,
  type ParentChildSessionsQuery_parentChildSessions_items,
  SessionStatus,
  SurahJuzRef,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  myLinkedChildrenQueryDocument,
  parentChildHomeworkQueryDocument,
  parentChildProgressQueryDocument,
  parentChildReportsQueryDocument,
  parentChildSessionsQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ---------------------------------------------------------------------------
// Network traffic recorder
// ---------------------------------------------------------------------------

/**
 * Captured network traffic — every Apollo operation that crossed the link
 * chain. The recorded `operationNames` + `operations` + `capturedVariables`
 * lists let the suites assert read-only posture (zero mutations),
 * per-student re-keying, and the exact variable surface BOLA-tightness.
 */
export interface NetworkTraffic {
  /** Operation names in call order (e.g. `MyLinkedChildren`). */
  readonly operationNames: string[];
  /** Operation definitions the wire saw — used by the mutation guard. */
  readonly operations: Array<{ readonly name: string; readonly operation: string }>;
  /** Captured variables per operation, in call order. */
  readonly capturedVariables: Array<Record<string, unknown>>;
}

export function createNetworkTraffic(): NetworkTraffic {
  return { operationNames: [], operations: [], capturedVariables: [] };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

/**
 * Renders `ui` under a RECORDING `ApolloLink` chained in front of a
 * `MockLink` carrying the supplied mocks. The recording link captures every
 * operation's name + variables before forwarding to the mock link so the
 * wire-traffic proofs read real link traffic.
 */
export function renderPortal(
  ui: ReactElement,
  traffic: NetworkTraffic,
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale
): RenderResult {
  const mockLink = new MockLink([...mocks]);
  const recordingLink = new ApolloLink((operation, forward) => {
    traffic.operationNames.push(operation.operationName ?? "");
    traffic.operations.push({
      name: operation.operationName ?? "",
      operation:
        operation.query?.definitions?.[0]?.kind === "OperationDefinition"
          ? ((operation.query.definitions[0] as { operation?: string }).operation ?? "query")
          : "query",
    });
    traffic.capturedVariables.push({ ...operation.variables });
    return forward(operation);
  });
  return renderWithWrapper(<MockedProvider link={ApolloLink.from([recordingLink, mockLink])}>{ui}</MockedProvider>, {
    locale,
  });
}

// ---------------------------------------------------------------------------
// Read-only posture guard (zero mutations on the wire)
// ---------------------------------------------------------------------------

/**
 * Asserts the recorded wire traffic carries ZERO mutation operations. The
 * parent monitoring portal is a pure read surface — the read-only posture
 * is structurally enforced by the absence of mutation documents on the
 * wire, not by a runtime gate.
 */
export function expectZeroMutations(traffic: NetworkTraffic): void {
  const mutations = traffic.operations.filter(op => op.operation === "mutation");
  expect(mutations).toEqual([]);
}

// ---------------------------------------------------------------------------
// Fixture row factories — CLOSED shapes typed against codegen types
// ---------------------------------------------------------------------------

/** Canonical ISO instants — deterministic, never asserted as locale copy. */
export const CREATED_AT_ISO = "2026-09-01T08:00:00.000Z";
export const SESSION_STARTED_AT_ISO = "2026-09-05T09:00:00.000Z";

/** Two deterministic child identities — the parent's linked children. */
export const CHILD_A_ID = "401";
export const CHILD_A_NAME = "Yousef Adel";
export const CHILD_B_ID = "402";
export const CHILD_B_NAME = "Mariam Sami";

/** Linked-child fixture factory — the closed selection shape. */
export function linkedChildFixture(
  overrides: Partial<MyLinkedChildrenQuery_myLinkedChildren> = {}
): MyLinkedChildrenQuery_myLinkedChildren {
  return {
    id: CHILD_A_ID,
    fullName: CHILD_A_NAME,
    createdAt: CREATED_AT_ISO,
    ...overrides,
  };
}

/**
 * Attendance row fixture — the closed `parentChildSessions.items` shape.
 * The `status` argument rotates the lifecycle enum so each chip arm is
 * reachable; `startedAt` defaults to null (a scheduled row carries no
 * start time).
 */
export function attendanceRowFixture(
  overrides: Partial<ParentChildSessionsQuery_parentChildSessions_items> = {}
): ParentChildSessionsQuery_parentChildSessions_items {
  return {
    id: "s-501",
    status: SessionStatus.Scheduled,
    startedAt: null,
    endedAt: null,
    createdAt: CREATED_AT_ISO,
    ...overrides,
  };
}

/**
 * Report row fixture — the closed `parentChildReports.items` shape. The
 * `studentRatingByTeacher` defaults to `null` (the not-rated-yet arm);
 * callers pass a number to pin the rated chip.
 */
export function reportRowFixture(
  overrides: Partial<ParentChildReportsQuery_parentChildReports_items> = {}
): ParentChildReportsQuery_parentChildReports_items {
  return {
    id: "r-501",
    sessionId: 501,
    sessionStatus: SessionStatus.Completed,
    sessionStartedAt: SESSION_STARTED_AT_ISO,
    teacherNotes: null,
    studentRatingByTeacher: null,
    createdAt: CREATED_AT_ISO,
    ...overrides,
  };
}

/**
 * Homework track block fixture — the closed `jadid` / `madi` shape (both
 * slots share the codegen-emitted `_jadid` extracted type). Defaults to a
 * fully-populated track; pass `{ surahJuz: null }` for the wholly-null
 * block, or `{ surahJuz: SurahJuzRef.SurahAlFatihah, grade: null }` for
 * the partial-null defensive branch.
 */
export function homeworkTrackFixture(
  overrides: Partial<ParentChildHomeworkQuery_parentChildHomework_items_jadid> = {}
): ParentChildHomeworkQuery_parentChildHomework_items_jadid {
  return {
    surahJuz: SurahJuzRef.SurahAlFatihah,
    fromAyah: 1,
    toAyah: 7,
    grade: 8,
    ...overrides,
  };
}

/**
 * Homework row fixture — the closed `parentChildHomework.items` shape.
 * Defaults to a row with both Jadid and Madi tracks populated; pass
 * `{ jadid: null }` / `{ madi: null }` for the wholly-null track arm.
 */
export function homeworkRowFixture(
  overrides: Partial<ParentChildHomeworkQuery_parentChildHomework_items> = {}
): ParentChildHomeworkQuery_parentChildHomework_items {
  return {
    id: "h-501",
    sessionId: 501,
    createdAt: CREATED_AT_ISO,
    jadid: homeworkTrackFixture(),
    madi: homeworkTrackFixture({ surahJuz: SurahJuzRef.Juz1, fromAyah: 1, toAyah: 20, grade: 9 }),
    ...overrides,
  };
}

/**
 * Progress payload fixture — the closed `parentChildProgress` shape.
 * Defaults to a payload with a non-zero row count and both position slots
 * populated; pass `{ latestJadidPosition: null }` for the null-slot arm,
 * or `{ progressRowCount: 0, latestJadidPosition: null, latestMadiPosition: null }`
 * for the empty-state arm.
 */
export function progressFixture(
  overrides: Partial<ParentChildProgressQuery_parentChildProgress> = {}
): ParentChildProgressQuery_parentChildProgress {
  return {
    progressRowCount: 12,
    child: linkedChildFixture(),
    latestJadidPosition: { surahJuz: SurahJuzRef.SurahAlFatihah, fromAyah: 1, toAyah: 7 },
    latestMadiPosition: { surahJuz: SurahJuzRef.Juz1, fromAyah: 1, toAyah: 20 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Apollo mock builders — one per portal document
// ---------------------------------------------------------------------------

/** The five operation names the portal may ever issue (read-only surface). */
export const LINKED_OPERATION_NAME = "MyLinkedChildren";
export const PROGRESS_OPERATION_NAME = "ParentChildProgress";
export const SESSIONS_OPERATION_NAME = "ParentChildSessions";
export const REPORTS_OPERATION_NAME = "ParentChildReports";
export const HOMEWORK_OPERATION_NAME = "ParentChildHomework";

/**
 * The exact variables every per-student tab query carries. The `page` /
 * `pageSize` are `undefined` on the wire (the service clamps them server-
 * side) — `studentId` is the ONLY caller-supplied identity.
 */
export function studentVariables(studentId: number): Record<string, unknown> {
  return { studentId, page: undefined, pageSize: undefined };
}

/** `MyLinkedChildren` mock — zero-arg query. */
export function linkedListMock(
  rows: ReadonlyArray<MyLinkedChildrenQuery_myLinkedChildren> = []
): MockLink.MockedResponse {
  return {
    request: { query: myLinkedChildrenQueryDocument, variables: {} },
    result: { data: { myLinkedChildren: [...rows] } },
  };
}

/** Permanently in-flight `MyLinkedChildren` mock — pins the skeleton branch. */
export function linkedInFlightMock(): MockLink.MockedResponse {
  return {
    request: { query: myLinkedChildrenQueryDocument, variables: {} },
    delay: Infinity,
  };
}

/** `ParentChildProgress` mock — `{ studentId }` variables only. */
export function progressMock(
  studentId: number,
  payload: ParentChildProgressQuery_parentChildProgress
): MockLink.MockedResponse {
  return {
    request: { query: parentChildProgressQueryDocument, variables: { studentId } },
    result: { data: { parentChildProgress: payload } },
  };
}

/** Permanently in-flight `ParentChildProgress` mock. */
export function progressInFlightMock(studentId: number): MockLink.MockedResponse {
  return {
    request: { query: parentChildProgressQueryDocument, variables: { studentId } },
    delay: Infinity,
  };
}

/** `ParentChildSessions` mock — attendance tab. */
export function sessionsMock(
  studentId: number,
  rows: ReadonlyArray<ParentChildSessionsQuery_parentChildSessions_items>
): MockLink.MockedResponse {
  return {
    request: { query: parentChildSessionsQueryDocument, variables: studentVariables(studentId) },
    result: {
      data: {
        parentChildSessions: {
          items: [...rows],
          totalCount: rows.length,
          page: 1,
          pageSize: rows.length,
        },
      },
    },
  };
}

/** Permanently in-flight `ParentChildSessions` mock. */
export function sessionsInFlightMock(studentId: number): MockLink.MockedResponse {
  return {
    request: { query: parentChildSessionsQueryDocument, variables: studentVariables(studentId) },
    delay: Infinity,
  };
}

/** `ParentChildReports` mock — reports tab + evaluations tab (shared query). */
export function reportsMock(
  studentId: number,
  rows: ReadonlyArray<ParentChildReportsQuery_parentChildReports_items>
): MockLink.MockedResponse {
  return {
    request: { query: parentChildReportsQueryDocument, variables: studentVariables(studentId) },
    result: {
      data: {
        parentChildReports: {
          items: [...rows],
          totalCount: rows.length,
          page: 1,
          pageSize: rows.length,
        },
      },
    },
  };
}

/** Permanently in-flight `ParentChildReports` mock. */
export function reportsInFlightMock(studentId: number): MockLink.MockedResponse {
  return {
    request: { query: parentChildReportsQueryDocument, variables: studentVariables(studentId) },
    delay: Infinity,
  };
}

/** `ParentChildHomework` mock — homework tab. */
export function homeworkMock(
  studentId: number,
  rows: ReadonlyArray<ParentChildHomeworkQuery_parentChildHomework_items>
): MockLink.MockedResponse {
  return {
    request: { query: parentChildHomeworkQueryDocument, variables: studentVariables(studentId) },
    result: {
      data: {
        parentChildHomework: {
          items: [...rows],
          totalCount: rows.length,
          page: 1,
          pageSize: rows.length,
        },
      },
    },
  };
}

/** Permanently in-flight `ParentChildHomework` mock. */
export function homeworkInFlightMock(studentId: number): MockLink.MockedResponse {
  return {
    request: { query: parentChildHomeworkQueryDocument, variables: studentVariables(studentId) },
    delay: Infinity,
  };
}

/**
 * Failure mock authored as a raw `result.errors[]` entry — the transport
 * boundary shape Apollo wraps into a `CombinedGraphQLErrors`. `extractErrorCode`
 * traverses the same path the production error-link uses. The `message`
 * carries the code so a raw-message leak would surface in a sentinel
 * assertion.
 */
export function failureMock(
  query: MockLink.MockedResponse["request"]["query"],
  variables: Record<string, unknown>,
  errorCode: string
): MockLink.MockedResponse {
  return {
    request: { query, variables },
    result: {
      errors: [
        {
          message: `${errorCode} (masked transport surface)`,
          extensions: { code: errorCode },
        },
      ],
    },
  };
}

/** `MyLinkedChildren` failure mock (zero-arg variables). */
export function linkedFailureMock(errorCode: string): MockLink.MockedResponse {
  return failureMock(myLinkedChildrenQueryDocument, {}, errorCode);
}

/** `ParentChildProgress` failure mock (`{ studentId }` variables). */
export function progressFailureMock(studentId: number, errorCode: string): MockLink.MockedResponse {
  return failureMock(parentChildProgressQueryDocument, { studentId }, errorCode);
}

/** `ParentChildSessions` failure mock. */
export function sessionsFailureMock(studentId: number, errorCode: string): MockLink.MockedResponse {
  return failureMock(parentChildSessionsQueryDocument, studentVariables(studentId), errorCode);
}

/** `ParentChildReports` failure mock. */
export function reportsFailureMock(studentId: number, errorCode: string): MockLink.MockedResponse {
  return failureMock(parentChildReportsQueryDocument, studentVariables(studentId), errorCode);
}

/** `ParentChildHomework` failure mock. */
export function homeworkFailureMock(studentId: number, errorCode: string): MockLink.MockedResponse {
  return failureMock(parentChildHomeworkQueryDocument, studentVariables(studentId), errorCode);
}

/** Settle window for any (forbidden) network activity to surface before asserting zero. */
export const NETWORK_SETTLE_MS = 60;

/** Lets any (forbidden) in-flight activity surface before asserting zero. */
export async function settleNetwork(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, NETWORK_SETTLE_MS));
}
