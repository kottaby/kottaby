/**
 * UI audit seed: creates one user per role + demo billing plans
 * so every implemented page has realistic content to render.
 *
 * Run AFTER scripts/pglite-bootstrap.ts on a fresh PGlite dir.
 * Usage: bun run scripts/ui-audit-seed.ts
 */
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { hash } from "bcryptjs";

const DB_URL = "file://" + join(process.cwd(), "db/pglite");

const DEMO_PASSWORD = "Password123!";

async function upsertUser(
  pg: PGlite,
  opts: { email: string; fullName: string; role: string; passwordHash: string; locale?: string }
): Promise<number> {
  const existing = await pg.query<{ id: number }>("SELECT id FROM users WHERE email = $1", [opts.email]);
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  const now = new Date();
  const res = await pg.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, full_name, role, is_deleted, suspended, is_blocked, locale, created_at, updated_at)
     VALUES ($1, $2, $3, $4, false, false, false, $5, $6, $6)
     RETURNING id`,
    [opts.email, opts.passwordHash, opts.fullName, opts.role, opts.locale ?? "en", now]
  );
  return res.rows[0].id;
}

async function main() {
  const pg = new PGlite(DB_URL);
  await pg.query("SELECT 1 AS ok");
  console.log("[ui-audit-seed] connected");

  const adminHash = await hash("adminpassword123", 12);
  const demoHash = await hash(DEMO_PASSWORD, 12);

  // --- Users, one per role ---
  const adminId = await upsertUser(pg, {
    email: "admin@app.local",
    fullName: "Super Admin",
    role: "admin",
    passwordHash: adminHash,
  });
  const teacherId = await upsertUser(pg, {
    email: "teacher@demo.local",
    fullName: "Demo Teacher",
    role: "teacher",
    passwordHash: demoHash,
  });
  const studentId = await upsertUser(pg, {
    email: "student@demo.local",
    fullName: "Demo Student",
    role: "student",
    passwordHash: demoHash,
  });
  const parentId = await upsertUser(pg, {
    email: "parent@demo.local",
    fullName: "Demo Parent",
    role: "parent",
    passwordHash: demoHash,
  });
  console.log(`[ui-audit-seed] users: admin=${adminId} teacher=${teacherId} student=${studentId} parent=${parentId}`);

  // --- Role-detail rows ---
  const now = new Date();
  await pg.query(
    `INSERT INTO students (id, handshake_code, balance_trial, created_at, updated_at)
     SELECT $1, $2, 0, $3, $3 WHERE NOT EXISTS (SELECT 1 FROM students WHERE id = $1)`,
    [studentId, `HS-${studentId}${Date.now().toString(36).toUpperCase()}`, now]
  );
  await pg.query(
    `INSERT INTO applicants (id, status, created_at, updated_at)
     SELECT $1, 'passed', $2, $2 WHERE NOT EXISTS (SELECT 1 FROM applicants WHERE id = $1)`,
    [teacherId, now]
  );
  await pg.query(
    `INSERT INTO parents (id, created_at, updated_at)
     SELECT $1, $2, $2 WHERE NOT EXISTS (SELECT 1 FROM parents WHERE id = $1)`,
    [parentId, now]
  );
  console.log("[ui-audit-seed] role-detail rows ensured");

  // --- Billing plans ---
  const planCount = await pg.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM plans");
  if (planCount.rows[0].n === 0) {
    const plans: Array<[string, number, string, number, boolean]> = [
      ["Bronze — 8 Sessions", 8, "480.00", 30, true],
      ["Silver — 12 Sessions", 12, "660.00", 30, true],
      ["Gold — 20 Sessions", 20, "1000.00", 45, true],
      ["Legacy Basic (retired)", 4, "220.00", 30, false],
    ];
    for (const [title, sessionCount, price, intervalDays, isActive] of plans) {
      await pg.query(
        `INSERT INTO plans (title, session_count, price, currency, interval_days, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'EGP', $4, $5, $6, $6)`,
        [title, sessionCount, price, intervalDays, isActive, now]
      );
    }
    console.log(`[ui-audit-seed] seeded ${plans.length} plans`);
  } else {
    console.log(`[ui-audit-seed] plans already present (${planCount.rows[0].n})`);
  }

  // --- Wallet for teacher (wallet page needs content) ---
  try {
    await pg.query(
      `INSERT INTO wallet (teacher_id, balance, created_at, updated_at)
       SELECT $1, 1500.00, $2, $2 WHERE NOT EXISTS (SELECT 1 FROM wallet WHERE teacher_id = $1)`,
      [teacherId, now]
    );
    console.log("[ui-audit-seed] teacher wallet ensured");
  } catch (e) {
    console.warn(`[ui-audit-seed] wallet skipped: ${String(e).slice(0, 120)}`);
  }

  // --- Notification rows (notifications page) ---
  try {
    await pg.query(
      `INSERT INTO notifications (user_id, type, title, body, is_read, created_at)
       SELECT $1, 'system_broadcast', 'Welcome to Kottaby', 'Your account is ready. Explore your dashboard to get started.', false, $2
       WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = $1)`,
      [studentId, now]
    );
    await pg.query(
      `INSERT INTO notifications (user_id, type, title, body, is_read, created_at)
       SELECT $1, 'system_broadcast', 'New plan published', 'The Silver plan is now available for subscription.', true, $2
       WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = $1)`,
      [adminId, now]
    );
    console.log("[ui-audit-seed] notifications ensured");
  } catch (e) {
    console.warn(`[ui-audit-seed] notifications skipped: ${String(e).slice(0, 120)}`);
  }

  const summary = await pg.query<{ email: string; role: string }>(
    "SELECT email, role::text AS role FROM users ORDER BY id"
  );
  console.log("[ui-audit-seed] FINAL:", JSON.stringify(summary.rows));
  await pg.close();
  process.exit(0);
}

main().catch(e => {
  console.error("[ui-audit-seed] FATAL:", e);
  process.exit(1);
});
