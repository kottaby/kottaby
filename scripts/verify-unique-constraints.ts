#!/usr/bin/env bun
/**
 * DB introspection probe for the one-row-per-session constraints.
 *
 * Verifies, against the live database (no schema-code involvement):
 *  1. `reports.session_id` and `home_work.session_id` each carry a UNIQUE
 *     table constraint named after the `<table>_<column>_unique` convention.
 *  2. The `home_work` grade columns (`current_grade`, `revision_grade`)
 *     remain nullable — grades arrive on a later pass, not at assignment.
 *  3. The `reports` table exposes no `teacher_id` column — the teacher is
 *     reached through `session_id → session.teacher_id`.
 *
 * Read-only: every statement is a catalog/information-schema SELECT.
 *
 * Usage:
 *   bun run scripts/verify-unique-constraints.ts
 *
 * Exit codes: 0 = all expectations hold; 1 = any expectation violated.
 */

import { applyEnvFile } from "@/scripts/dbActions/envFile";

type ConstraintProbeRow = {
  constraint_name: string;
  table_name: string;
  contype: string;
  definition: string;
};

type NullableColumnRow = {
  table_name: string;
  column_name: string;
  is_nullable: string;
};

type TeacherIdColumnRow = {
  table_name: string;
  column_name: string;
};

/** Expected unique-constraint surface: table → constraint name. */
const EXPECTED_UNIQUE: ReadonlyArray<readonly [table: string, constraint: string]> = [
  ["home_work", "home_work_session_id_unique"],
  ["reports", "reports_session_id_unique"],
];

/** Grade columns that must stay nullable (graded on a later pass). */
const EXPECTED_NULLABLE_GRADES: ReadonlyArray<readonly [table: string, column: string]> = [
  ["home_work", "current_grade"],
  ["home_work", "revision_grade"],
];

applyEnvFile(".env");

const { db, closePool } = await import("@/backend/db");
const { sql } = await import("drizzle-orm");

let failures = 0;

function report(ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${detail}`);
  if (!ok) failures += 1;
}

/** Fetches a named UNIQUE constraint from the catalog (single row or none). */
function probeUniqueConstraint(tableName: string, constraintName: string) {
  return db.execute<ConstraintProbeRow>(sql`
    SELECT c.conname AS constraint_name,
           t.relname AS table_name,
           c.contype AS contype,
           pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = ${constraintName}
      AND t.relname = ${tableName}
      AND n.nspname = 'public'
  `);
}

/** Fetches one column's nullability from information_schema (single row or none). */
function probeColumnNullability(tableName: string, columnName: string) {
  return db.execute<NullableColumnRow>(sql`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `);
}

try {
  const [uniqueResults, nullabilityResults, teacherIdResult] = await Promise.all([
    Promise.all(EXPECTED_UNIQUE.map(([tableName, constraintName]) => probeUniqueConstraint(tableName, constraintName))),
    Promise.all(
      EXPECTED_NULLABLE_GRADES.map(([tableName, columnName]) => probeColumnNullability(tableName, columnName))
    ),
    db.execute<TeacherIdColumnRow>(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reports'
        AND column_name = 'teacher_id'
    `),
  ]);

  // 1. Unique constraints present, of contype 'u' (UNIQUE), on the right tables/columns.
  EXPECTED_UNIQUE.forEach(([tableName, constraintName], index) => {
    const rows = uniqueResults[index].rows;
    const row = rows[0];
    report(
      rows.length === 1 && row?.contype === "u" && row.definition === "UNIQUE (session_id)",
      rows.length === 1 && row
        ? `constraint "${row.constraint_name}" on ${row.table_name}: contype='${row.contype}' (u = UNIQUE), definition='${row.definition}'`
        : `constraint "${constraintName}" on ${tableName}: NOT FOUND as a UNIQUE constraint in schema public`
    );
  });

  // 2. Grade columns remain nullable.
  EXPECTED_NULLABLE_GRADES.forEach(([tableName, columnName], index) => {
    const row = nullabilityResults[index].rows[0];
    report(
      row?.is_nullable === "YES",
      row
        ? `${row.table_name}.${row.column_name} is_nullable=${row.is_nullable}`
        : `${tableName}.${columnName}: column NOT FOUND`
    );
  });

  // 3. No teacher_id column on reports (teacher reached via session_id).
  const teacherIdRows = teacherIdResult.rows;
  report(
    teacherIdRows.length === 0,
    teacherIdRows.length === 0
      ? `reports.teacher_id: absent (as required)`
      : `reports.teacher_id: UNEXPECTEDLY PRESENT (${teacherIdRows.length} row(s))`
  );
} catch (error) {
  console.error("[verify-unique-constraints] probe failed:", error);
  process.exitCode = 1;
} finally {
  await closePool();
}

if (failures > 0) {
  console.error(`[verify-unique-constraints] ${failures} expectation(s) violated`);
  process.exitCode = 1;
} else {
  console.log("[verify-unique-constraints] all expectations hold");
}
