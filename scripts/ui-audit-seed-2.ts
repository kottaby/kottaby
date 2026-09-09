/**
 * Round-2 data enrichment for the UI audit:
 *  - teacher role-child row (is_approved) for the demo teacher
 *  - wallet row with balance + earnings
 *  - two ledger rows (earning completed / withdrawal pending)
 *
 * Safe to re-run (idempotent). Run while the dev server is STOPPED
 * (PGlite data dir is single-process).
 * Usage: bun run scripts/ui-audit-seed-2.ts
 */
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const DB_URL = "file://" + join(process.cwd(), "db/pglite");

async function main() {
  const pg = new PGlite(DB_URL);
  await pg.query("SELECT 1 AS ok");
  const now = new Date();

  const teacher = await pg.query<{ id: number }>("SELECT id FROM users WHERE email = $1", ["teacher@demo.local"]);
  const teacherId = teacher.rows[0]?.id;
  if (!teacherId) throw new Error("demo teacher user not found — run ui-audit-seed.ts first");

  await pg.query(
    `INSERT INTO teacher (id, is_approved, is_online, subjects, created_at, updated_at)
     SELECT $1, true, false, '["quran","tajweed"]', $2, $2
     WHERE NOT EXISTS (SELECT 1 FROM teacher WHERE id = $1)`,
    [teacherId, now]
  );
  console.log("[seed-2] teacher row ensured");

  await pg.query(
    `INSERT INTO wallet (teacher_id, balance, total_earning, created_at, updated_at)
     SELECT $1, 1500.00, 4200.00, $2, $2
     WHERE NOT EXISTS (SELECT 1 FROM wallet WHERE teacher_id = $1)`,
    [teacherId, now]
  );
  console.log("[seed-2] wallet row ensured");

  const ledgerCount = await pg.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM teacher_transaction WHERE wallet_id = (SELECT id FROM wallet WHERE teacher_id = $1)",
    [teacherId]
  );
  if (ledgerCount.rows[0].n === 0) {
    await pg.query(
      `INSERT INTO teacher_transaction (wallet_id, description, amount, type, status, created_at)
       SELECT w.id, 'أرباح جلسات — دفعة أولى', 2400.00, 'earning'::transaction_type,
              'completed'::transaction_status, $2::timestamp
       FROM wallet w WHERE w.teacher_id = $1`,
      [teacherId, now]
    );
    await pg.query(
      `INSERT INTO teacher_transaction (wallet_id, description, amount, type, status, created_at)
       SELECT w.id, 'طلب سحب', 900.00, 'withdrawal'::transaction_type,
              'pending'::transaction_status, $2::timestamp
       FROM wallet w WHERE w.teacher_id = $1`,
      [teacherId, now]
    );
    console.log("[seed-2] 2 ledger rows seeded");
  } else {
    console.log(`[seed-2] ledger already has ${ledgerCount.rows[0].n} rows`);
  }

  const check = await pg.query(
    "SELECT (SELECT COUNT(*)::int FROM teacher) AS teachers, (SELECT COUNT(*)::int FROM wallet) AS wallets"
  );
  console.log("[seed-2] FINAL:", JSON.stringify(check.rows[0]));
  await pg.close();
  process.exit(0);
}

main().catch(e => {
  console.error("[seed-2] FATAL:", e);
  process.exit(1);
});
