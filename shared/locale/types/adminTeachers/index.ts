/**
 * `adminTeachers` namespace labels — the admin teachers surface
 * (`/teachers`): a two-tab page (the read-only certified-teacher directory
 * plus the applicant queue) with page chrome, table headers, status pills,
 * filter bar, pagination, and empty/error/loading states.
 *
 * Used by:
 *  - `app/(dashboard)/teachers/page.tsx` (`generateMetadata`) for the page
 *    title.
 *  - Frontend `AdminTeachersSurface` (`useAppTranslation(AdminTeachers)`)
 *    for every visible string on the two-tab surface (directory + applicant
 *    queue).
 *
 * Scope: chrome copy only — admin-authored DATA (teacher names, email
 * addresses, subject names, dates) is rendered verbatim and is NEVER
 * translated. No ICU placeholders are used because no localized string
 * interpolates admin-authored or system-supplied values; interpolated rows
 * are produced by composing label + verbatim data inside the component.
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves — the primary parity gate is the
 * `Translations` interface where both leaf consts are typed
 * `AdminTeachersLabels`; the runtime parity suite walks grouped sub-block
 * leaves depth-first so the zero-dead-key discipline stays enforced for
 * nested blocks). Property access only — never call-by-key.
 */
export interface AdminTeachersLabels {
  /** Directory page heading shown in the page header band. */
  readonly title: string;
  /** Directory page subtitle line under the heading. */
  readonly subtitle: string;

  /**
   * The two-tab surface switcher — the certified-teacher directory (the
   * original /teachers view) and the applicant queue (new registrations
   * awaiting certification).
   */
  readonly tabs: {
    /** Label of the certified-teachers tab. */
    readonly teachersTab: string;
    /** Label of the applicant-queue tab. */
    readonly applicantsTab: string;
  };

  /** Accessible label for the floating scroll-back-to-top affordance. */
  readonly scrollBackToTop: string;

  // NOTE: the `export`/`fields`/`drawer` blocks below extend the directory
  // with the CSV export affordance and the per-row detail drawer.

  /**
   * Table column headers shown in the teacher directory table. The
   * evaluator column header REUSES `statusPills.evaluator` (single
   * vocabulary — no near-duplicate label is minted for the column).
   */
  readonly headers: {
    /** Identity column (avatar + name + email). */
    readonly name: string;
    /** Approval + governance + presence column. */
    readonly status: string;
    /** Average-rating column. */
    readonly rating: string;
    /** Teaching-subjects column (chips with a "+N" overflow chip). */
    readonly subjects: string;
    /** Member-since column (localized timestamp). */
    readonly joined: string;
  };

  /**
   * Applicant-queue column headers for the concepts the directory table
   * never needed (verification attempts + cooldown). The identity, status,
   * and joined columns REUSE the `headers` keys (single vocabulary — no
   * near-duplicates).
   */
  readonly applicantHeaders: {
    /** Verification-attempts count column. */
    readonly attempts: string;
    /** Last verification-attempt timestamp column (honest em-dash when null). */
    readonly lastAttempt: string;
    /** Cooldown-expiry timestamp column (honest em-dash when null). */
    readonly cooldown: string;
    /** Actions column header (the view-profile affordance). */
    readonly actions: string;
  };

  /**
   * Status pill labels — the approval headline pill, the governance pills
   * rendered only when the flag is set, the presence indicator, and the
   * evaluator chip (also reused as the evaluator column header).
   */
  readonly statusPills: {
    /** Teacher account passed certification (approved). */
    readonly approved: string;
    /** Teacher account awaiting certification review. */
    readonly pending: string;
    /** Governance pill — soft-deleted account. */
    readonly deleted: string;
    /** Governance pill — suspended account. */
    readonly suspended: string;
    /** Governance pill — blocked account. */
    readonly blocked: string;
    /** Presence indicator — teacher currently online. */
    readonly online: string;
    /** Presence indicator — teacher currently offline. */
    readonly offline: string;
    /** Evaluator chip label + the evaluator column header. */
    readonly evaluator: string;
  };

