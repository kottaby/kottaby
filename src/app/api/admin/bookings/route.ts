import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/errors";
import { requireAdmin } from "@/lib/middleware/admin-auth";

/**
 * GET /api/admin/bookings — list recent booking submissions.
 *
 * Query params: ?limit=50&status=pending
 */
export async function GET(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
    const status = url.searchParams.get("status");

    const where = status ? { status } : undefined;

    const bookings = await db.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await db.booking.count({ where });

    return NextResponse.json({
      ok: true,
      bookings,
      total,
    });
  } catch (err) {
    logger.error("[admin/bookings] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
