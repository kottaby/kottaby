/**
 * Sessions namespace labels — the student/teacher session-list surfaces and
 * the session lifecycle controls (start / complete / cancel) with their
 * feedback notices.
 *
 * Used by:
 *  - Frontend session-list views for both roles
 *    (`useAppTranslation(Sessions)` with property access).
 *  - Server Components rendering the pages via
 *    `await getTranslations(locale)` → property access.
 *
 * Status-chip keys mirror EVERY `SessionStatus` value — including `disputed`,
 * which is unreachable on the current surfaces — so the chip vocabulary never
 * forks when a status becomes renderable later.
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves + `sessions-namespace.parity.test.ts`
 * runtime belt). Property access only — never call-by-key.
 */
export interface SessionsLabels {
  /** Student-side sessions page title. */
  readonly studentPageTitle: string;
  /** Teacher-side sessions page title. */
  readonly teacherPageTitle: string;
  /** Status-filter dropdown option that clears the status filter. */
  readonly statusFilterAll: string;
  /** List column label — lifecycle status chip. */
  readonly status: string;
  /** List column label — booked session intent (hifz / tajweed / evaluation). */
  readonly intent: string;
  /** List column label — platform fee (rendered verbatim + currency label). */
  readonly fee: string;
  /** List column label — confirmation deadline moment (locale date formatter). */
  readonly deadline: string;
  /** List column label — creation moment (locale date formatter). */
  readonly createdAt: string;
  /** Empty-state heading on the student sessions page. */
  readonly studentEmptyTitle: string;
  /** Empty-state body on the student sessions page. */
  readonly studentEmptyBody: string;
  /** Empty-state heading on the teacher sessions page. */
  readonly teacherEmptyTitle: string;
  /** Empty-state body on the teacher sessions page. */
  readonly teacherEmptyBody: string;
  /** Status chip — scheduled (awaiting start). */
  readonly statusScheduled: string;
  /** Status chip — started (in progress). */
  readonly statusStarted: string;
  /** Status chip — completed. */
  readonly statusCompleted: string;
  /** Status chip — cancelled. */
  readonly statusCancelled: string;
  /** Status chip — disputed (unreachable today; vocabulary-stability pin). */
  readonly statusDisputed: string;
  /** Teacher action — start a scheduled session. */
  readonly startSession: string;
  /** Teacher action — complete a started session. */
  readonly completeSession: string;
  /** Action — cancel a scheduled session (opens the confirm dialog). */
  readonly cancelSession: string;
  /** Cancel-confirm dialog title. */
  readonly cancelConfirmTitle: string;
  /** Cancel-confirm dialog body — what cancelling does to the held fee. */
  readonly cancelConfirmBody: string;
  /** Optional cancel-reason field label. */
  readonly cancelReasonLabel: string;
  /** Optional cancel-reason field placeholder. */
  readonly cancelReasonPlaceholder: string;
  /** Success notice — the session was started. */
  readonly sessionStartedNotice: string;
  /** Success notice — the session was completed. */
  readonly sessionCompletedNotice: string;
  /** Success notice — the session was cancelled. */
  readonly sessionCancelledNotice: string;
  /** Success notice — the held fee was released back to the caller's balance. */
  readonly holdReleasedNotice: string;
  /**
   * Success-equivalent info notice for a duplicate booking replay — the
   * identical request was already accepted, so nothing new was created.
   * Informational tone, never an error treatment.
   */
  readonly duplicateBookingInfo: string;
  /** Generic error-state copy when a session surface fails without a mapped code. */
  readonly genericError: string;
}
