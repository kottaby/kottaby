/**
 * `subscriptionAdmin` namespace labels — the admin student drawer's
 * subscription-management section: the subscriptions list (query-driven
 * rows), the per-status lifecycle actions (active → extend/cancel/
 * change plan; expired → renew; pending/cancelled → none), and the four
 * action dialogs (extend, renew, cancel, change plan).
 *
 * Used by:
 *  - `SubscriptionAdminSection` + the four `subscriptions/dialogs/*Dialog`
 *    components + `useSubscriptionAdminActions` — every visible string on
 *    the surface resolves through `useAppTranslation(SubscriptionAdmin)`.
 *
 * Deliberately NOT duplicated here (single-sourced from their owning
 * namespaces, per reuse-first):
 *  - the dialog dismiss button — `common.cancel`;
 *  - server-denial copy — the wire error messages arrive already
 *    localized by the backend (`errorsTranslations.subscriptionAdmin.*`);
 *    dialogs render the server-localized message verbatim and fall back
 *    to `genericError` only when no message can be extracted.
 *
 * Scope: chrome copy only — plan titles render verbatim; dates render
 * through the shared locale-aware formatter. The only interpolated values
 * are the client-computed action copy (added days, carried/forfeited
 * session counts from the mutation payload); no raw server identifiers
 * ever flow through these labels.
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves — the primary parity gate is the
 * `Translations` interface where both leaf consts are typed
 * `SubscriptionAdminLabels`; the runtime parity suite walks grouped
 * sub-block leaves depth-first so the zero-dead-key discipline stays
 * enforced for nested blocks). Property access only — never call-by-key.
 */
export interface SubscriptionAdminLabels {
  /** Section card title inside the student detail drawer. */
  readonly title: string;

  /** Zero-rows copy (the section's empty state). */
  readonly emptyState: {
    /** Bolded headline. */
    readonly title: string;
    /** Supporting body line. */
    readonly message: string;
  };

  /** Per-row field captions. */
  readonly fields: {
    /** Plan snapshot title caption. */
    readonly plan: string;
    /** Lifecycle status caption. */
    readonly status: string;
    /** Period start caption (rendered through the locale date formatter). */
    readonly start: string;
    /** Period end caption (rendered through the locale date formatter). */
    readonly end: string;
  };

  /**
   * Lifecycle status chip labels — one slot per wire enum member (the
   * view resolves them through an exhaustive `Record<SubscriptionStatus,
   * string>` table; the `suspended` member exists but governance surfaces
   * own it, so this section only ever renders it honestly if it appears).
   */
  readonly status: {
    readonly active: string;
    readonly expired: string;
    readonly pending: string;
    readonly cancelled: string;
    readonly suspended: string;
  };

  /** Per-row action buttons (per-status availability is the view helper's job). */
  readonly actions: {
    /** Extend the active window (active rows). */
    readonly extend: string;
    /** Renew into a fresh period (expired rows). */
    readonly renew: string;
    /** Cancel balance-preserving (active rows). */
    readonly cancel: string;
    /** Change plan within the lane (active rows). */
    readonly changePlan: string;
  };

  readonly extend: {
    /** Dialog title. */
    readonly title: string;
    /** Days input label. */
    readonly daysLabel: string;
    /** Helper line under the days input. */
    readonly daysHelper: string;
    /** Client-side validation failure (whole days must be > 0). */
    readonly daysInvalid: string;
  };

  readonly renew: {
    /** Dialog title. */
    readonly title: string;
    /** Confirm-body copy (what a renewal opens + credits). */
    readonly message: string;
  };

  readonly cancel: {
    /** Dialog title. */
    readonly title: string;
    /** Confirm-body copy (balance-preserving semantics). */
    readonly message: string;
    /** Optional reason input label. */
    readonly reasonLabel: string;
    /**
     * Helper line under the reason input — the live character counter plus
     * the bounded-free-text note, composed HERE so the counter format never
     * drifts between locales (`count` = current raw length, `max` = the
     * UI-seam cap the dialog enforces).
     */
    readonly reasonCounter: (count: number, max: number) => string;
  };

  readonly changePlan: {
    /** Dialog title. */
    readonly title: string;
    /** Confirm-body copy (same-lane re-plan semantics). */
    readonly message: string;
    /** Target-plan select label. */
    readonly planLabel: string;
    /** Empty-options copy — no other active plan credits the same lane. */
    readonly noPlans: string;
    /** Proration result copy — sessions carried onto the new plan (upgrades). */
    readonly carried: (count: number) => string;
    /** Proration result copy — remaining sessions forfeited (downgrades). */
    readonly forfeited: (count: number) => string;
  };

  /** Success toasts handed to the section's feedback snackbar. */
  readonly success: {
    /** Extend landed (added days from the submitted input). */
    readonly extend: (days: number) => string;
    /** Renew landed. */
    readonly renew: string;
    /** Cancel landed. */
    readonly cancel: string;
    /**
     * Plan change landed with nothing to report — the zero arm (a chosen
     * arm whose count is 0, e.g. the idempotent replay that moved nothing)
     * suppresses the counted clause and renders this plain line.
     */
    readonly planChange: string;
    /** Plan change landed on the upgrade arm (carried sessions from the payload). */
    readonly planChangeCarried: (carry: number) => string;
    /** Plan change landed on the downgrade arm (forfeited sessions from the payload). */
    readonly planChangeForfeited: (forfeit: number) => string;
  };

  /** Query-failure alert (title/message/retry — the directory error recipe). */
  readonly errorState: {
    readonly title: string;
    readonly message: string;
    readonly retry: string;
  };

  /** Dialog fallback when no server message can be extracted from a failure. */
  readonly genericError: string;
}
