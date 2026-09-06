/**
 * `AdminUserGovernanceFilter` — vocabulary for the admin user directory's
 * governance filter input. Canonicalizes the four lifecycle buckets the
 * admin directory surface supports for narrowing result rows by governance
 * state.
 *
 * This enum is a filter vocabulary only — it is NOT the database column
 * type. The `users` table stores `is_deleted`, `suspended`, and `is_blocked`
 * as separate boolean columns whose composition yields the governance
 * bucket; the service layer resolves an enum member to the matching
 * predicate conjunction at query-construction time.
 *
 * Fail-closed semantics (two-channel split):
 *  - When a transport-tampered value reaches a GraphQL input field typed as
 *    this enum, the malformed input fails VALIDATION before any DB read: the
 *    Pothos enum-coercion layer rejects unknown members at parse time.
 *  - The loose read path (stored / non-schema filter sources) treats an
 *    unrecognized value as "no filter supplied" — the service drops the
 *    filter and returns the unfiltered directory rather than erroring.
 *    This split — drop-on-unknown for the loose read path vs. parse-time
 *    rejection for the strict input path — is intentional and preserves
 *    the directory listing as a forgiving read surface while the
 *    mutation/input channel remains strict.
 */
export enum AdminUserGovernanceFilter {
  Active = "active",
  Suspended = "suspended",
  Blocked = "blocked",
  Deleted = "deleted",
}
