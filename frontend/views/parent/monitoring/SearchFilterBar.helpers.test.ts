import { describe, expect, it } from "bun:test";
import { filterHomeworkRows, filterReportRows, type SearchFilterState } from "./SearchFilterBar.helpers";

describe("SearchFilterBar.helpers", () => {
  it("filters report rows correctly and short-circuits dateMatcher when notes match", () => {
    let dateMatcherCalls = 0;
    const dateMatcher = (_row: unknown, _q: string) => {
      dateMatcherCalls++;
      return false;
    };

    const rows = [
      {
        teacherNotes: "excellent progress in recitation",
        studentRatingByTeacher: 5,
        sessionStartedAt: "2026-01-01T10:00:00Z",
        createdAt: "2026-01-01T10:00:00Z",
      },
      {
        teacherNotes: "needs practice",
        studentRatingByTeacher: 3,
        sessionStartedAt: "2026-01-02T10:00:00Z",
        createdAt: "2026-01-02T10:00:00Z",
      },
    ];

    const state: SearchFilterState = {
      query: "excellent",
      ratingFilter: null,
      sort: "dateDesc",
    };

    const result = filterReportRows(rows, state, dateMatcher);
    expect(result).toHaveLength(1);
    expect(result[0].teacherNotes).toBe("excellent progress in recitation");
    // dateMatcher should not be called for row 0 because teacherNotes matched!
    expect(dateMatcherCalls).toBe(1);
  });

  it("filters homework rows correctly and short-circuits dateMatcher when surah matches", () => {
    let dateMatcherCalls = 0;
    const dateMatcher = (_row: unknown, _q: string) => {
      dateMatcherCalls++;
      return false;
    };

    const rows = [
      {
        createdAt: "2026-01-01T10:00:00Z",
        jadid: { surahJuz: "Al-Baqarah", fromAyah: 1, toAyah: 10, grade: 5 },
        madi: null,
      },
      {
        createdAt: "2026-01-02T10:00:00Z",
        jadid: null,
        madi: { surahJuz: "Al-Imran", fromAyah: 1, toAyah: 20, grade: 4 },
      },
    ];

    const state: SearchFilterState = {
      query: "Baqarah",
      ratingFilter: null,
      sort: "ratingDesc",
    };

    const result = filterHomeworkRows(rows, state, dateMatcher);
    expect(result).toHaveLength(1);
    expect(result[0].jadid?.surahJuz).toBe("Al-Baqarah");
    // dateMatcher should not be called for row 0 because jadid surah matched!
    expect(dateMatcherCalls).toBe(1);
  });

  it("sorts rows correctly by date and rating", () => {
    const rows = [
      {
        teacherNotes: "note A",
        studentRatingByTeacher: 3,
        sessionStartedAt: "2026-01-01T10:00:00Z",
        createdAt: "2026-01-01T10:00:00Z",
      },
      {
        teacherNotes: "note B",
        studentRatingByTeacher: 5,
        sessionStartedAt: "2026-01-03T10:00:00Z",
        createdAt: "2026-01-03T10:00:00Z",
      },
      {
        teacherNotes: "note C",
        studentRatingByTeacher: 4,
        sessionStartedAt: "2026-01-02T10:00:00Z",
        createdAt: "2026-01-02T10:00:00Z",
      },
    ];

    const stateRatingDesc: SearchFilterState = { query: "", ratingFilter: null, sort: "ratingDesc" };
    const resRatingDesc = filterReportRows(rows, stateRatingDesc, () => false);
    expect(resRatingDesc.map(r => r.studentRatingByTeacher)).toEqual([5, 4, 3]);

    const stateDateAsc: SearchFilterState = { query: "", ratingFilter: null, sort: "dateAsc" };
    const resDateAsc = filterReportRows(rows, stateDateAsc, () => false);
    expect(resDateAsc.map(r => r.teacherNotes)).toEqual(["note A", "note C", "note B"]);
  });
});