  /** Filter bar control labels and the search input placeholder. */
  readonly filters: {
    /** Accessible label for the search input. */
    readonly search: string;
    /** Placeholder shown inside an empty search input. */
    readonly searchPlaceholder: string;
    /** Label for the approval filter select. */
    readonly approval: string;
    /** Label for the online-presence filter select. */
    readonly online: string;
    /** Label for the evaluator filter select. */
    readonly evaluator: string;
    /** "Clear filters" button — restores the directory to its unfiltered state. */
    readonly clear: string;
    /** Refresh button — re-fetches the current page. */
    readonly refresh: string;
  };

  /** Shared/derived filter option labels not covered by the status pills. */
  readonly filterOptions: {
    /** Empty-option label ("no filter") shared by every filter select. */
    readonly all: string;
    /** Evaluator filter option for teachers WITHOUT the evaluator privilege. */
    readonly nonEvaluator: string;
  };

  /**
   * Applicant lifecycle status labels for the queue chips — the wire value
   * is a plain lowercase string (`pending` | `in_evaluation` | `failed` |
   * `passed`); unknown values render verbatim (honest fallback, never a
   * guessed label).
   */
  readonly applicantStatus: {
    /** Applicant registered, certification not started. */
    readonly pending: string;
    /** Applicant is mid evaluation. */
    readonly inEvaluation: string;
    /** Applicant failed the evaluation. */
    readonly failed: string;
    /** Applicant passed the evaluation. */
    readonly passed: string;
    /** Cooldown chip — another verification attempt is temporarily locked. */
    readonly coolingDown: string;
  };

  /** Empty-state copy rendered inside the table body when no rows match. */
  readonly emptyState: {
    /** Empty-state heading line — shown when no teachers exist at all. */
    readonly title: string;
    /** Empty-state body line explaining why no rows are visible (zero teachers). */
    readonly message: string;
    /** Empty-state heading line — shown when filters returned zero matches. */
    readonly filteredTitle: string;
    /** Empty-state body explaining filters narrowed the result set to zero. */
    readonly filteredMessage: string;
    /**
     * Call-to-action shown only on the zero-teachers (unfiltered) state —
     * routes the admin to the users directory, where teacher applicants
     * mid-review live.
     */
    readonly cta: string;
    /**
     * SECONDARY call-to-action on the same zero-teachers (unfiltered) state
     * — flips the surface to the applicant-queue tab when the queue holds
     * at least one applicant (the surface owns the tab state; NO URL
     * navigation). Hidden when the queue is empty so the empty state never
     * offers a dead CTA.
     */
    readonly reviewApplicants: string;
  };

  /** Empty-state copy rendered inside the applicants table body when no rows match. */
  readonly applicantsEmptyState: {
    /** Empty-state heading line — shown when no applicants exist at all. */
    readonly title: string;
    /** Empty-state body line explaining why no rows are visible (zero applicants). */
    readonly message: string;
    /** Empty-state heading line — shown when filters returned zero matches. */
    readonly filteredTitle: string;
    /** Empty-state body explaining filters narrowed the result set to zero. */
    readonly filteredMessage: string;
  };

  /** Error-state copy rendered when the directory query fails. */
  readonly errorState: {
    /** Error-state heading line. */
    readonly title: string;
    /** Error-state body line explaining the failure. */
    readonly message: string;
    /** Retry button label for the error state. */
    readonly retry: string;
  };

  /**
   * Accessible label announced for the loading skeleton region (table body
   * rowgroup while the first page is in flight; mobile skeleton stack).
   */
  readonly loading: string;

  /**
   * Accessible label announced for the applicant-queue loading skeleton
   * region (same recipe as the directory `loading` label).
   */
  readonly applicantsLoading: string;

