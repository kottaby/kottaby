/**
 * Admin student-directory types — canonical return shapes + filter submit
 * input for the `adminStudents` GraphQL directory surface (paginated listing
 * of `students` role-child rows joined to their `users` accounts, with the
 * linked parent's display identity resolved via a left join).
 *
 * The shapes mirror the admin user-directory conventions
 * (`admin-user.types.ts`): readonly members end-to-end and a page envelope
 * that echoes the resolved pagination so callers can normalize client-side
 * state.
 */

/**
 * `AdminStudentFiltersSubmitInput` — independent ANDed filters for the
 * student directory listing. Absent or `null` members drop out at the
 * service layer (the directory falls back to the unfiltered listing rather
 * than erroring).
 *
 *  - `search` is a free-text substring applied case-insensitively over the
 *    user's full name and email; the caller MUST escape LIKE wildcards
 *    before composing the pattern (the service layer enforces this).
 *  - `hasParent` filters on the `parent_id` link state (`true` → linked
 *    only, `false` → unlinked only, absent → all).
 *  - `language` matches the student's `primary_language` OR
 *    `another_language` case-insensitively (exact match, absent → no
 *    constraint).
 */
export interface AdminStudentFiltersSubmitInput {
  readonly search?: string | null;
  readonly hasParent?: boolean | null;
  readonly language?: string | null;
}

/**
 * `AdminStudentItemReturnType` — one directory row: the safe `users`
 * columns plus the `students` role-child projection (held-balance lanes,
 * trial marker, language preferences) plus the linked parent's display
 * identity. Pure read; no server-controlled field is mutable through this
 * shape.
 *
 *  - The held-balance lanes are null-coalesced from the nullable schema
 *    columns so a missing value reads as `0` (`balance_trial` is NOT NULL
 *    at the schema layer).
 *  - `hasParent` is derived from the `parent_id` link state, never from
 *    caller input.
 *  - `parentName` / `parentEmail` come from the LEFT JOINed parent
 *    `users` row — `null` when the student has no linked parent.
 */
export interface AdminStudentItemReturnType {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly country: string | null;
  readonly balanceHifz: number;
  readonly balanceReviews: number;
  readonly balanceTajweed: number;
  readonly balanceTrial: number;
  readonly trialGrantedAt: Date | null;
  readonly primaryLanguage: string | null;
  readonly anotherLanguage: string | null;
  readonly hasParent: boolean;
  readonly parentName: string | null;
  readonly parentEmail: string | null;
  readonly createdAt: Date;
}

/**
 * `AdminStudentExportEnvelopeReturnType` — export-all envelope for the
 * student directory. `rows` carries the first `EXPORT_MAX_ROWS` (1000)
 * filtered rows in the listing's default ordering (newest account first);
 * `total` is the FULL filtered row count (the number the listing query
 * would report across all pages); `truncated` is the honest cap flag —
 * `true` exactly when `total > rows.length`, so callers can warn that the
 * payload is a bounded window rather than the whole directory.
 */
export interface AdminStudentExportEnvelopeReturnType {
  readonly rows: readonly AdminStudentItemReturnType[];
  readonly total: number;
  readonly truncated: boolean;
}

/**
 * `AdminStudentPageReturnType` — paginated directory result envelope.
 * `pageCount` is the ceiling division of `total` over `pageSize`. An
 * out-of-range page yields an empty `items` array with the honest `total`
 * (never clamped, never an error). `page` and `pageSize` are echoed back so
 * callers can normalize client-side pagination state.
 */
export interface AdminStudentPageReturnType {
  readonly items: AdminStudentItemReturnType[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}
