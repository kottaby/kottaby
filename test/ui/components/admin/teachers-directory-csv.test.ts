/**
 * Teacher-directory CSV export — builder suite (PURE unit tier).
 *
 * Covers the serialization contract of `buildTeachersDirectoryCsv` and
 * `teachersDirectoryCsvFilename`:
 *
 *   BOM prefix · localized header row composed FROM the label handles ·
 *   boolean columns serialize as wire true/false · honest-null phone /
 *   country / rating cells serialize as EMPTY (never 0, never —) · rating
 *   decimal strings stay verbatim · subjects join with `;` · RFC-4180
 *   escaping of delimiter/quote carrying NAMES · filename derivation from
 *   the injected wall clock at UTC minute precision.
 *
 * Labels resolve from the en/ar leaf maps directly (the same objects the
 * namespace composes) — assertions compose expected cells from the label
 * handles; the exception class is fixture DATA (names, emails, ISO stamps)
 * and the DELIBERATELY hostile synthetic name used by the escaping case.
 *
 * Pure unit tier — NO DOM, NO server boot, NO network, NO DB. Runs via the
 * mandated runner: `bun run test/scripts/run-test.ts test/ui/components/admin/teachers-directory-csv.test.ts`
 */

import { describe, expect, test } from "bun:test";
import type { AdminTeachersQuery_adminTeachers_items } from "@/frontend/graphql/generated/gql/graphql";
import {
  buildTeachersDirectoryCsv,
  teachersDirectoryCsvFilename,
} from "@/frontend/views/admin/teachers/teachers-directory-csv";
import { adminTeachersAr } from "@/shared/locale/ar/adminTeachers";
import { adminTeachersEn } from "@/shared/locale/en/adminTeachers";

/** One directory row fixture — the generated wire shape (fixture data class). */
function teacherFixture(): AdminTeachersQuery_adminTeachers_items {
  return {
    id: 7,
    name: "Ustadh Kamil",
    email: "kamil@kottaby.test",
    phone: "+201234567890",
    country: "Egypt",
    isApproved: true,
    isEvaluator: false,
    averageRating: 4.5,
    isOnline: true,
    subjects: ["Tajweed", "Hifz"],
    isDeleted: false,
    suspended: false,
    isBlocked: false,
    createdAt: "2026-09-05T10:07:08.000Z",
  };
}

/** The localized header record the builder must emit for `en` labels. */
function expectedEnHeader(): string {
  return [
    adminTeachersEn.fields.id,
    adminTeachersEn.headers.name,
    adminTeachersEn.fields.email,
    adminTeachersEn.fields.phone,
    adminTeachersEn.fields.country,
    adminTeachersEn.statusPills.approved,
    adminTeachersEn.statusPills.evaluator,
    adminTeachersEn.headers.rating,
    adminTeachersEn.statusPills.online,
    adminTeachersEn.headers.subjects,
    adminTeachersEn.statusPills.deleted,
    adminTeachersEn.statusPills.suspended,
    adminTeachersEn.statusPills.blocked,
    adminTeachersEn.headers.joined,
  ].join(",");
}

describe("teachers-directory CSV builder", () => {
  test("prefixes a UTF-8 BOM and leads with the localized header record", () => {
    const csv = buildTeachersDirectoryCsv([teacherFixture()], adminTeachersEn);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const withoutBom = csv.slice(1);
    const firstRecord = withoutBom.slice(0, withoutBom.indexOf("\n"));
    expect(firstRecord).toBe(expectedEnHeader());
    // The Arabic labels round-trip through the SAME builder (locale comes from labels only).
    const csvAr = buildTeachersDirectoryCsv([teacherFixture()], adminTeachersAr);
    expect(csvAr).toContain(`${adminTeachersAr.fields.id},${adminTeachersAr.headers.name}`);
  });

  test("one record per on-screen teacher with raw wire values", () => {
    const csv = buildTeachersDirectoryCsv([teacherFixture()], adminTeachersEn);
    expect(csv).toContain(
      `7,Ustadh Kamil,kamil@kottaby.test,+201234567890,Egypt,true,false,4.5,true,Tajweed;Hifz,false,false,false,2026-09-05T10:07:08.000Z`
    );
  });

  test("honest-null phone, country, and rating serialize as EMPTY cells (never 0, never —)", () => {
    const sparse = { ...teacherFixture(), phone: null, country: null, averageRating: null, subjects: [] };
    const csv = buildTeachersDirectoryCsv([sparse], adminTeachersEn);
    const record = [
      "7",
      sparse.name,
      sparse.email,
      "",
      "",
      "true",
      "false",
      "",
      "true",
      "",
      "false",
      "false",
      "false",
      sparse.createdAt,
    ].join(",");
    expect(csv).toContain(record);
    expect(csv).not.toContain("—");
    expect(csv).not.toContain("4.5");
  });

  test("subjects join with the semicolon list separator", () => {
    const csv = buildTeachersDirectoryCsv([teacherFixture()], adminTeachersEn);
    expect(csv).toContain("Tajweed;Hifz");
  });

  test("escapes delimiter- and quote-carrying names per RFC-4180", () => {
    const hostile = { ...teacherFixture(), name: `Smith, "the" Teacher` };
    const csv = buildTeachersDirectoryCsv([hostile], adminTeachersEn);
    expect(csv).toContain(`"Smith, ""the"" Teacher"`);
  });

  test("filename derives from the injected clock at UTC minute precision", () => {
    expect(teachersDirectoryCsvFilename(new Date("2026-09-05T10:07:08.000Z"))).toBe(
      "teachers-directory-2026-09-05-1007.csv"
    );
    // Single-digit UTC components zero-pad.
    expect(teachersDirectoryCsvFilename(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      "teachers-directory-2026-01-02-0304.csv"
    );
  });
});
