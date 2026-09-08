/**
 * directory-url-state — pure parse/serialize contract suite.
 *
 * Locks the shareable-URL contract for the admin directory surfaces:
 * round-trips in BOTH directions, default-OMISSION serialization (an
 * untouched surface shares as the bare empty query), fail-closed parsing
 * (unknown enum values, junk/out-of-range page ints, non-whitelisted
 * sizes → the unshared defaults), page 1-based↔0-based mapping, the tab
 * flag semantics (`?tab=applicants` ALONE must open the queue — the tab is
 * non-default state even when the view underneath is default), and the
 * "URL describes the ACTIVE tab only" composition rule.
 *
 * Zero DOM, zero React, zero network — plain objects stand in for
 * `useSearchParams()`.
 */

import { describe, expect, test } from "bun:test";

import {
  parseApplicantsUrlState,
  parseStudentsUrlState,
  parseTeachersDirectoryUrlState,
  parseTeachersUrlTab,
  type ReadableSearchParams,
  serializeApplicantsUrlState,
  serializeStudentsUrlState,
  serializeTeachersDirectoryUrlState,
  serializeTeachersSurfaceUrlState,
} from "@/frontend/views/admin/directory-url-state";

/** Builds a ReadableSearchParams over a plain record (nulls = absent). */
function params(record: Record<string, string>): ReadableSearchParams {
  return { get: name => (name in record ? record[name] : null) };
}

const EMPTY: ReadableSearchParams = params({});

describe("students URL contract", () => {
  test("empty params parse to the exact unshared defaults", () => {
    expect(parseStudentsUrlState(EMPTY)).toEqual({ q: "", page: 0, pageSize: 10, parent: "", lang: "" });
  });

  test("every key parses on the happy path", () => {
    const state = parseStudentsUrlState(params({ q: "ali", parent: "with", lang: "Quran", page: "3", size: "25" }));
    expect(state).toEqual({ q: "ali", page: 2, pageSize: 25, parent: "WithParent", lang: "Quran" });
  });

  test("page is 1-based in the URL and 0-based in state", () => {
    expect(parseStudentsUrlState(params({ page: "1" })).page).toBe(0);
    expect(parseStudentsUrlState(params({ page: "5" })).page).toBe(4);
  });

  test("fail-closed: junk page, sub-1 page, non-whitelisted size, unknown enums → defaults", () => {
    const state = parseStudentsUrlState(params({ page: "abc", size: "17", parent: "maybe", lang: "  " }));
    expect(state.page).toBe(0);
    expect(state.pageSize).toBe(10);
    expect(state.parent).toBe("");
    // lang passes through verbatim (free-text exact match) — only the ABSENT
    // key maps to "".
    expect(parseStudentsUrlState(EMPTY).lang).toBe("");
  });

  test("page=0 and negative page fall back to the first page", () => {
    expect(parseStudentsUrlState(params({ page: "0" })).page).toBe(0);
    expect(parseStudentsUrlState(params({ page: "-3" })).page).toBe(0);
  });

  test("absurd page clamps to the sanity window (10000th page)", () => {
    expect(parseStudentsUrlState(params({ page: "99999999" })).page).toBe(9999);
  });

  test("serialization omits EVERY default (bare surface → empty query)", () => {
    expect(serializeStudentsUrlState({ q: "", parent: "", lang: "", page: 0, pageSize: 10 })).toBe("");
  });

  test("serialization emits only the non-default keys, in stable order", () => {
    const query = serializeStudentsUrlState({
      q: "ali",
      parent: "Independent",
      lang: "Tajweed",
      page: 4,
      pageSize: 50,
    });
    expect(query).toBe("q=ali&page=5&size=50&parent=independent&lang=Tajweed");
  });

  test("ROUND-TRIP: serialize → parse returns the same applied state", () => {
    const input = { q: "hafiz", parent: "WithParent" as const, lang: "Quran", page: 2, pageSize: 25 };
    const parsed = parseStudentsUrlState(
      params(Object.fromEntries(new URLSearchParams(serializeStudentsUrlState(input))))
    );
    expect(parsed).toEqual({ q: "hafiz", parent: "WithParent", lang: "Quran", page: 2, pageSize: 25 });
  });

  test("URL-encoding round-trips through the serializer (spaces, ampersands)", () => {
    const query = serializeStudentsUrlState({ q: "a & b", parent: "", lang: "", page: 0, pageSize: 10 });
    expect(query).toBe("q=a+%26+b");
    const parsed = parseStudentsUrlState(params(Object.fromEntries(new URLSearchParams(query))));
    expect(parsed.q).toBe("a & b");
  });
});

