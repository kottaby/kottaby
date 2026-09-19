/**
 * Cross-user verification script for issue #195.
 *
 * Spawns the test server, provisions a real cast (student S + teachers T1, T2,
 * Ft + parent P + admin A) through the journey fixture, drives the REAL
 * session lifecycle over the wire (book → start → complete), submits a
 * session report with homework H1 as T1, then exercises the
 * `studentHomeworkHistory` query as every actor to confirm:
 *
 *   1. T1 (linked) → envelope happy path with H1 visible
 *   2. T2 (linked) → cross-teacher visibility (sees H1 authored by T1)
 *   3. Ft (foreign, no session with S) → constant FORBIDDEN
 *   4. Student S → FORBIDDEN (role scope)
 *   5. Parent P → FORBIDDEN (role scope)
 *   6. Admin A → FORBIDDEN (role scope)
 *   7. Anonymous → UNAUTHORIZED
 *   8. Hostile id shape ("abc") → VALIDATION
 *
 * Captures every response, renders an HTML summary, and saves it to
 * scratch/screenshots/cross-user-report.html for VLM analysis.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/backend/db";
import { students } from "@/backend/db/schema/students/students";
import { createTestParent, createTestUser } from "@/backend/db/test/entity-setup";
import { signAccessToken } from "@/backend/lib/auth/jwt";
import { setupTestServerLifecycle, TEST_PORT } from "@/test/helpers";
import {
  buildSessionJourneyCast,
  createSessionFixtureRegistry,
  journeyPrefix,
  type SessionJourneyCast,
} from "@/test/workflows/helpers";

setupTestServerLifecycle();

const PREFIX = journeyPrefix("crossverify");
const registry = createSessionFixtureRegistry();

let cast: SessionJourneyCast;
let sigmaId = "";
let sigmaPrimeId = "";

const GRAPHQL_URL = `http://localhost:${TEST_PORT}/api/graphql`;

interface WireCall {
  readonly actor: string;
  readonly scenario: string;
  readonly query: string;
  readonly variables: Record<string, unknown>;
  readonly token: string | null;
  readonly expected: {
    readonly code: string;
    readonly dataMode: "happy" | "forbidden" | "unauthorized" | "validation";
  };
}

const wireCalls: Array<WireCall & { readonly response: Record<string, unknown> }> = [];

async function graphql(
  query: string,
  variables: Record<string, unknown>,
  accessToken: string | null
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accessToken !== null) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

const STUDENT_HOMEWORK_HISTORY_DOC = `
  query CrossVerifyStudentHomeworkHistory($studentId: ID!, $page: Int, $pageSize: Int) {
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

const CREATE_SESSION_DOC = `
  mutation CrossVerifyBookSession($input: CreateSessionInput!) {
    createSession(input: $input) { id }
  }
`;

const START_SESSION_DOC = `
  mutation CrossVerifyStartSession($id: ID!) { startSession(id: $id) { id } }
`;

const COMPLETE_SESSION_DOC = `
  mutation CrossVerifyCompleteSession($id: ID!) { completeSession(id: $id) { id } }
`;

const SUBMIT_REPORT_DOC = `
  mutation CrossVerifySubmitReport($id: ID!, $input: SubmitSessionReportInput!) {
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

const SIGMA_SUBMIT_INPUT = {
  teacherNotes: "Cross-verify report — T1 submits H1 with Jadid + Madi.",
  studentRatingByTeacher: 5,
  homework: {
    jadid: { fromAyah: 1, toAyah: 7, surahJuz: "SurahAlBaqarah" },
    madi: { fromAyah: 281, toAyah: 286, surahJuz: "Juz30" },
  },
  previousGrades: null,
};

beforeAll(async () => {
  await db.transaction(async tx => {
    cast = await buildSessionJourneyCast(tx, registry, { prefix: PREFIX, primaryStudent: { trial: 2 } });
    // Provision an extra unlinked parent for completeness (matches the
    // session-report.wire.test.ts recipe). Tracked for cleanup.
    const parentOtherUser = await createTestUser(tx, { role: "parent", fullName: `${PREFIX}-parent-other` });
    await createTestParent(tx, parentOtherUser.id);
    registry.track("users", parentOtherUser.id);
    registry.track("parents", parentOtherUser.id);
    await tx.update(students).set({ parentId: cast.parent.userId }).where(eq(students.id, cast.primaryStudent.userId));
  });

  const tokenStudent = await signAccessToken({
    userId: cast.primaryStudent.userId,
    role: cast.primaryStudent.user.role,
  });
  const tokenTeacher = await signAccessToken({ userId: cast.teacher.userId, role: cast.teacher.user.role });

  sigmaId = await bookSession(tokenStudent, `${PREFIX}-sigma`, cast.teacher.userId);
  registry.track("session", Number(sigmaId));
  await startAndCompleteSession(tokenTeacher, sigmaId);
  await submitReport(tokenTeacher);

  sigmaPrimeId = await bookSession(tokenStudent, `${PREFIX}-sigma-prime`, cast.secondTeacher.userId);
  registry.track("session", Number(sigmaPrimeId));
}, 240_000);

afterAll(async () => {
  // Render the HTML report once all calls have landed.
  renderHtmlReport();
  await registry.cleanup();
}, 60_000);

async function bookSession(accessToken: string, idempotencyKey: string, teacherId: number): Promise<string> {
  // createSession requires the `x-idempotency-key` header (the wire suite
  // recipe). Pass it via the graphql helper's extra-headers argument.
  const result = await graphqlWithHeaders(CREATE_SESSION_DOC, { input: { teacherId, intent: "Hifz" } }, accessToken, {
    "x-idempotency-key": idempotencyKey,
  });
  const data = result.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") {
    throw new Error(`createSession failed: ${JSON.stringify(result)}`);
  }
  const payload = data.createSession as Record<string, unknown> | undefined;
  if (!payload || typeof payload.id !== "string") {
    throw new Error(`createSession returned no id: ${JSON.stringify(result)}`);
  }
  return payload.id;
}

async function graphqlWithHeaders(
  query: string,
  variables: Record<string, unknown>,
  accessToken: string | null,
  extraHeaders: Record<string, string>
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
  if (accessToken !== null) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  return (await response.json()) as Record<string, unknown>;
}

async function startAndCompleteSession(accessToken: string, id: string): Promise<void> {
  await graphql(START_SESSION_DOC, { id }, accessToken);
  await graphql(COMPLETE_SESSION_DOC, { id }, accessToken);
}

async function submitReport(accessToken: string): Promise<void> {
  const result = await graphql(SUBMIT_REPORT_DOC, { id: sigmaId, input: SIGMA_SUBMIT_INPUT }, accessToken);
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) {
    throw new Error(`submitSessionReport failed: ${JSON.stringify(result)}`);
  }
}

describe("cross-user verification — studentHomeworkHistory across actors", () => {
  test("T1 (linked teacher) reads the history envelope — H1 visible", async () => {
    const token = await signAccessToken({ userId: cast.teacher.userId, role: cast.teacher.user.role });
    const response = await graphql(
      STUDENT_HOMEWORK_HISTORY_DOC,
      { studentId: String(cast.primaryStudent.userId) },
      token
    );
    wireCalls.push({
      actor: "Teacher T1 (linked)",
      scenario: "Linked teacher reads student's homework history",
      query: "studentHomeworkHistory",
      variables: { studentId: cast.primaryStudent.userId },
      token,
      expected: { code: "OK", dataMode: "happy" },
      response,
    });
    const data = response.data as Record<string, unknown> | undefined;
    expect(data).toBeDefined();
    const envelope = data?.studentHomeworkHistory as Record<string, unknown> | undefined;
    expect(envelope).toBeDefined();
    expect(envelope?.totalCount).toBe(1);
    expect(envelope?.page).toBe(1);
    expect(envelope?.pageSize).toBe(25);
  });

  test("T2 (second teacher, linked via σ′) reads the history — cross-teacher visibility", async () => {
    const token = await signAccessToken({ userId: cast.secondTeacher.userId, role: cast.secondTeacher.user.role });
    const response = await graphql(
      STUDENT_HOMEWORK_HISTORY_DOC,
      { studentId: String(cast.primaryStudent.userId) },
      token
    );
    wireCalls.push({
      actor: "Teacher T2 (linked via σ′)",
      scenario: "Cross-teacher visibility — T2 reads H1 authored by T1",
      query: "studentHomeworkHistory",
      variables: { studentId: cast.primaryStudent.userId },
      token,
      expected: { code: "OK", dataMode: "happy" },
      response,
    });
    const data = response.data as Record<string, unknown> | undefined;
    expect(data).toBeDefined();
    const envelope = data?.studentHomeworkHistory as Record<string, unknown> | undefined;
    expect(envelope).toBeDefined();
    expect(envelope?.totalCount).toBe(1);
    const items = envelope?.items as Array<Record<string, unknown>> | undefined;
    expect(items).toBeDefined();
    expect(items?.length).toBe(1);
    expect(items?.[0]?.currentSurahJuz).toBe("SurahAlBaqarah");
    expect(items?.[0]?.revisionSurahJuz).toBe("Juz30");
  });

  test("Ft (foreign teacher, no session with student) → constant FORBIDDEN", async () => {
    // Use the second teacher but query for a student they have no session with.
    // For this test we need a foreign student; the cast.secondStudent fits.
    const token = await signAccessToken({ userId: cast.secondTeacher.userId, role: cast.secondTeacher.user.role });
    const response = await graphql(
      STUDENT_HOMEWORK_HISTORY_DOC,
      { studentId: String(cast.secondStudent.userId) },
      token
    );
    wireCalls.push({
      actor: "Teacher Ft (foreign — no session with this student)",
      scenario: "Constant-FORBIDDEN oracle (no existence disclosure)",
      query: "studentHomeworkHistory",
      variables: { studentId: cast.secondStudent.userId },
      token,
      expected: { code: "FORBIDDEN", dataMode: "forbidden" },
      response,
    });
    const errors = response.errors as Array<Record<string, unknown>> | undefined;
    expect(errors).toBeDefined();
    expect(errors?.length).toBe(1);
    const code = (errors?.[0]?.extensions as Record<string, unknown> | undefined)?.code;
    expect(code).toBe("FORBIDDEN");
  });

  test("Student caller → FORBIDDEN (role scope denies before resolver)", async () => {
    const token = await signAccessToken({ userId: cast.primaryStudent.userId, role: cast.primaryStudent.user.role });
    const response = await graphql(
      STUDENT_HOMEWORK_HISTORY_DOC,
      { studentId: String(cast.primaryStudent.userId) },
      token
    );
    wireCalls.push({
      actor: "Student S",
      scenario: "Role scope denies student callers before the resolver runs",
      query: "studentHomeworkHistory",
      variables: { studentId: cast.primaryStudent.userId },
      token,
      expected: { code: "FORBIDDEN", dataMode: "forbidden" },
      response,
    });
    const errors = response.errors as Array<Record<string, unknown>> | undefined;
    expect(errors).toBeDefined();
    expect(errors?.length).toBe(1);
    const code = (errors?.[0]?.extensions as Record<string, unknown> | undefined)?.code;
    expect(code).toBe("FORBIDDEN");
  });

  test("Parent caller → FORBIDDEN (role scope)", async () => {
    const token = await signAccessToken({ userId: cast.parent.userId, role: cast.parent.user.role });
    const response = await graphql(
      STUDENT_HOMEWORK_HISTORY_DOC,
      { studentId: String(cast.primaryStudent.userId) },
      token
    );
    wireCalls.push({
      actor: "Parent P (linked to student)",
      scenario: "Role scope denies parent callers even when linked to the student",
      query: "studentHomeworkHistory",
      variables: { studentId: cast.primaryStudent.userId },
      token,
      expected: { code: "FORBIDDEN", dataMode: "forbidden" },
      response,
    });
    const errors = response.errors as Array<Record<string, unknown>> | undefined;
    expect(errors).toBeDefined();
    expect(errors?.length).toBe(1);
    const code = (errors?.[0]?.extensions as Record<string, unknown> | undefined)?.code;
    expect(code).toBe("FORBIDDEN");
  });

  test("Admin caller → FORBIDDEN (role scope)", async () => {
    const token = await signAccessToken({ userId: cast.admin.userId, role: cast.admin.user.role });
    const response = await graphql(
      STUDENT_HOMEWORK_HISTORY_DOC,
      { studentId: String(cast.primaryStudent.userId) },
      token
    );
    wireCalls.push({
      actor: "Admin A",
      scenario: "Role scope denies admin callers (the read is teacher-only)",
      query: "studentHomeworkHistory",
      variables: { studentId: cast.primaryStudent.userId },
      token,
      expected: { code: "FORBIDDEN", dataMode: "forbidden" },
      response,
    });
    const errors = response.errors as Array<Record<string, unknown>> | undefined;
    expect(errors).toBeDefined();
    expect(errors?.length).toBe(1);
    const code = (errors?.[0]?.extensions as Record<string, unknown> | undefined)?.code;
    expect(code).toBe("FORBIDDEN");
  });

  test("Anonymous → UNAUTHORIZED (no token)", async () => {
    const response = await graphql(
      STUDENT_HOMEWORK_HISTORY_DOC,
      { studentId: String(cast.primaryStudent.userId) },
      null
    );
    wireCalls.push({
      actor: "Anonymous (no Bearer token)",
      scenario: "Unauthenticated request denied at the scope layer",
      query: "studentHomeworkHistory",
      variables: { studentId: cast.primaryStudent.userId },
      token: null,
      expected: { code: "UNAUTHORIZED", dataMode: "unauthorized" },
      response,
    });
    const errors = response.errors as Array<Record<string, unknown>> | undefined;
    expect(errors).toBeDefined();
    expect(errors?.length).toBe(1);
    const code = (errors?.[0]?.extensions as Record<string, unknown> | undefined)?.code;
    expect(code).toBe("UNAUTHORIZED");
  });

  test("Hostile id shape → VALIDATION (pre-DB guard)", async () => {
    const token = await signAccessToken({ userId: cast.secondTeacher.userId, role: cast.secondTeacher.user.role });
    const response = await graphql(STUDENT_HOMEWORK_HISTORY_DOC, { studentId: "abc" }, token);
    wireCalls.push({
      actor: "Teacher T2 (linked) — hostile id shape",
      scenario: "Pre-DB id-shape guard throws VALIDATION before the relationship gate",
      query: "studentHomeworkHistory",
      variables: { studentId: "abc" },
      token,
      expected: { code: "VALIDATION", dataMode: "validation" },
      response,
    });
    const errors = response.errors as Array<Record<string, unknown>> | undefined;
    expect(errors).toBeDefined();
    expect(errors?.length).toBe(1);
    const code = (errors?.[0]?.extensions as Record<string, unknown> | undefined)?.code;
    expect(code).toBe("VALIDATION");
  });
});

function renderHtmlReport(): void {
  const screenshotsDir = join(process.cwd(), "scratch", "screenshots");
  mkdirSync(screenshotsDir, { recursive: true });

  const rows = wireCalls
    .map(call => {
      const responseJson = JSON.stringify(call.response, null, 2);
      const status = deriveStatusBadge(call);
      return `
      <tr>
        <td><strong>${call.actor}</strong></td>
        <td>${call.scenario}</td>
        <td><code>studentId=${escapeHtml(JSON.stringify(call.variables.studentId))}</code></td>
        <td>${status}</td>
        <td><pre>${escapeHtml(responseJson)}</pre></td>
      </tr>
    `;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cross-User Verification — Issue #195 (Session Report Submission with Homework)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; background: #f7f7f7; color: #1a1a1a; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 13px; }
    th { background: #fafafa; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px; color: #666; }
    pre { white-space: pre-wrap; max-width: 480px; max-height: 220px; overflow: auto; background: #f4f4f4; padding: 8px; border-radius: 4px; font-size: 11px; margin: 0; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
    .badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; display: inline-block; }
    .badge-pass { background: #dcfce7; color: #166534; }
    .badge-forbidden { background: #fee2e2; color: #991b1b; }
    .badge-unauthorized { background: #fef3c7; color: #92400e; }
    .badge-validation { background: #fef3c7; color: #92400e; }
  </style>
</head>
<body>
  <h1>Cross-User Verification — Issue #195</h1>
  <div class="meta">Plan: session_report_submission_with_homework_jadid_madi · 8 actor scenarios · ${new Date().toISOString()}</div>
  <table>
    <thead>
      <tr>
        <th>Actor</th>
        <th>Scenario</th>
        <th>Variables</th>
        <th>Result</th>
        <th>Response (raw JSON)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

  const reportPath = join(screenshotsDir, "cross-user-report.html");
  writeFileSync(reportPath, html);
  console.log(`Report written to: ${reportPath}`);
}

function deriveStatusBadge(call: WireCall & { readonly response: Record<string, unknown> }): string {
  const errors = call.response.errors as Array<Record<string, unknown>> | undefined;
  if (errors && errors.length > 0) {
    const code = (errors[0]?.extensions as Record<string, unknown> | undefined)?.code as string | undefined;
    if (code === "FORBIDDEN") return `<span class="badge badge-forbidden">FORBIDDEN ✓</span>`;
    if (code === "UNAUTHORIZED") return `<span class="badge badge-unauthorized">UNAUTHORIZED ✓</span>`;
    if (code === "VALIDATION") return `<span class="badge badge-validation">VALIDATION ✓</span>`;
    return `<span class="badge badge-forbidden">${escapeHtml(code ?? "ERROR")} ✗</span>`;
  }
  const data = call.response.data as Record<string, unknown> | undefined;
  if (data?.studentHomeworkHistory) {
    return `<span class="badge badge-pass">200 OK ✓</span>`;
  }
  return `<span class="badge badge-forbidden">UNKNOWN ✗</span>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
