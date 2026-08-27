import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function POST(req: Request) {
  let body: {
    teacherName?: unknown;
    teacherNameAr?: unknown;
    recitation?: unknown;
    date?: unknown;
    time?: unknown;
    notes?: unknown;
    locale?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const teacherName =
    typeof body.teacherName === "string" ? body.teacherName.trim().slice(0, 120) : "";
  const teacherNameAr =
    typeof body.teacherNameAr === "string" ? body.teacherNameAr.trim().slice(0, 120) : "";
  const recitation =
    typeof body.recitation === "string" ? body.recitation.trim().slice(0, 80) : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const time = typeof body.time === "string" ? body.time.trim() : "";
  const notes =
    typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const locale =
    typeof body.locale === "string" && (body.locale === "ar" || body.locale === "en")
      ? body.locale
      : "ar";

  if (!teacherName || !recitation || !DATE_RE.test(date) || !TIME_RE.test(time)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid fields" },
      { status: 400 }
    );
  }

  try {
    await db.booking.create({
      data: {
        teacherName,
        teacherNameAr,
        recitation,
        date,
        time,
        notes,
        locale,
        status: "pending",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[booking] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const count = await db.booking.count();
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[booking/count] error", err);
    return NextResponse.json(
      { count: 0, error: "Server error" },
      { status: 500 }
    );
  }
}
