/**
 * Directory export-all helper tests — the pure `buildExportEnvelope`
 * mapping + the `EXPORT_MAX_ROWS` cap constant shared by the three admin
 * directory export surfaces.
 *
 * Why a dedicated pure tier: `truncated` honesty is the contract that lets
 * the UI warn "this export is a bounded window, not the whole directory".
 * Seeding >1000 rows in the pglite test DB is impractical, so the
 * truncated-true path is pinned HERE against the pure helper (the
 * per-directory service suites pin the truncated-false happy path against
 * the real database through the same helper).
 *
 * Pure unit tier — NO DB, NO server boot, NO disk writes. Runs via the
 * mandated runner:
 *   bun run test/scripts/run-test.ts backend/services/admin/directory-export.helpers.test.ts
 */

import { describe, expect, test } from "bun:test";
import { buildExportEnvelope, EXPORT_MAX_ROWS } from "@/backend/services/admin/directory-export.helpers";

describe("EXPORT_MAX_ROWS", () => {
  test("is the mandated 1000-row export bound", () => {
    expect(EXPORT_MAX_ROWS).toBe(1000);
  });
});

describe("buildExportEnvelope — truncated honesty mapping", () => {
  test("total > rows.length → truncated TRUE (the bounded-window signal)", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const envelope = buildExportEnvelope(rows, 1001);
    expect(envelope.rows).toEqual(rows);
    expect(envelope.total).toBe(1001);
    expect(envelope.truncated).toBe(true);
  });

  test("total === rows.length → truncated FALSE (the whole filtered set is carried)", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const envelope = buildExportEnvelope(rows, 2);
    expect(envelope.rows).toEqual(rows);
    expect(envelope.total).toBe(2);
    expect(envelope.truncated).toBe(false);
  });

  test("empty rows + zero total → truncated FALSE (honest empty export)", () => {
    const envelope = buildExportEnvelope([], 0);
    expect(envelope.rows).toEqual([]);
    expect(envelope.total).toBe(0);
    expect(envelope.truncated).toBe(false);
  });

  test("rows pass through by reference (no defensive copying — the caller owns the mapped array)", () => {
    const rows = [{ id: 7 }];
    const envelope = buildExportEnvelope(rows, 7);
    expect(envelope.rows).toBe(rows);
  });

  test("the cap boundary itself: rows.length === EXPORT_MAX_ROWS with total above it → truncated TRUE", () => {
    const rows = Array.from({ length: EXPORT_MAX_ROWS }, (_, index) => ({ id: index + 1 }));
    const envelope = buildExportEnvelope(rows, EXPORT_MAX_ROWS + 1);
    expect(envelope.rows).toHaveLength(EXPORT_MAX_ROWS);
    expect(envelope.total).toBe(EXPORT_MAX_ROWS + 1);
    expect(envelope.truncated).toBe(true);
  });

  test("the cap boundary itself: rows.length === EXPORT_MAX_ROWS with total === EXPORT_MAX_ROWS → truncated FALSE", () => {
    const rows = Array.from({ length: EXPORT_MAX_ROWS }, (_, index) => ({ id: index + 1 }));
    const envelope = buildExportEnvelope(rows, EXPORT_MAX_ROWS);
    expect(envelope.rows).toHaveLength(EXPORT_MAX_ROWS);
    expect(envelope.total).toBe(EXPORT_MAX_ROWS);
    expect(envelope.truncated).toBe(false);
  });
});
