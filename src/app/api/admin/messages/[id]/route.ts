import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/errors";
import { requireAdmin } from "@/lib/middleware/admin-auth";

/**
 * DELETE /api/admin/messages/[id]?type=contact|newsletter
 *
 * Deletes a contact message or newsletter subscriber by id.
 * The `type` query param selects which table to delete from.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireAdmin(req ?? _req);
  if (authError) return authError;
  const { id } = await params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "contact";

  try {
    if (type === "newsletter") {
      const existing = await db.newsletterSubscriber.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { ok: false, error: "Subscriber not found" },
          { status: 404 },
        );
      }
      await db.newsletterSubscriber.delete({ where: { id } });
    } else {
      const existing = await db.contactMessage.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { ok: false, error: "Message not found" },
          { status: 404 },
        );
      }
      await db.contactMessage.delete({ where: { id } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[admin/messages/[id]] DELETE error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
