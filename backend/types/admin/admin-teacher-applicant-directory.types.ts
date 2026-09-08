/**
 * Admin teacher-applicant-directory types — canonical return shapes + filter
 * submit input for the `adminTeacherApplicants` GraphQL directory surface
 * (paginated listing of `applicants` pipeline rows joined to their `users`
 * accounts).
 *
 * The shapes mirror the admin teacher/student directory conventions
 * (`admin-teacher-directory.types.ts`): readonly members end-to-end,
 * governance booleans null-coalesced at the mapper layer, and a page
 * envelope that echoes the resolved pagination so callers can normalize
 * client-side state.
 */

/**
 * `AdminApplicantFiltersSubmitInput` — independent ANDed filters for the
 * applicant-queue listing. Absent or `null` members drop out at the
 * service layer (the directory falls back to the unfiltered listing rather
 * than erroring).
 *
 *  - `search` is a free-text substring applied case-insensitively over the
 *    user's full name and email; the caller MUST escape LIKE wildcards
 *    before composing the pattern (the service layer enforces this).
 *  - `status` filters on the `applicants.status` pipeline vocabulary
 *    (`pending` | `in_evaluation` | `failed` | `passed`). Any other value
 *    REJECTS with a localized `VALIDATION` error at the service layer —
 *    the varchar column has no pgEnum, so the allow-list is enforced here
 *    (exact match when set; absent → all statuses).
 */
export interface AdminApplicantFiltersSubmitInput {
  readonly search?: string | null;
  readonly status?: string | null;
}

/**
 * `AdminApplicantItemReturnType` — one applicant-queue row: the safe
 * `users` columns plus the `applicants` verification-pipeline headline.
 * Pure read; no server-controlled field is mutable through this shape
 * (certification actions live on the admin user-detail surface, never
 * here).
 *
 *  - `status` is the stored pipeline stage. The column is varchar with a
 *    `pending` default; the mapper null-coalesces a missing value to that
 *    default so the queue always renders a stage (corrupt non-null values
 *    pass through verbatim — this is a display read, not an authority).
 *  - `verificationAttempts` null-coalesces to `0` (the column default) so
 *    a missing counter reads as "no attempts yet".
 *  - `lastAttemptAt` / `cooldownUntil` are null-safe pass-throughs — NULL
 *    until the first verification attempt / cooldown grant.
 *  - The governance booleans are null-coalesced from the nullable schema
 *    columns so a missing value reads as `false`.
 */
export interface AdminApplicantItemReturnType {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly country: string | null;
  readonly status: string;
  readonly verificationAttempts: number;
  readonly lastAttemptAt: Date | null;
  readonly cooldownUntil: Date | null;
  readonly isDeleted: boolean;
  readonly suspended: boolean;
  readonly isBlocked: boolean;
  readonly createdAt: Date;
}

/**
 * `AdminApplicantStatusCountsReturnType` — per-status counts for the
 * applicant-queue quick-filter chips. Counts are SEARCH-aware but
 * STATUS-filter-INDEPENDENT: they always describe the whole pipeline
 * matching the current search term (the status filter is deliberately NOT
 * applied to this aggregate), so the chips stay meaningful while a status
 * filter is active — the selected chip shows its share of the searched
 * queue instead of collapsing to the filtered page's total. Rows whose
 * `status` falls outside the canonical vocabulary (`pending` |
 * `in_evaluation` | `failed` | `passed`) are IGNORED — the varchar column
 * is enum-less and the counts are honest to the canonical vocabulary only.
 */
export interface AdminApplicantStatusCountsReturnType {
  readonly pending: number;
  readonly inEvaluation: number;
  readonly failed: number;
  readonly passed: number;
}

/**
 * `AdminApplicantExportEnvelopeReturnType` — export-all envelope for the
 * applicant queue. `rows` carries the first `EXPORT_MAX_ROWS` (1000)
 * filtered rows in the listing's default ordering (newest account first);
 * `total` is the FULL filtered row count (the number the listing query
 * would report across all pages); `truncated` is the honest cap flag —
 * `true` exactly when `total > rows.length`, so callers can warn that the
 * payload is a bounded window rather than the whole queue.
 */
export interface AdminApplicantExportEnvelopeReturnType {
  readonly rows: readonly AdminApplicantItemReturnType[];
  readonly total: number;
  readonly truncated: boolean;
}

/**
 * `AdminApplicantPageReturnType` — paginated directory result envelope.
 * `pageCount` is the ceiling division of `total` over `pageSize`. An
 * out-of-range page yields an empty `items` array with the honest `total`
 * (never clamped, never an error). `page` and `pageSize` are echoed back so
 * callers can normalize client-side pagination state.
 *
 * `statusCounts` carries the search-aware / status-independent per-status
 * totals described on `AdminApplicantStatusCountsReturnType` — computed in
 * the same service call as the listing, over the same search pattern but
 * WITHOUT the status filter.
 */
export interface AdminApplicantPageReturnType {
  readonly items: AdminApplicantItemReturnType[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly statusCounts: AdminApplicantStatusCountsReturnType;
}
