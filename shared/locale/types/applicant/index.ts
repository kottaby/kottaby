/**
 * Applicant namespace labels — teacher-applicant lifecycle status card and
 * verification-attempt surfaces.
 *
 * Used by:
 *  - Frontend `ApplicantStatusCard` (`useAppTranslation(Applicant)`) for the
 *    teacher-dashboard status-card branches (visual state matrix:
 *    pending / in-evaluation / failed+active-cooldown / failed+eligible /
 *    certified-passed).
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves + `applicant-namespace.parity.test.ts`
 * runtime belt). Property access only — never call-by-key.
 */
export interface ApplicantLabels {
  /** Status chip — application awaiting purchase of the verification plan (pending). */
  readonly statusPending: string;
  /** Status chip — under evaluation. */
  readonly statusInEvaluation: string;
  /** Status chip — evaluation failed; cooldown affordances below carry the next step. */
  readonly statusFailed: string;
  /** Status chip — verification passed (paired with `certifiedSummary`). */
  readonly statusPassed: string;
  /** Dashboard status-card heading. */
  readonly statusCardTitle: string;
  /** Pending-branch prompt — awaiting purchase of a verification session (the purchase flow itself lives outside this namespace). */
  readonly pendingPrompt: string;
  /** Attempts-count row label on the status card. */
  readonly attemptCountLabel: string;
  /**
   * Failed+active-cooldown line rendering the re-application expiry moment.
   * ICU placeholder `{cooldownUntil}` is expanded by the consumer into a
   * locale-formatted timestamp; the placeholder NAME is pinned
   * identical across both locales by the parity test.
   */
  readonly cooldownExpiryLine: string;
  /** Failed+expired-cooldown affordance copy shown beside the enabled re-apply CTA. */
  readonly eligibleToReapply: string;
  /** Enabled re-apply call-to-action button label. */
  readonly reapplyCta: string;
  /** Certified summary copy for the passed branch — never pending/evaluation copy (cross-branch copy must not leak). */
  readonly certifiedSummary: string;
  /**
   * Informational teaching-surfaces hint rendered ONLY by the single-null
   * certified branch (the "shortcut to main teaching surfaces" state).
   * Pure copy — mentions no route; navigation itself stays in
   * the existing dashboard sidebar.
   */
  readonly certifiedSurfacesHint: string;
  /** In-evaluation progress hint rendered beneath the attempts counter. */
  readonly inEvaluationHint: string;
  /** Notification title emitted to the newly certified teacher when an admin completes the certification directly. */
  readonly coldStartCertifiedTitle: string;
  /** Notification body emitted alongside `coldStartCertifiedTitle` — pure copy, no identifiers. */
  readonly coldStartCertifiedBody: string;
  /** Purchase-dialog heading over the verification-plan confirmation. */
  readonly purchaseDialogTitle: string;
  /** Purchase-dialog supporting description beneath the heading. */
  readonly purchaseDialogDescription: string;
  /**
   * Composite plan descriptor rendered inside the purchase dialog. The
   * placeholder ORDER (title, price, currency, sessions, days) is pinned
   * identical across BOTH locales by the parity suite; every value comes
   * from the resolved plan-catalog row — never a client-side default.
   */
  readonly purchasePlanLine: (title: string, price: string, currency: string, sessions: number, days: number) => string;
  /** Card-level purchase entry CTA on the pending prompt panel. */
  readonly purchaseCta: string;
  /** Purchase-dialog confirm CTA. */
  readonly purchaseConfirmCta: string;
  /** Purchase-dialog cancel CTA. */
  readonly purchaseCancelCta: string;
  /** Success notice shown after the purchase mutation completes. */
  readonly purchaseSuccess: string;
  /** Generic localized failure notice for every non-cooldown purchase denial — server messages never leak through it. */
  readonly purchaseGenericError: string;
  /** Info notice for an idempotent duplicate replay — the request was already received. */
  readonly purchaseDuplicateInfo: string;
}
