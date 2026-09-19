/**
 * UpNext namespace labels — the student dashboard's "What's next" card
 * (`/student/dashboard`): the glanceable continuation panel mounted in the
 * student status slot, surfacing the next booked sessions and the pending
 * homework count with direct links into the owning surfaces.
 *
 * Used by:
 *  - `frontend/views/students/dashboard/StudentUpNextCard.tsx`
 *    (`useAppTranslation(UpNext)` with property access).
 *
 * The card is a DISCOVERABILITY affordance — it renders at most a small
 * window of upcoming sessions and never owns lifecycle actions; every row
 * deep-links into the surface that owns the data (`/student/sessions`,
 * `/homework`).
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves + `upNext-namespace.parity.test.ts`
 * runtime belt). Property access only — never call-by-key.
 */
export interface UpNextLabels {
  /** Card heading. */
  readonly upNextTitle: string;
  /** Upcoming-sessions block heading. */
  readonly upcomingHeading: string;
  /** Honest empty line — the student has no scheduled sessions. */
  readonly upcomingEmpty: string;
  /** Mini-row session reference — `{id}` session number. */
  readonly sessionLine: (id: number) => string;
  /** Mini-row meta prefix before the locale-formatted booking date. */
  readonly bookedPrefix: string;
  /** Inline affordance from the empty line into the sessions surface. */
  readonly sessionsCta: string;
  /** Homework block heading. */
  readonly homeworkHeading: string;
  /** Homework row line — localized plural, `{count}` awaiting grade. */
  readonly homeworkPendingLine: (count: number) => string;
  /** Homework row line — nothing awaiting grade (honest zero). */
  readonly homeworkAllGraded: string;
  /** Loading region aria-label (skeleton state). */
  readonly loadingLabel: string;
  /** Error-state body (query failure; retry copy comes from `Common`). */
  readonly errorBody: string;
}
