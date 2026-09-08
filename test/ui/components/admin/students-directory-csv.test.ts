/**
 * Student-directory CSV export — builder suite (PURE unit tier).
 *
 * Covers the serialization contract of `buildStudentsDirectoryCsv` and
 * `studentsDirectoryCsvFilename`:
 *
 *   BOM prefix · localized header row composed FROM the label handles (the
 *   two TRIAL columns pinned to the export-scoped captions — the header
 *   record carries NO duplicate captions) · boolean columns serialize as
 *   wire true/false · honest-null phone / country / trialGrantedAt /
 *   language / parent cells serialize as EMPTY (never —) · balances
 *   serialize as raw integer strings · RFC-4180 escaping of
 *   delimiter/quote carrying NAMES · filename derivation from the injected
 *   wall clock at UTC minute precision.
 *
 * Labels resolve from the en/ar leaf maps directly (the same objects the
 * namespace composes) — assertions compose expected cells from the label
 * handles; the exception class is fixture DATA (names, emails, ISO stamps)
 * and the DELIBERATELY hostile synthetic name used by the escaping case.
 *
 * Pure unit tier — NO DOM, NO server boot, NO network, NO DB. Runs via the
 * mandated runner: `bun run test/scripts/run-test.ts test/ui/components/admin/students-directory-csv.test.ts`
 */

import { describe, expect, test } from "bun:test";
import type { AdminStudentsQuery_adminStudents_items } from "@/frontend/graphql/generated/gql/graphql";
import {
  buildStudentsDirectoryCsv,
  studentsDirectoryCsvFilename,
} from "@/frontend/views/admin/students/students-directory-csv";
import { adminStudentsAr } from "@/shared/locale/ar/adminStudents";
import { adminStudentsEn } from "@/shared/locale/en/adminStudents";

/** One directory row fixture — the generated wire shape (fixture data class). */
function studentFixture(): AdminStudentsQuery_adminStudents_items {
  return {
    id: 12,
    name: "Demo Student",
    email: "demo@kottaby.test",
    phone: "+201098765432",
    country: "Egypt",
    balanceHifz: 3,
    balanceReviews: 5,
    balanceTajweed: 1,
    balanceTrial: 2,
    trialGrantedAt: "2026-08-27T13:00:00.000Z",
    primaryLanguage: "Arabic",
    anotherLanguage: "English",
    hasParent: true,
    parentName: "Parent Waheed",
    parentEmail: "waheed@kottaby.test",
    createdAt: "2026-09-05T10:07:08.000Z",
  };
}

/** The localized header record the builder must emit for `en` labels. */
function expectedEnHeader(): string {
  return [
    adminStudentsEn.fields.id,
    adminStudentsEn.headers.name,
    adminStudentsEn.fields.email,
    adminStudentsEn.fields.phone,
    adminStudentsEn.fields.country,
    adminStudentsEn.balances.hifz,
    adminStudentsEn.balances.reviews,
    adminStudentsEn.balances.tajweed,
    // Export-scoped trial captions — the shared `balances.trial` /
    // `headers.trial` handles both resolve to "Trial" (EN) and duplicated
    // the header record (QA finding; see the builder docblock).
    adminStudentsEn.export.columnTrialBalance,
    adminStudentsEn.export.columnTrialGrantedAt,
    adminStudentsEn.fields.primaryLanguage,
    adminStudentsEn.fields.anotherLanguage,
    adminStudentsEn.parentLabels.withParent,
    adminStudentsEn.headers.parent,
    adminStudentsEn.fields.parentEmail,
    adminStudentsEn.headers.joined,
  ].join(",");
}

