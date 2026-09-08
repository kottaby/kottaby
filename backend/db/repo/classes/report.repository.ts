/**
 * ReportRepository — data-access layer for the `reports` table.
 *
 * Current scope: the MINIMAL read the INV-S8 homework gate needs — the
 * EXISTS-style probe (`existsReportForSession`). The `reports` table's
 * fuller write/list surface belongs to the upcoming report/homework
 * infrastructure (the extension contract is recorded in
 * `docs/sessions/session-lifecycle.md` §10): this file is deliberately
 * NOT the report domain's writer.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - One `namespace` per repository file; the namespace name is the
 *    canonical export `{Entity}Repository`.
 *  - Reads run on the caller's transaction when supplied (Drizzle select)
 *    and fall back to raw parameterized SQL via `queryDb` otherwise —
 *    mirroring `SessionRepository.findById`.
 *  - No business logic, no permission checks, no i18n or logging imports —
 *    the caller decides what `false` means.
 *
 * @see backend/db/schema/classes/reports.ts — the table (one row per
 *      session is the typical pattern; the EXISTS probe is agnostic to
 *      revisions).
 */
import { eq } from "drizzle-orm";
import { queryDb } from "@/backend/db";
import { reports } from "@/backend/db/schema/classes/reports";
import type { DBTransaction } from "@/backend/types";

export namespace ReportRepository {
  /**
   * Answers exactly one question: does ANY `reports` row exist for the
   * session id? The INV-S8 gate's probe — homework may only be created
   * for a session whose teacher already filed a report.
   *
   * Read-only: on the caller's transaction it runs as a Drizzle
   * existence select; standalone it runs as raw parameterized SQL via
   * `queryDb`. `tx` propagation keeps the probe on the caller's atomic
   * unit (a gate evaluated mid-transaction must see the transaction's
   * own writes).
   *
   * @returns `true` when at least one report row references the session,
   *          `false` otherwise (including an unknown session id — the
   *          caller's upstream gates own existence classification).
   */
  export async function existsReportForSession(sessionId: number, tx?: DBTransaction): Promise<boolean> {
    if (tx) {
      const rows = await tx.select({ id: reports.id }).from(reports).where(eq(reports.sessionId, sessionId)).limit(1);
      return rows.length > 0;
    }
    const result = await queryDb<{ id: number }>(`SELECT id FROM reports WHERE session_id = $1 LIMIT 1`, [sessionId]);
    return result.rows.length > 0;
  }
}
