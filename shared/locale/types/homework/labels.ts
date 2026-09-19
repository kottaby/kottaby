/**
 * Homework namespace labels — the student homework-history surface
 * (`/homework`): the summary strip, the assignment list and its rows.
 *
 * Used by:
 *  - `frontend/views/student/homework/HomeworkContainer.tsx`
 *    (`useAppTranslation(Homework)` with property access).
 *  - Server Components rendering the page via
 *    `await getTranslations(locale)` → property access.
 *
 * Track terminology is deliberately ALIGNED with the parent-monitoring
 * namespace (`Jadid (new memorization)` / `Madi (revision)` and the
 * "none assigned" state) so the two homework surfaces — parent portal
 * tab and student page — speak one vocabulary, but the keys stay
 * namespace-local (no cross-namespace coupling).
 *
 * Dates expand through the shared `formatApplicantDate` formatters and
 * the session number renders as a bare `#<id>` — neither is locale COPY.
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves + `homework-namespace.parity.test.ts`
 * runtime belt). Property access only — never call-by-key.
 */
export interface HomeworkLabels {
  /** Homework page <title>/header. */
  readonly pageTitle: string;
  /** List section heading above the assignment rows. */
  readonly listHeading: string;
  /** Summary strip card — total homework rows (all rows, graded or not). */
  readonly summaryTotalLabel: string;
  /** Summary strip card — rows with at least one recorded grade. */
  readonly summaryGradedLabel: string;
  /** Summary strip card — rows with no recorded grade on either track. */
  readonly summaryPendingLabel: string;
  /** Jadid (new-memorization) track block heading. */
  readonly trackJadid: string;
  /** Madi (revision) track block heading. */
  readonly trackMadi: string;
  /** Track-block body when that track carries no assignment. */
  readonly trackNoneAssigned: string;
  /** Grade row label inside a track block. */
  readonly gradeLabel: string;
  /** Row meta prefix before the locale-formatted assignment date. */
  readonly assignedPrefix: string;
  /** Row meta line naming the owning session — `{id}` session number. */
  readonly sessionLine: (id: number) => string;
  /** List count line — localized plural handled per locale. */
  readonly countLine: (count: number) => string;
  /** Empty-state heading — the student has no homework rows at all. */
  readonly emptyTitle: string;
  /** Empty-state body — when homework appears and where it comes from. */
  readonly emptyBody: string;
  /** Error-state heading (query failure). */
  readonly errorTitle: string;
  /** Error-state body. */
  readonly errorBody: string;
  /** Loading region aria-label (skeleton state). */
  readonly loadingLabel: string;
}
