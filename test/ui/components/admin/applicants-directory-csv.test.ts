/**
 * Applicant-queue CSV export — builder suite (PURE unit tier).
 *
 * Covers the serialization contract of `buildApplicantsDirectoryCsv` and
 * `applicantsDirectoryCsvFilename` (the server-side export-all dump behind
 * the /teachers applicants tab's EXPORT CSV action):
 *
 *   BOM prefix · localized header row composed FROM the label handles ·
 *   the lifecycle status serializes as the RAW lowercase wire string (never
 *   a localized pill) · boolean columns serialize as wire true/false ·
 *   honest-null phone / country / lastAttemptAt / cooldownUntil cells
 *   serialize as EMPTY (never —, never the cooling-down chip) · attempts
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
 * mandated runner: `bun run test/scripts/run-test.ts test/ui/components/admin/applicants-directory-csv.test.ts`
 */

import { describe, expect, test } from "bun:test";
import type { AdminTeacherApplicantsExportQuery_adminTeacherApplicantsExport_rows } from "@/frontend/graphql/generated/gql/graphql";
import {
  applicantsDirectoryCsvFilename,
  buildApplicantsDirectoryCsv,
} from "@/frontend/views/admin/teachers/applicants-directory-csv";
import { adminTeachersAr } from "@/shared/locale/ar/adminTeachers";
import { adminTeachersEn } from "@/shared/locale/en/adminTeachers";

/** One export row fixture — the generated wire shape (fixture data class). */
function applicantFixture(): AdminTeacherApplicantsExportQuery_adminTeacherApplicantsExport_rows {
  return {
    id: 2,
    name: "Demo Teacher",
    email: "teacher@draftacademy.local",
    phone: "+201098765432",
    country: "Egypt",
    status: "pending",
    verificationAttempts: 3,
    lastAttemptAt: "2026-08-27T13:00:00.000Z",
    cooldownUntil: "2026-08-27T14:00:00.000Z",
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
    adminTeachersEn.headers.status,
    adminTeachersEn.applicantHeaders.attempts,
    adminTeachersEn.applicantHeaders.lastAttempt,
    adminTeachersEn.applicantHeaders.cooldown,
    adminTeachersEn.statusPills.deleted,
    adminTeachersEn.statusPills.suspended,
    adminTeachersEn.statusPills.blocked,
    adminTeachersEn.headers.joined,
  ].join(",");
}

describe("applicants-directory CSV builder", () => {
  test("prefixes a UTF-8 BOM and leads with the localized header record", () => {
    const csv = buildApplicantsDirectoryCsv([applicantFixture()], adminTeachersEn);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const withoutBom = csv.slice(1);
    const firstRecord = withoutBom.slice(0, withoutBom.indexOf("\n"));
    expect(firstRecord).toBe(expectedEnHeader());
    // The Arabic labels round-trip through the SAME builder (locale comes from labels only).
    const csvAr = buildApplicantsDirectoryCsv([applicantFixture()], adminTeachersAr);
    expect(csvAr).toContain(`${adminTeachersAr.fields.id},${adminTeachersAr.headers.name}`);
  });

  test("one record per exported applicant with raw wire values (status stays the wire string)", () => {
    const csv = buildApplicantsDirectoryCsv([applicantFixture()], adminTeachersEn);
    expect(csv).toContain(
      `2,Demo Teacher,teacher@draftacademy.local,+201098765432,Egypt,pending,3,2026-08-27T13:00:00.000Z,2026-08-27T14:00:00.000Z,false,false,false,2026-09-05T10:07:08.000Z`
    );
    // The in_evaluation wire value passes through verbatim too (never a localized pill).
    const csvInEvaluation = buildApplicantsDirectoryCsv(
      [{ ...applicantFixture(), status: "in_evaluation" }],
      adminTeachersEn
    );
    expect(csvInEvaluation).toContain(`Egypt,in_evaluation,3,`);
  });

  test("honest-null phone, country, lastAttemptAt, and cooldownUntil serialize as EMPTY cells (never —)", () => {
    const sparse = {
      ...applicantFixture(),
      phone: null,
      country: null,
      lastAttemptAt: null,
      cooldownUntil: null,
    };
    const csv = buildApplicantsDirectoryCsv([sparse], adminTeachersEn);
    const record = [
      "2",
      sparse.name,
      sparse.email,
      "",
      "",
      "pending",
      "3",
      "",
      "",
      "false",
      "false",
      "false",
      sparse.createdAt,
    ].join(",");
    expect(csv).toContain(record);
    expect(csv).not.toContain("—");
    expect(csv).not.toContain("2026-08-27T14:00:00.000Z");
  });

  test("escapes delimiter- and quote-carrying names per RFC-4180", () => {
    const hostile = { ...applicantFixture(), name: `Doe, "Jane" Applicant` };
    const csv = buildApplicantsDirectoryCsv([hostile], adminTeachersEn);
    expect(csv).toContain(`"Doe, ""Jane"" Applicant"`);
  });

  test("filename derives from the injected clock at UTC minute precision", () => {
    expect(applicantsDirectoryCsvFilename(new Date("2026-09-05T10:07:08.000Z"))).toBe(
      "applicants-directory-2026-09-05-1007.csv"
    );
    // Single-digit UTC components zero-pad.
    expect(applicantsDirectoryCsvFilename(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      "applicants-directory-2026-01-02-0304.csv"
    );
  });
});
