/**
 * `adminTeachers` namespace labels — the read-only admin teacher directory
 * (`/teachers`): page chrome, table headers, status pills, filter bar,
 * pagination, and empty/error/loading states.
 *
 * Used by:
 *  - `app/(dashboard)/teachers/page.tsx` (`generateMetadata`) for the page
 *    title.
 *  - Frontend `AdminTeachersDirectoryContainer` (`useAppTranslation(AdminTeachers)`)
 *    for every visible string on the directory surface.
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
   * Clipboard affordance shared by the directory rows (copy-email quick
   * action + feedback). This directory is read-only — there is no
   * view-profile link.
   */
  readonly quickActions: {
    /** Tooltip for the copy-email icon button. */
    readonly copyEmail: string;
    /** Snackbar shown after the email is copied to the clipboard. */
    readonly emailCopied: string;
  };

  /**
   * Export affordance — serializes the CURRENT page (the rows on screen)
   * to a UTF-8 CSV download; no second fetch ever happens.
   */
  readonly export: {
    /** Button label + accessible name for the export action. */
    readonly exportCsv: string;
    /** Tooltip shown on the DISABLED export (the current page has no rows). */
    readonly exportCsvEmpty: string;
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
