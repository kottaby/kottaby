import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/errors";

const VALID_STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;
type BookingStatus = (typeof VALID_STATUSES)[number];

/**
 * PATCH /api/admin/bookings/[id] — update a booking's status.
 *
 * Body: { status: "pending" | "confirmed" | "completed" | "cancelled" }
 *
 * This is the admin CRUD action for booking lifecycle management.
 * Returns the updated booking record.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const status = typeof body.status === "string" ? body.status : "";

  if (!VALID_STATUSES.includes(status as BookingStatus)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    const existing = await db.booking.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Booking not found" },
        { status: 404 },
      );
    }

    const updated = await db.booking.update({
      where: { id },
      data: { status: status as BookingStatus },
    });

    return NextResponse.json({ ok: true, booking: updated });
  } catch (err) {
    logger.error("[admin/bookings/[id]] PATCH error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/bookings/[id] — delete a booking record.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const existing = await db.booking.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Booking not found" },
        { status: 404 },
      );
    }

    await db.booking.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[admin/bookings/[id]] DELETE error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
