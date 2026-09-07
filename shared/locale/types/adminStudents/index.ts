/**
 * `adminStudents` namespace labels — the read-only admin student directory
 * (`/students`): page chrome, table headers, session-balance badges,
 * parent/languages cells, filter bar, pagination, and empty/error/loading
 * states.
 *
 * Used by:
 *  - `app/(dashboard)/students/page.tsx` (`generateMetadata`) for the page
 *    title.
 *  - Frontend `AdminStudentsDirectoryContainer` (`useAppTranslation(AdminStudents)`)
 *    for every visible string on the directory surface.
 *
 * Scope: chrome copy only — admin-authored DATA (student names, email
 * addresses, language names, dates) is rendered verbatim and is NEVER
 * translated. No ICU placeholders are used because no localized string
 * interpolates admin-authored or system-supplied values; interpolated rows
 * are produced by composing label + verbatim data inside the component.
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves — the primary parity gate is the
 * `Translations` interface where both leaf consts are typed
 * `AdminStudentsLabels`; the runtime parity suite walks grouped sub-block
 * leaves depth-first so the zero-dead-key discipline stays enforced for
 * nested blocks). Property access only — never call-by-key.
 */
export interface AdminStudentsLabels {
  /** Directory page heading shown in the page header band. */
  readonly title: string;
  /** Directory page subtitle line under the heading. */
  readonly subtitle: string;

  /** Table column headers shown in the student directory table. */
  readonly headers: {
    /** Identity column (avatar + name + email). */
    readonly name: string;
    /** Session-balance column (four compact badges). */
    readonly balances: string;
    /** Parent column (parent identity or the independent marker). */
    readonly parent: string;
    /** Languages column (primary + another chips). */
    readonly languages: string;
    /** Free-trial column (granted badge + timestamp, or the em-dash). */
    readonly trial: string;
    /** Member-since column (localized timestamp). */
    readonly joined: string;
  };

  /**
   * Session-balance badge labels — composed with the verbatim count inside
   * the component (`${label} ${count}`). The four badges render in the
   * backend's canonical lane order (hifz, reviews, tajweed, trial).
   */
  readonly balances: {
    /** Hifz session-lane balance. */
    readonly hifz: string;
    /** Reviews session-lane balance. */
    readonly reviews: string;
    /** Tajweed session-lane balance. */
    readonly tajweed: string;
    /** Trial session-lane balance. */
    readonly trial: string;
  };

  /** Parent-link labels — the select options and the independent marker. */
  readonly parentLabels: {
    /** Student linked to a parent (filter option). */
    readonly withParent: string;
    /** Student with no parent link — marker chip in the parent column. */
    readonly noParent: string;
  };

  /** Filter bar control labels and the search input placeholder. */
  readonly filters: {
    /** Accessible label for the search input. */
    readonly search: string;
    /** Placeholder shown inside an empty search input. */
    readonly searchPlaceholder: string;
    /** Label for the parent-link filter select. */
    readonly hasParent: string;
    /** Label for the language filter input (exact-match, applied on Enter). */
    readonly language: string;
    /** Apply button for the language filter input. */
    readonly apply: string;
    /** "Clear filters" button — restores the directory to its unfiltered state. */
    readonly clear: string;
    /** Refresh button — re-fetches the current page. */
    readonly refresh: string;
  };

  /** Shared/derived filter option labels not covered by the parent labels. */
  readonly filterOptions: {
    /** Empty-option label ("no filter") shared by every filter select. */
    readonly all: string;
  };

  /** Trial chip label shown above the granted timestamp in the trial column. */
  readonly trialBadge: string;

  /** Empty-state copy rendered inside the table body when no rows match. */
  readonly emptyState: {
    /** Empty-state heading line — shown when no students exist at all. */
    readonly title: string;
    /** Empty-state body line explaining why no rows are visible (zero students). */
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
