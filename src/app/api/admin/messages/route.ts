import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/admin/messages — list contact messages + newsletter subscribers.
 *
 * Query params: ?type=contact|newsletter (default: both)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
    const type = url.searchParams.get("type");

    const [contacts, subscribers] = await Promise.all([
      (!type || type === "contact")
        ? db.contactMessage.findMany({
            orderBy: { createdAt: "desc" },
            take: limit,
            skip: offset,
          })
        : Promise.resolve([]),
      (!type || type === "newsletter")
        ? db.newsletterSubscriber.findMany({
            orderBy: { createdAt: "desc" },
            take: limit,
            skip: offset,
          })
        : Promise.resolve([]),
    ]);

    const [contactTotal, newsletterTotal] = await Promise.all([
      db.contactMessage.count(),
      db.newsletterSubscriber.count(),
    ]);

    return NextResponse.json({
      ok: true,
      contacts,
      subscribers,
      totals: { contacts: contactTotal, newsletter: newsletterTotal },
    });
  } catch (err) {
    console.error("[admin/messages] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