describe("students-directory CSV builder", () => {
  test("prefixes a UTF-8 BOM and leads with the localized header record", () => {
    const csv = buildStudentsDirectoryCsv([studentFixture()], adminStudentsEn);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const withoutBom = csv.slice(1);
    const firstRecord = withoutBom.slice(0, withoutBom.indexOf("\n"));
    expect(firstRecord).toBe(expectedEnHeader());
    // The Arabic labels round-trip through the SAME builder (locale comes from labels only).
    const csvAr = buildStudentsDirectoryCsv([studentFixture()], adminStudentsAr);
    expect(csvAr).toContain(`${adminStudentsAr.fields.id},${adminStudentsAr.headers.name}`);
  });

  test("header record carries NO duplicate captions — the two trial columns use the export-scoped captions", () => {
    for (const labels of [adminStudentsEn, adminStudentsAr]) {
      const csv = buildStudentsDirectoryCsv([studentFixture()], labels);
      const firstRecord = csv.slice(1, csv.indexOf("\n"));
      const cells = firstRecord.split(",");
      // No caption repeats anywhere in the 17-cell header record.
      expect(new Set(cells).size).toBe(cells.length);
      // Columns 9/10 carry the NEW export-scoped captions — never the
      // colliding shared handles.
      expect(cells[8]).toBe(labels.export.columnTrialBalance);
      expect(cells[9]).toBe(labels.export.columnTrialGrantedAt);
      expect(cells[8]).not.toBe(labels.balances.trial);
      expect(cells[9]).not.toBe(labels.headers.trial);
    }
    // Verbatim caption pins (both locales) — regression lock for the
    // "Trial,Trial" QA finding.
    expect(adminStudentsEn.export.columnTrialBalance).toBe("Trial balance");
    expect(adminStudentsEn.export.columnTrialGrantedAt).toBe("Trial granted at");
    expect(adminStudentsAr.export.columnTrialBalance).toBe("رصيد التجربة");
    expect(adminStudentsAr.export.columnTrialGrantedAt).toBe("تاريخ منح الفترة التجريبية");
  });

  test("one record per on-screen student with raw wire values", () => {
    const csv = buildStudentsDirectoryCsv([studentFixture()], adminStudentsEn);
    expect(csv).toContain(
      `12,Demo Student,demo@kottaby.test,+201098765432,Egypt,3,5,1,2,2026-08-27T13:00:00.000Z,Arabic,English,true,Parent Waheed,waheed@kottaby.test,2026-09-05T10:07:08.000Z`
    );
  });

  test("honest-null phone, trial stamp, language, and parent cells serialize as EMPTY (never —)", () => {
    const sparse = {
      ...studentFixture(),
      phone: null,
      country: null,
      trialGrantedAt: null,
      primaryLanguage: null,
      anotherLanguage: null,
      hasParent: false,
      parentName: null,
      parentEmail: null,
    };
    const csv = buildStudentsDirectoryCsv([sparse], adminStudentsEn);
    const record = [
      "12",
      sparse.name,
      sparse.email,
      "",
      "",
      "3",
      "5",
      "1",
      "2",
      "",
      "",
      "",
      "false",
      "",
      "",
      sparse.createdAt,
    ].join(",");
    expect(csv).toContain(record);
    expect(csv).not.toContain("—");
    expect(csv).not.toContain("2026-08-27T13:00:00.000Z");
  });

  test("escapes delimiter- and quote-carrying names per RFC-4180", () => {
    const hostile = { ...studentFixture(), name: `Doe, "Jan" Jr.` };
    const csv = buildStudentsDirectoryCsv([hostile], adminStudentsEn);
    expect(csv).toContain(`"Doe, ""Jan"" Jr."`);
  });

  test("filename derives from the injected clock at UTC minute precision", () => {
    expect(studentsDirectoryCsvFilename(new Date("2026-09-05T10:07:08.000Z"))).toBe(
      "students-directory-2026-09-05-1007.csv"
    );
    // Single-digit UTC components zero-pad.
    expect(studentsDirectoryCsvFilename(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      "students-directory-2026-01-02-0304.csv"
    );
  });
});
