/**
 * Admin teacher-directory types — canonical return shapes + filter submit
 * input for the `adminTeachers` GraphQL directory surface (paginated listing
 * of `teacher` role-child rows joined to their `users` accounts).
 *
 * The shapes mirror the admin user-directory conventions
 * (`admin-user.types.ts`): readonly members end-to-end, governance booleans
 * null-coalesced at the mapper layer, and a page envelope that echoes the
 * resolved pagination so callers can normalize client-side state.
 */

/**
 * `AdminTeacherFiltersSubmitInput` — independent ANDed filters for the
 * teacher directory listing. Absent or `null` members drop out at the
 * service layer (the directory falls back to the unfiltered listing rather
 * than erroring).
 *
 *  - `search` is a free-text substring applied case-insensitively over the
 *    user's full name and email; the caller MUST escape LIKE wildcards
 *    before composing the pattern (the service layer enforces this).
 *  - `approval` models the two-state `is_approved` flag as a nullable
 *    Boolean: `true` → approved only, `false` → pending only, absent → all.
 *  - `online` / `evaluator` filter on the `is_online` / `is_evaluator`
 *    certification flags (absent → no constraint).
 */
export interface AdminTeacherFiltersSubmitInput {
  readonly search?: string | null;
  readonly approval?: boolean | null;
  readonly online?: boolean | null;
  readonly evaluator?: boolean | null;
}

/**
 * `AdminTeacherItemReturnType` — one directory row: the safe `users`
 * columns plus the `teacher` certification headline. Pure read; no
 * server-controlled field is mutable through this shape.
 *
 *  - `averageRating` is projected from the decimal(3,2) column (Drizzle's
 *    default numeric mode returns a string) as a float — `null` when the
 *    teacher is unrated.
 *  - `subjects` is the defensively-parsed JSON array stored in the
 *    varchar(255) `subjects` column — a corrupt payload degrades to an
 *    empty list, never a resolver error.
 *  - The governance booleans are null-coalesced from the nullable schema
 *    columns so a missing value reads as `false`.
 */
export interface AdminTeacherItemReturnType {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly country: string | null;
  readonly isApproved: boolean;
  readonly isEvaluator: boolean;
  readonly averageRating: number | null;
  readonly isOnline: boolean;
  readonly subjects: readonly string[];
  readonly isDeleted: boolean;
  readonly suspended: boolean;
  readonly isBlocked: boolean;
  readonly createdAt: Date;
}

/**
 * `AdminTeacherExportEnvelopeReturnType` — export-all envelope for the
 * teacher directory. `rows` carries the first `EXPORT_MAX_ROWS` (1000)
 * filtered rows in the listing's default ordering (newest account first);
 * `total` is the FULL filtered row count (the number the listing query
 * would report across all pages); `truncated` is the honest cap flag —
 * `true` exactly when `total > rows.length`, so callers can warn that the
 * payload is a bounded window rather than the whole directory.
 */
export interface AdminTeacherExportEnvelopeReturnType {
  readonly rows: readonly AdminTeacherItemReturnType[];
  readonly total: number;
  readonly truncated: boolean;
}

/**
 * `AdminTeacherPageReturnType` — paginated directory result envelope.
 * `pageCount` is the ceiling division of `total` over `pageSize`. An
 * out-of-range page yields an empty `items` array with the honest `total`
 * (never clamped, never an error). `page` and `pageSize` are echoed back so
 * callers can normalize client-side pagination state.
 */
export interface AdminTeacherPageReturnType {
  readonly items: AdminTeacherItemReturnType[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}
