import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/admin/students — list students with trial balance + eligibility.
 *
 * Query params: ?limit=50&offset=0&role=student
 * Returns the segregated balance lanes + trial grant marker for each student.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
    const role = url.searchParams.get("role");

    const where = role ? { role } : undefined;

    const students = await db.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        balanceTrial: true,
        balanceHifz: true,
        balanceTajweed: true,
        balanceReviews: true,
        trialGrantedAt: true,
        locale: true,
        createdAt: true,
      },
    });

    const total = await db.student.count({ where });

    return NextResponse.json({
      ok: true,
      students: students.map((s) => ({
        ...s,
        eligible: s.balanceTrial > 0 || s.balanceHifz > 0 || s.balanceTajweed > 0 || s.balanceReviews > 0,
        hasTrial: s.balanceTrial > 0,
      })),
      total,
    });
  } catch (err) {
    console.error("[admin/students] error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
