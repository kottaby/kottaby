import type { SurahJuzRef } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { formatSurahJuzRef } from "@/frontend/views/parent/monitoring/parentMonitoringDisplay";

export interface PrintableHomeworkRow {
  readonly date: string;
  readonly jadidSurahJuz: string | null;
  readonly madiSurahJuz: string | null;
  readonly jadidGrade: number | null;
  readonly madiGrade: number | null;
}

export function buildPrintableHomeworkRows(
  items: ReadonlyArray<{
    readonly createdAt: string;
    readonly jadid: { readonly surahJuz: SurahJuzRef | null; readonly grade: number | null } | null;
    readonly madi: { readonly surahJuz: SurahJuzRef | null; readonly grade: number | null } | null;
  }>,
  locale: string
): readonly PrintableHomeworkRow[] {
  return items.map(item => ({
    date: formatApplicantDate(item.createdAt, locale),
    jadidSurahJuz:
      item.jadid?.surahJuz !== null && item.jadid?.surahJuz !== undefined
        ? formatSurahJuzRef(item.jadid.surahJuz)
        : null,
    madiSurahJuz:
      item.madi?.surahJuz !== null && item.madi?.surahJuz !== undefined ? formatSurahJuzRef(item.madi.surahJuz) : null,
    jadidGrade: item.jadid?.grade ?? null,
    madiGrade: item.madi?.grade ?? null,
  }));
}