describe("teachers directory-tab URL contract", () => {
  test("empty params parse to the exact unshared defaults", () => {
    expect(parseTeachersDirectoryUrlState(EMPTY)).toEqual({
      q: "",
      page: 0,
      pageSize: 10,
      approval: "",
      online: "",
      evaluator: "",
    });
  });

  test("every key parses on the happy path", () => {
    const state = parseTeachersDirectoryUrlState(
      params({ q: "sara", approval: "pending", online: "online", evaluator: "no", page: "2", size: "100" })
    );
    expect(state).toEqual({
      q: "sara",
      page: 1,
      pageSize: 100,
      approval: "Pending",
      online: "Online",
      evaluator: "NonEvaluator",
    });
  });

  test("serialization omits defaults and emits the lowercase wire values", () => {
    expect(
      serializeTeachersDirectoryUrlState({
        q: "",
        approval: "Approved",
        online: "",
        evaluator: "",
        page: 0,
        pageSize: 10,
      })
    ).toBe("approval=approved");
    expect(
      serializeTeachersDirectoryUrlState({
        q: "x",
        approval: "",
        online: "Offline",
        evaluator: "NonEvaluator",
        page: 0,
        pageSize: 10,
      })
    ).toBe("q=x&online=offline&evaluator=no");
  });

  test("ROUND-TRIP: serialize → parse preserves the union filters", () => {
    const input = {
      q: "m",
      approval: "Pending" as const,
      online: "Online" as const,
      evaluator: "Evaluator" as const,
      page: 0,
      pageSize: 10,
    };
    const parsed = parseTeachersDirectoryUrlState(
      params(Object.fromEntries(new URLSearchParams(serializeTeachersDirectoryUrlState(input))))
    );
    expect(parsed).toEqual({
      q: "m",
      approval: "Pending",
      online: "Online",
      evaluator: "Evaluator",
      page: 0,
      pageSize: 10,
    });
  });
});

describe("applicants-tab URL contract", () => {
  test("empty params parse to the exact unshared defaults", () => {
    expect(parseApplicantsUrlState(EMPTY)).toEqual({ q: "", page: 0, pageSize: 10, status: "" });
  });

  test("all four canonical status wire values parse verbatim", () => {
    for (const status of ["pending", "in_evaluation", "failed", "passed"] as const) {
      expect(parseApplicantsUrlState(params({ status })).status).toBe(status);
    }
  });

  test("unknown status fails safe to the unfiltered queue", () => {
    expect(parseApplicantsUrlState(params({ status: "approved" })).status).toBe("");
  });

  test("serialization omits defaults, emits status verbatim, round-trips", () => {
    expect(serializeApplicantsUrlState({ q: "", status: "", page: 0, pageSize: 10 })).toBe("");
    const query = serializeApplicantsUrlState({ q: "", status: "in_evaluation", page: 1, pageSize: 10 });
    expect(query).toBe("page=2&status=in_evaluation");
    const parsed = parseApplicantsUrlState(params(Object.fromEntries(new URLSearchParams(query))));
    expect(parsed).toEqual({ q: "", page: 1, pageSize: 10, status: "in_evaluation" });
  });
});

describe("tab + surface composition", () => {
  test("tab parse: absent/junk → teachers; exactly `applicants` → applicants", () => {
    expect(parseTeachersUrlTab(EMPTY)).toBe("teachers");
    expect(parseTeachersUrlTab(params({ tab: "Applicants" }))).toBe("teachers");
    expect(parseTeachersUrlTab(params({ tab: "directory" }))).toBe("teachers");
    expect(parseTeachersUrlTab(params({ tab: "applicants" }))).toBe("applicants");
  });

  test("teachers tab with zero non-default state serializes EMPTY (no tab= key)", () => {
    expect(
      serializeTeachersSurfaceUrlState({
        tab: "teachers",
        directory: { q: "", approval: "", online: "", evaluator: "", page: 0, pageSize: 10 },
        applicants: { q: "", status: "", page: 0, pageSize: 10 },
      })
    ).toBe("");
  });

  test("applicants tab serializes the tab flag EVEN when the queue view is default", () => {
    expect(
      serializeTeachersSurfaceUrlState({
        tab: "applicants",
        directory: { q: "", approval: "", online: "", evaluator: "", page: 0, pageSize: 10 },
        applicants: { q: "", status: "", page: 0, pageSize: 10 },
      })
    ).toBe("tab=applicants");
  });

  test("applicants tab composes tab + queue params in stable order", () => {
    expect(
      serializeTeachersSurfaceUrlState({
        tab: "applicants",
        directory: { q: "", approval: "", online: "", evaluator: "", page: 0, pageSize: 10 },
        applicants: { q: "demo", status: "pending", page: 0, pageSize: 10 },
      })
    ).toBe("tab=applicants&q=demo&status=pending");
  });

  test("the HIDDEN tab's state never serializes (URL describes the visible view)", () => {
    const query = serializeTeachersSurfaceUrlState({
      tab: "applicants",
      directory: { q: "hidden-search", approval: "Pending", online: "", evaluator: "", page: 3, pageSize: 25 },
      applicants: { q: "visible", status: "", page: 0, pageSize: 10 },
    });
    expect(query).toBe("tab=applicants&q=visible");
    expect(query).not.toContain("hidden-search");
    expect(query).not.toContain("approval");
  });

  test("teachers tab non-default state serializes without the tab key", () => {
    expect(
      serializeTeachersSurfaceUrlState({
        tab: "teachers",
        directory: { q: "sara", approval: "", online: "Online", evaluator: "", page: 0, pageSize: 10 },
        applicants: { q: "ignored", status: "failed", page: 0, pageSize: 10 },
      })
    ).toBe("q=sara&online=online");
  });
});
