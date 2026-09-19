/**
 * Pure-math unit tier for the student homework page's summary strip —
 * NO server boot, NO network, NO DB, NO React.
 *
 * Locks the honest partition contract: graded + pending === total on
 * every input, the graded predicate is "at least one track grade
 * recorded" (Jadid OR Madi), a both-tracks-null row stays in the total
 * but counts as pending, and the empty history yields all-zero cards.
 */

import { describe, expect, test } from "bun:test";
import {
  type MyHomeworkQuery_myHomework_items,
  SurahJuzRef,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  computeHomeworkSummary,
  filterHomeworkByStatus,
  toggleHomeworkFilter,
  toPrintableRows,
} from "@/frontend/views/student/homework/homework.helpers";

/** Row factory — `null` tracks collapse to "none assigned" on the wire. */
function row(id: number, jadidGrade: number | null, madiGrade: number | null): MyHomeworkQuery_myHomework_items {
  return {
    id: String(id),
    sessionId: 100 + id,
    createdAt: "2026-09-19T00:56:00Z",
    jadid: jadidGrade === null ? null : { surahJuz: SurahJuzRef.Juz30, fromAyah: 1, toAyah: 10, grade: jadidGrade },
    madi:
      madiGrade === null ? null : { surahJuz: SurahJuzRef.SurahAlMaidah, fromAyah: 1, toAyah: 10, grade: madiGrade },
  };
}

describe("computeHomeworkSummary — honest partition", () => {
  test("empty history → all-zero cards", () => {
    expect(computeHomeworkSummary([])).toEqual({ total: 0, graded: 0, pending: 0 });
  });

  test("graded + pending always equals total", () => {
    const rows = [row(1, 92, 88), row(2, null, 75), row(3, null, null), row(4, 60, null), row(5, null, null)];
    const summary = computeHomeworkSummary(rows);
    expect(summary.graded + summary.pending).toBe(summary.total);
  });

  test("a grade on EITHER track marks the row graded (Jadid-only, Madi-only)", () => {
    const summary = computeHomeworkSummary([row(1, 92, null), row(2, null, 75)]);
    expect(summary.graded).toBe(2);
    expect(summary.pending).toBe(0);
  });

  test("both-tracks-null rows count toward total but stay pending", () => {
    const summary = computeHomeworkSummary([row(1, null, null), row(2, null, null)]);
    expect(summary.total).toBe(2);
    expect(summary.graded).toBe(0);
    expect(summary.pending).toBe(2);
  });

  test("ungraded jadid alongside graded madi is one graded row (no double count)", () => {
    const summary = computeHomeworkSummary([row(1, null, 88), row(2, null, 92), row(3, 70, null)]);
    expect(summary.graded).toBe(3);
    expect(summary.total).toBe(3);
  });

  test("mixed history partitions exactly (demo-shaped data)", () => {
    // 2 graded (both tracks), 1 pending (graded tracks absent), 1 graded (madi only).
    const rows = [row(1, 92, 88), row(2, null, null), row(3, 65, 70), row(4, null, 81)];
    const summary = computeHomeworkSummary(rows);
    expect(summary).toEqual({ total: 4, graded: 3, pending: 1 });
  });
});

describe("toPrintableRows — shared print/export projection", () => {
  test("passages render human-readable (camelCase wire codes get spaces)", () => {
    const [only] = toPrintableRows([row(1, 92, 88)], () => "SEP");
    expect(only.col2).toBe("Juz 30");
    expect(only.col3).toBe("Surah Al Maidah");
  });

  test("grades join slash-ordered jadid/madi, only recorded ones", () => {
    const [both, jadidOnly, none] = toPrintableRows([row(1, 92, 88), row(2, 70, null), row(3, null, null)], () => "D");
    expect(both.col4).toBe("92/88");
    expect(jadidOnly.col4).toBe("70");
    expect(none.col4).toBe("");
  });

  test("absent track collapses to an empty cell (never the string null)", () => {
    const [only] = toPrintableRows([row(1, null, 75)], () => "D");
    expect(only.col2).toBe("");
    expect(only.col3).toBe("Surah Al Maidah");
  });

  test("date column flows through the injected formatter", () => {
    const rows = [row(1, 92, 88), row(2, null, null)];
    const calls: string[] = [];
    toPrintableRows(rows, iso => {
      calls.push(iso);
      return `F(${iso})`;
    });
    expect(calls).toHaveLength(2);
    expect(toPrintableRows(rows, iso => `F(${iso})`)[0].date).toBe("F(2026-09-19T00:56:00Z)");
  });

  test("empty history → empty export table", () => {
    expect(toPrintableRows([], () => "D")).toEqual([]);
  });
});

describe("status filter — one partition, two views", () => {
  const rows = [row(1, 92, 88), row(2, null, null), row(3, null, 81)];

  test("the graded arm matches the summary's graded bucket exactly", () => {
    const summary = computeHomeworkSummary(rows);
    expect(filterHomeworkByStatus(rows, "graded")).toHaveLength(summary.graded);
  });

  test("the pending arm matches the summary's pending bucket exactly", () => {
    const summary = computeHomeworkSummary(rows);
    expect(filterHomeworkByStatus(rows, "pending")).toHaveLength(summary.pending);
  });

  test("buckets are disjoint and exhaustive across all + graded + pending", () => {
    const graded = filterHomeworkByStatus(rows, "graded");
    const pending = filterHomeworkByStatus(rows, "pending");
    expect(graded.length + pending.length).toBe(rows.length);
    expect(filterHomeworkByStatus(rows, "all")).toBe(rows);
  });

  test("toggle: clicking the active bucket returns to all; clicking another selects it", () => {
    expect(toggleHomeworkFilter("graded", "graded")).toBe("all");
    expect(toggleHomeworkFilter("graded", "pending")).toBe("pending");
    expect(toggleHomeworkFilter("all", "graded")).toBe("graded");
    expect(toggleHomeworkFilter("pending", "pending")).toBe("all");
  });

  test("toggle: the all card always resets to the unfiltered view", () => {
    expect(toggleHomeworkFilter("all", "all")).toBe("all");
    expect(toggleHomeworkFilter("graded", "all")).toBe("all");
  });
});
