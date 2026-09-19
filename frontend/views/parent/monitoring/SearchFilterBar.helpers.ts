export interface SearchFilterState {
  readonly query: string;
  readonly ratingFilter: number | null;
  readonly sort: SortMode;
}

export type SortMode = "dateDesc" | "dateAsc" | "ratingDesc" | "ratingAsc";

export const DEFAULT_SORT: SortMode = "dateDesc";

interface FilterableReportRow {
  readonly teacherNotes: string | null;
  readonly studentRatingByTeacher: number | null;
  readonly sessionStartedAt: string | null;
  readonly createdAt: string;
}

export function filterReportRows<T extends FilterableReportRow>(
  rows: readonly T[],
  state: SearchFilterState,
  dateMatcher: (row: T, query: string) => boolean
): readonly T[] {
  const q = state.query.toLowerCase().trim();
  const filtered: T[] = [];
  for (const row of rows) {
    if (state.ratingFilter !== null && row.studentRatingByTeacher !== state.ratingFilter) {
      continue;
    }
    if (q !== "") {
      const notesMatch = row.teacherNotes?.toLowerCase().includes(q) ?? false;
      // Performance optimization: Short-circuit dateMatcher when notes already match
      // to avoid calling expensive Intl date formatting per row.
      const dateMatch = notesMatch ? true : dateMatcher(row, q);
      if (!dateMatch) {
        continue;
      }
    }
    filtered.push(row);
  }
  return sortRows(filtered, state.sort);
}

interface FilterableHomeworkRow {
  readonly createdAt: string;
  readonly jadid: {
    readonly surahJuz: string | null;
    readonly fromAyah: number | null;
    readonly toAyah: number | null;
    readonly grade: number | null;
  } | null;
  readonly madi: {
    readonly surahJuz: string | null;
    readonly fromAyah: number | null;
    readonly toAyah: number | null;
    readonly grade: number | null;
  } | null;
}

export function filterHomeworkRows<T extends FilterableHomeworkRow>(
  rows: readonly T[],
  state: SearchFilterState,
  dateMatcher: (row: T, query: string) => boolean
): readonly T[] {
  const q = state.query.toLowerCase().trim();
  const filtered: T[] = [];
  for (const row of rows) {
    if (q !== "") {
      const jadiz = row.jadid?.surahJuz?.toLowerCase() ?? "";
      const madiz = row.madi?.surahJuz?.toLowerCase() ?? "";
      const textMatch = jadiz.includes(q) || madiz.includes(q);
      // Performance optimization: Short-circuit dateMatcher when surah text already matches
      // to avoid calling expensive Intl date formatting per row.
      const dateMatch = textMatch ? true : dateMatcher(row, q);
      if (!dateMatch) {
        continue;
      }
    }
    filtered.push(row);
  }
  return sortRows(filtered, state.sort);
}

function sortRows<
  T extends {
    readonly sessionStartedAt?: string | null;
    readonly createdAt: string;
    readonly studentRatingByTeacher?: number | null;
    readonly jadid?: { readonly grade: number | null } | null;
    readonly madi?: { readonly grade: number | null } | null;
  },
>(rows: readonly T[], mode: SortMode): readonly T[] {
  if (rows.length <= 1) {
    return rows;
  }
  const sorted = [...rows];
  if (mode === "dateDesc") {
    sorted.sort((a, b) => compareDates(b, a));
  } else if (mode === "dateAsc") {
    sorted.sort((a, b) => compareDates(a, b));
  } else if (mode === "ratingDesc") {
    sorted.sort((a, b) => ratingValue(b) - ratingValue(a));
  } else {
    sorted.sort((a, b) => ratingValue(a) - ratingValue(b));
  }
  return sorted;
}

function compareDates(
  a: { readonly sessionStartedAt?: string | null; readonly createdAt: string },
  b: { readonly sessionStartedAt?: string | null; readonly createdAt: string }
): number {
  const aDate = a.sessionStartedAt ?? a.createdAt;
  const bDate = b.sessionStartedAt ?? b.createdAt;
  return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
}

function ratingValue(row: {
  readonly studentRatingByTeacher?: number | null;
  readonly jadid?: { readonly grade: number | null } | null;
  readonly madi?: { readonly grade: number | null } | null;
}): number {
  const rating = row.studentRatingByTeacher;
  if (rating !== null && rating !== undefined) {
    return rating;
  }
  return row.jadid?.grade ?? row.madi?.grade ?? 0;
}
