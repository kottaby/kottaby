/**
 * E2E fixture: clone the seeded admin row into a second admin actor
 * (same password hash → same plaintext credential). Raw SQL over PGlite
 * using the proven pglite-bootstrap open pattern.
 */
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const DB_URL = "file://" + join(process.cwd(), "db/pglite");

async function main() {
  const pg = new PGlite(DB_URL);
  await pg.query("SELECT 1 AS ok");

  const existing = await pg.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM users WHERE email = $1",
    ["admin2@app.local"]
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    console.log("admin2 already exists — continuing");
  } else {
    await pg.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, gender, country)
       SELECT 'Super Admin Two', 'admin2@app.local', '+201000000006', password_hash, 'admin', gender, country
       FROM users WHERE email = $1`,
      ["admin@app.local"]
    );
    console.log("CREATED admin2 (cloned from admin@app.local)");
  }

  const check = await pg.query<{ id: number; email: string; role: string }>(
    "SELECT id, email, role::text AS role FROM users WHERE email = 'admin2@app.local'"
  );
  console.log("VERIFY:", JSON.stringify(check.rows[0]));
  await pg.close();
  process.exit(0);
}

void main();