  /**
   * Clipboard + navigation affordances shared by the directory rows and the
   * detail drawers (copy-email quick action + feedback; the full-profile
   * link routes to the admin user-detail page where certification and
   * governance actions live).
   */
  readonly quickActions: {
    /** Tooltip for the copy-email icon button. */
    readonly copyEmail: string;
    /** Snackbar shown after the email is copied to the clipboard. */
    readonly emailCopied: string;
    /** Full-profile link — routes to the admin user-detail page. */
    readonly viewProfile: string;
    /** Toolbar action — copies the CURRENT shareable view URL (filters,
     * search, tab and page mirrored in the query string). */
    readonly copyLink: string;
    /** Snackbar shown after the view URL is copied to the clipboard. */
    readonly linkCopied: string;
  };

  /**
   * Export affordance — runs the server-side EXPORT-ALL query with the
   * current filter state (the backend caps the dump at its own EXPORT_MAX_ROWS
   * and reports `truncated`) and serializes the returned rows to a UTF-8
   * CSV download. The SAME labels serve both the directory tab and the
   * applicant-queue tab (single export vocabulary for the /teachers
   * surface).
   */
  readonly export: {
    /** Button label + accessible name for the export action. */
    readonly exportCsv: string;
    /** Tooltip shown on the DISABLED export (nothing to export yet). */
    readonly exportCsvEmpty: string;
    /**
     * Success snackbar — the exported row count. ICU template with exactly
     * one `{count}` placeholder, expanded by the consumer (placeholder-name
     * parity is pinned by the namespace parity suite).
     */
    readonly exportedRows: string;
    /**
     * Warning snackbar shown when the backend reported `truncated` — the
     * dump was capped at its first EXPORT_MAX_ROWS (1000) rows; the file
     * still downloads.
     */
    readonly exportTruncated: string;
    /** Error snackbar shown when the export query fails (no download). */
    readonly exportCsvFailed: string;
  };

  /**
   * Field captions for concepts the directory chrome never needed before
   * the CSV export / detail drawer (contact + record identity). Concepts
   * that already have a header key (name, rating, subjects, joined, and
   * every status pill) REUSE those keys — no near-duplicates.
   */
  readonly fields: {
    /** Record identifier caption (CSV column + drawer record section). */
    readonly id: string;
    /** Email address caption. */
    readonly email: string;
    /** Phone number caption. */
    readonly phone: string;
    /** Country caption. */
    readonly country: string;
  };

  /**
   * Detail-drawer chrome — opened by clicking a row/card or through the
   * per-row view-details quick action. The drawer renders only fields the
   * directory item already carries (presentational; no extra queries).
   */
  readonly drawer: {
    /** Drawer window title. */
    readonly detailsTitle: string;
    /** Accessible name of the drawer close button. */
    readonly close: string;
    /** Accessible name of the per-row view-details quick action. */
    readonly viewDetails: string;
    /** Identity section header (avatar + contact rows). */
    readonly sectionIdentity: string;
    /** Account-status section header (pills row). */
    readonly sectionStatus: string;
    /** Academic section header (rating + subjects). */
    readonly sectionAcademic: string;
    /** Record section header (identifier). */
    readonly sectionRecord: string;
  };

  /**
   * Pagination control labels — the block mirrors the shared
   * `DirectoryPagination` contract consumed from the admin-users directory
   * (the same keys, structurally typed).
   */
  readonly pagination: {
    /** "Page" word in the page-of-total counter. */
    readonly page: string;
    /**
     * Leading word of the range caption, composed as
     * `${showingPrefix} ${from}–${to} ${of} ${total}` in the component.
     */
    readonly showingPrefix: string;
    /** "of" word in the page-of-total counter. */
    readonly of: string;
    /** "Total" word on the total-count row. */
    readonly total: string;
    /** Next-page button label. */
    readonly next: string;
    /** Previous-page button label. */
    readonly previous: string;
    /** Page-size selector label. */
    readonly pageSize: string;
  };
}
