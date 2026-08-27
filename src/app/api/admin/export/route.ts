import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/admin/export?type=students|bookings|contacts|newsletter
 *
 * Exports admin data as a CSV file (UTF-8 with BOM for Excel Arabic support).
 * Returns a `text/csv` attachment with the appropriate filename.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "students";

  const headers = new Headers({
    "Content-Type": "text/csv; charset=utf-8",
  });

  try {
    let csv = "";
    let filename = type;

    switch (type) {
      case "students": {
        const students = await db.student.findMany({
          orderBy: { createdAt: "desc" },
        });
        csv = toCSV(
          ["ID", "Email", "Full Name", "Role", "Trial Balance", "Hifz", "Tajweed", "Reviews", "Trial Granted At", "Locale", "Created At"],
          students.map((s) => [
            s.id,
            s.email,
            s.fullName,
            s.role,
            String(s.balanceTrial),
            String(s.balanceHifz),
            String(s.balanceTajweed),
            String(s.balanceReviews),
            s.trialGrantedAt ? s.trialGrantedAt.toISOString() : "",
            s.locale,
            s.createdAt.toISOString(),
          ]),
        );
        break;
      }
      case "bookings": {
        const bookings = await db.booking.findMany({
          orderBy: { createdAt: "desc" },
        });
        csv = toCSV(
          ["ID", "Teacher", "Recitation", "Date", "Time", "Status", "Notes", "Locale", "Created At"],
          bookings.map((b) => [
            b.id,
            b.teacherName,
            b.recitation,
            b.date,
            b.time,
            b.status,
            b.notes,
            b.locale,
            b.createdAt.toISOString(),
          ]),
        );
        break;
      }
      case "contacts": {
        const contacts = await db.contactMessage.findMany({
          orderBy: { createdAt: "desc" },
        });
        csv = toCSV(
          ["ID", "Email", "Message", "Locale", "Created At"],
          contacts.map((c) => [
            c.id,
            c.email,
            c.message.replace(/"/g, '""'),
            c.locale,
            c.createdAt.toISOString(),
          ]),
        );
        break;
      }
      case "newsletter": {
        const subs = await db.newsletterSubscriber.findMany({
          orderBy: { createdAt: "desc" },
        });
        csv = toCSV(
          ["ID", "Email", "Locale", "Created At"],
          subs.map((s) => [
            s.id,
            s.email,
            s.locale,
            s.createdAt.toISOString(),
          ]),
        );
        break;
      }
      default:
        return NextResponse.json(
          { ok: false, error: "Invalid export type" },
          { status: 400 },
        );
    }

    headers.set(
      "Content-Disposition",
      `attachment; filename="kottaby-${filename}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );

    // Prepend UTF-8 BOM so Excel reads Arabic correctly
    return new NextResponse("\uFEFF" + csv, { status: 200, headers });
  } catch (err) {
    console.error("[admin/export] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}

/** Minimal CSV serializer — quotes fields containing commas, quotes, or newlines. */
function toCSV(headers: string[], rows: string[][]): string {
  const quote = (v: string) => {
    if (/["\n,]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [headers.map(quote).join(",")];
  for (const row of rows) {
    lines.push(row.map(quote).join(","));
  }
  return lines.join("\n");
}
