/**
 * csv-download — the browser download recipe shared by the admin teachers
 * surfaces' server-side export flows: serialize the envelope rows through
 * the pure CSV builders, then hand the string to a `Blob` + temporary
 * anchor click (revoked on the next macrotask).
 */

/** Downloads `csv` as `filename` through a Blob + temporary anchor click. */
export function downloadCsvFile(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
