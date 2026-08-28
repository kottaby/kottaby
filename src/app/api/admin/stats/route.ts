import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/errors";

/**
 * GET /api/admin/stats — aggregate counts for the admin dashboard.
 *
 * Returns counts for: students (total + trial-granted), bookings (total +
 * pending), newsletter subscribers, contact messages. Also returns
 * trial-grant metrics (granted vs. pending) for the DEV1-004 feature.
 */
export async function GET() {
  try {
    const [
      studentCount,
      trialGrantedCount,
      bookingCount,
      pendingBookings,
      newsletterCount,
      contactCount,
    ] = await Promise.all([
      db.student.count(),
      db.student.count({ where: { trialGrantedAt: { not: null } } }),
      db.booking.count(),
      db.booking.count({ where: { status: "pending" } }),
      db.newsletterSubscriber.count(),
      db.contactMessage.count(),
    ]);

    // Role breakdown
    const studentsByRole = await db.student.groupBy({
      by: ["role"],
      _count: { _all: true },
    });

    return NextResponse.json({
      ok: true,
      stats: {
        students: studentCount,
        trialGranted: trialGrantedCount,
        bookings: bookingCount,
        pendingBookings,
        newsletter: newsletterCount,
        contacts: contactCount,
      },
      studentsByRole: studentsByRole.map((r) => ({
        role: r.role,
        count: r._count._all,
      })),
    });
  } catch (err) {
    logger.error("[admin/stats] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
