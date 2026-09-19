/**
 * One-off: regenerate the demo student's handshake_code in the canonical
 * `KSB-<8 hex>` shape (mirrors user-provisioning.helpers generateHandshakeCode).
 * Run while the dev server is STOPPED.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite("file://" + join(process.cwd(), "db/pglite"));
const code = `KSB-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 8)}`;
const r = await pg.query(
  "UPDATE students SET handshake_code = $1, updated_at = now() WHERE id = (SELECT id FROM students LIMIT 1) RETURNING id, handshake_code",
  [code]
);
console.log("updated:", JSON.stringify(r.rows[0]));
await pg.close();
