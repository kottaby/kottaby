/**
 * Directory export-all helpers — the shared envelope construction + row cap
 * for the three admin directory export surfaces (`adminTeachersExport`,
 * `adminStudentsExport`, `adminTeacherApplicantsExport`).
 *
 * The export queries reuse each directory's `listDirectory` repository read
 * with `limit = EXPORT_MAX_ROWS` / `offset = 0`, so the repo's `{ rows,
 * total }` pair supplies the envelope for free: `total` is the FULL filtered
 * row count (the count the listing query would report across all pages) and
 * `rows` is the bounded first window in the listing's default ordering.
 *
 * `buildExportEnvelope` is a PURE mapping helper — no IO, no clock, no
 * randomness — so the `truncated` honesty contract is unit-testable without
 * a database (seeding >1000 rows is impractical in the pglite test DB).
 */

/**
 * Hard cap on export-all row payloads. Rows beyond the cap are dropped from
 * `rows` while `total` keeps reporting the full filtered count — the
 * `truncated` flag (`total > rows.length`) is the honest signal that the
 * payload is a bounded window rather than the whole directory.
 */
export const EXPORT_MAX_ROWS = 1000;

/**
 * Builds the export-all envelope from a bounded row window + the full
 * filtered total. `truncated` is `true` exactly when `total` exceeds the
 * number of rows actually carried — never when the window covers the whole
 * filtered set. Generic over the per-directory item type; the callers'
 * declared return types (`Admin*ExportEnvelopeReturnType`) are structurally
 * satisfied by the returned shape.
 */
export function buildExportEnvelope<TRow>(
  rows: readonly TRow[],
  total: number
): {
  readonly rows: readonly TRow[];
  readonly total: number;
  readonly truncated: boolean;
} {
  return {
    rows,
    total,
    truncated: total > rows.length,
  };
}
