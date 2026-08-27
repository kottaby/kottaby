import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: { email?: unknown; message?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const locale =
    typeof body.locale === "string" && (body.locale === "ar" || body.locale === "en")
      ? body.locale
      : "ar";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Invalid email" },
      { status: 400 }
    );
  }
  if (message.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Message too short (min 10 chars)" },
      { status: 400 }
    );
  }

  try {
    const record = await db.contactMessage.create({
      data: { email, message, locale },
      select: { id: true },
    });
    // Return a short ticket number derived from the record id (first 8 chars, uppercased)
    const ticket = record.id.replace(/-/g, "").slice(0, 8).toUpperCase();
    return NextResponse.json({ ok: true, ticket });
  } catch (err) {
    console.error("[contact] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
