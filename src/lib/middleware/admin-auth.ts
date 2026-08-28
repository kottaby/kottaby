import { NextResponse } from "next/server";

/**
 * Simple admin authorization check.
 *
 * In a production system, this would verify a JWT/session token and check
 * the user's role. For this sandbox re-implementation, we use a simple
 * header-based check (X-Admin-Token) that can be replaced with proper
 * auth (NextAuth, Clerk, etc.) in production.
 *
 * The token is stored in the ADMIN_TOKEN env var. If not set, admin
 * endpoints are open (development mode only).
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

export function requireAdmin(req: Request): NextResponse | null {
  // If no ADMIN_TOKEN is configured, allow access (dev mode)
  if (!ADMIN_TOKEN) return null;

  const authHeader = req.headers.get("x-admin-token");
  if (authHeader !== ADMIN_TOKEN) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED", error: "Admin authorization required" },
      { status: 401 },
    );
  }
  return null;
}
