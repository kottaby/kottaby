import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/errors";

export async function GET() {
  try {
    const count = await db.newsletterSubscriber.count();
    return NextResponse.json({ count });
  } catch (err) {
    logger.error("[newsletter/count] error", err);
    return NextResponse.json(
      { count: 0, error: "Server error" },
      { status: 500 }
    );
  }
}
