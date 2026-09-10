/**
 * Static Structural Assertions Suite — report & homework canonical types.
 * bun:test file-content scans enforcing structural invariants.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TYPES_DIR = join(__dirname);

/** Files to scan (library files only, NOT test files). */
const LIB_FILES = ["report.types.ts", "home-work.types.ts", "session-notification.types.ts", "index.ts"];

/** Server-controlled report/homework columns that must never appear on the submit-input whitelist. */
const FORBIDDEN_SUBMIT_FIELDS = [
  "id",
  "sessionId",
  "createdAt",
  "updatedAt",
  "teacherId",
  "studentId",
  "currentGrade",
  "revisionGrade",
  "fromAyah",
  "toAyah",
  "surahJuz",
  "jadid",
  "madi",
];

async function readLibFiles(): Promise<Map<string, string>> {
  const entries = await Promise.all(
    LIB_FILES.map(async f => [f, await readFile(join(TYPES_DIR, f), "utf-8")] as const)
  );
  return new Map(entries);
}

/** Strict file lookup — a missing file fails the suite instead of yielding undefined. */
function libCode(files: Map<string, string>, name: string): string {
  const content = files.get(name);
  if (content === undefined) {
    throw new Error(`missing lib file: ${name}`);
  }
  return content;
}

/** Strips comment lines so prose mentions don't trip structural scans. */
function codeLines(content: string): string[] {
  return content
    .split("\n")
    .filter(l => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("/*"));
}

/** Extracts `content.slice(bodyStart, bodyEnd)` for the interface block starting at matchIndex. */
function sliceInterfaceBody(content: string, matchIndex: number): string {
  const bodyStart = content.indexOf("{", matchIndex);
  const braceCount = { count: 0 };
  let bodyEnd = bodyStart;
  for (let i = bodyStart; i < content.length; i++) {
    if (content[i] === "{") braceCount.count++;
    if (content[i] === "}") braceCount.count--;
    if (braceCount.count === 0) {
      bodyEnd = i;
      break;
    }
  }
  return content.slice(bodyStart, bodyEnd);
}

/** Body of the named interface declaration ("" when absent — callers assert on it). */
function interfaceBody(code: string, declaration: RegExp): string {
  const match = declaration.exec(code);
  if (!match) {
    return "";
  }
  return sliceInterfaceBody(code, match.index);
}

/** Counts member declarations inside an interface body (anchored to member lines). */
function memberCount(body: string): number {
  // Linear scan (no regex): member lines are exactly two-space indented `readonly` declarations.
  return body.split("\n").filter(l => l.startsWith("  readonly ")).length;
}

