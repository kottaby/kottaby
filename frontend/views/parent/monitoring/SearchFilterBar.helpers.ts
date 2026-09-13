export interface SearchFilterState {
  readonly query: string;
  readonly ratingFilter: number | null;
}

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
      const notesMatch = row.teacherNotes?.toLowerCase().includes(q);
      const dateMatch = dateMatcher(row, q);
      if (!notesMatch && !dateMatch) {
        continue;
      }
    }
    filtered.push(row);
  }
  return filtered;
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
      const dateMatch = dateMatcher(row, q);
      if (!jadiz.includes(q) && !madiz.includes(q) && !dateMatch) {
        continue;
      }
    }
    filtered.push(row);
  }
  return filtered;
}
