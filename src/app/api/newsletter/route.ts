import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: { email?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
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

  try {
    // Check existing first to avoid unique-constraint error
    const existing = await db.newsletterSubscriber.findUnique({
      where: { email },
    });
    if (existing) {
      return NextResponse.json({ ok: true, existed: true });
    }
    await db.newsletterSubscriber.create({
      data: { email, locale },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[newsletter] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