describe("Report & Homework Canonical Types — Static Structural Assertions", () => {
  let files: Map<string, string>;

  beforeAll(async () => {
    files = await readLibFiles();
  });

  test("1. Report row types derive exactly the two $infer projections plus the ReturnType alias", () => {
    const code = codeLines(libCode(files, "report.types.ts")).join("\n");
    expect(code).toContain("export type ReportSelectType = typeof reports.$inferSelect;");
    expect(code).toContain("export type ReportInsertType = typeof reports.$inferInsert;");
    expect(code).toContain("export type ReportReturnType = typeof reports.$inferSelect;");
    expect(code).not.toMatch(/interface\s+ReportReturnType\b/);
    expect(code).not.toContain("Omit<");
  });

  test("2. Homework row types derive exactly the two $infer projections plus the ReturnType alias — nothing else", () => {
    const code = codeLines(libCode(files, "home-work.types.ts")).join("\n");
    expect(code).toContain("export type HomeWorkSelectType = typeof homeWork.$inferSelect;");
    expect(code).toContain("export type HomeWorkInsertType = typeof homeWork.$inferInsert;");
    expect(code).toContain("export type HomeWorkReturnType = typeof homeWork.$inferSelect;");
    const exportCount = code.match(/^export /gm)?.length ?? 0;
    expect(exportCount).toBe(3);
    expect(code).not.toMatch(/interface\s+HomeWorkReturnType\b/);
    expect(code).not.toContain("Omit<");
    expect(code).not.toContain("interface ");
  });

  test("3. Submit-input whitelist is exactly the four client-owned members — server-controlled fields structurally absent", () => {
    const code = codeLines(libCode(files, "report.types.ts")).join("\n");
    const body = interfaceBody(code, /export interface SessionReportSubmitInput\b/);
    expect(body).not.toBe("");

    expect(body).toContain("readonly teacherNotes: string;");
    expect(body).toContain("readonly studentRatingByTeacher: number;");
    expect(body).toContain("readonly homework?: HomeWorkAssignInput;");
    expect(body).toContain("readonly previousGrades?: HomeWorkGradeFieldsInput;");
    expect(memberCount(body)).toBe(4);

    for (const field of FORBIDDEN_SUBMIT_FIELDS) {
      expect(body).not.toMatch(new RegExp(`readonly\\s+${field}\\s*[?:]`));
    }
  });

  test("4. Homework input aliases carry exactly the cohesive block members (whitespace-normalized)", () => {
    const code = codeLines(libCode(files, "report.types.ts")).join("\n").replace(/\s+/g, " ");
    expect(code).toContain("export type HomeWorkGradeFieldsInput = { currentGrade: number; revisionGrade: number };");
    expect(code).toContain(
      "export type HomeWorkBlockInput = { fromAyah: number; toAyah: number; surahJuz: SurahJuzRef };"
    );
    expect(code).toContain(
      "export type HomeWorkAssignInput = { jadid?: HomeWorkBlockInput; madi?: HomeWorkBlockInput };"
    );
  });

  test("5. Report-wave participant is the request-wave participant shape, unchanged", () => {
    const code = codeLines(libCode(files, "session-notification.types.ts")).join("\n").replace(/\s+/g, " ");
    expect(code).toContain("export type SessionReportWaveParticipant = SessionWaveParticipantContext;");
  });

  test("6. Report-wave context carries student, teacher, and an explicitly nullable parent leg", () => {
    const code = codeLines(libCode(files, "session-notification.types.ts")).join("\n");
    const body = interfaceBody(code, /export interface SessionReportWaveContext\b/);
    expect(body).not.toBe("");

    expect(body).toContain("readonly sessionId: number;");
    expect(body).toContain("readonly student: SessionReportWaveParticipant;");
    expect(body).toContain("readonly teacher: SessionReportWaveParticipant;");
    expect(body).toContain("readonly parent: SessionReportWaveParticipant | null;");
    expect(memberCount(body)).toBe(4);
  });

  test("7. Report-wave raw row is the flat joined read with nullable parent legs", () => {
    const code = codeLines(libCode(files, "session-notification.types.ts")).join("\n");
    const body = interfaceBody(code, /export interface SessionReportWaveContextRow\b/);
    expect(body).not.toBe("");

    expect(body).toContain("readonly sessionId: number;");
    expect(body).toContain("readonly studentUserId: number;");
    expect(body).toContain("readonly studentFullName: string;");
    expect(body).toContain("readonly studentLocale: AppLocale | null;");
    expect(body).toContain("readonly teacherUserId: number;");
    expect(body).toContain("readonly teacherFullName: string;");
    expect(body).toContain("readonly teacherLocale: AppLocale | null;");
    expect(body).toContain("readonly parentUserId: number | null;");
    expect(body).toContain("readonly parentFullName: string | null;");
    expect(body).toContain("readonly parentLocale: AppLocale | null;");
    expect(memberCount(body)).toBe(10);
  });

  test("8. Barrel re-exports every type module and stays a pure relative export * barrel", () => {
    const code = codeLines(libCode(files, "index.ts")).join("\n");
    expect(code).toContain('export * from "./home-work.types";');
    expect(code).toContain('export * from "./report.types";');
    expect(code).toContain('export * from "./session-notification.types";');
    expect(code).toContain('export * from "./session-request-idempotency.types";');
    expect(code).toContain('export * from "./session.types";');
    const lines = code
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);
    for (const line of lines) {
      expect(line).toMatch(/^export \* from "\.\/[\w.-]+";$/);
    }
  });

  test("9. Zero forbidden patterns: any, spreads, unknown-casts, console/logger", () => {
    for (const name of LIB_FILES) {
      const code = codeLines(libCode(files, name)).join("\n");
      expect(code).not.toMatch(/\bany\b/);
      expect(code).not.toContain("...");
      expect(code).not.toContain("as unknown");
      expect(code).not.toMatch(/console\./);
      expect(code).not.toMatch(/\blogger\b/);
      expect(code).not.toMatch(/\boxlint-disable\b/);
    }
  });

  test("10. Zero plan-artifact references in comments (clean domain comments)", () => {
    for (const name of LIB_FILES) {
      const content = libCode(files, name);
      expect(content).not.toMatch(/REQ-\d|DEV3-\d|Phase \d|Task \d|plan\.md|tasks\.md|specs\.md/);
    }
  });
});
