/**
 * Snapshot CSV download trigger — the DOM boundary of the client-side
 * export (DEV3-022c, Fix-D). The heavy lifting stays in the pure
 * `buildSnapshotCsv` builder; this module only bridges to the browser:
 * build → Blob → object URL → synthetic anchor click → revoke.
 *
 * Client-only by construction (window/URL/document) — imported exclusively
 * from client components behind the header action.
 */

import { buildSnapshotCsv, type SnapshotCsvSnapshot } from "@/frontend/lib/analytics/export-snapshot-csv";
import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

/** Derives the download filename from the snapshot's provenance instant. */
export function snapshotCsvFilename(snapshot: SnapshotCsvSnapshot): string {
  const instant = new Date(snapshot.generatedAt);
  const stamp = instant.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `platform-analytics-${stamp}.csv`;
}

/**
 * Serializes the snapshot with the given labels and hands the bytes to
 * the browser as a `text/csv;charset=utf-8` attachment.
 */
export function downloadSnapshotCsv(snapshot: SnapshotCsvSnapshot, labels: AnalyticsLabels): void {
  const csv = buildSnapshotCsv(snapshot, labels);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = snapshotCsvFilename(snapshot);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
