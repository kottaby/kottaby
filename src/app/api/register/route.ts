import { NextResponse } from "next/server";
import { RegistrationService, type UserRole } from "@/lib/services/registration.service";
import { DomainError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/errors";

export async function POST(req: Request) {
  let body: {
    email?: unknown;
    fullName?: unknown;
    role?: unknown;
    locale?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const rawRole = typeof body.role === "string" ? body.role : "student";
  const locale =
    typeof body.locale === "string" && (body.locale === "ar" || body.locale === "en")
      ? body.locale
      : "ar";

  // BOPLA: validate role against the whitelist (no admin path here)
  const role: UserRole =
    rawRole === "student" || rawRole === "teacher" || rawRole === "parent"
      ? rawRole
      : "student";

  if (!email || !fullName) {
    return NextResponse.json(
      { ok: false, error: "Missing email or fullName" },
      { status: 400 },
    );
  }

  try {
    const result = await RegistrationService.registerUser({
      email,
      fullName,
      role,
      locale,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json(
        { ok: false, code: err.code, error: err.message },
        { status: err.httpStatus },
      );
    }
    logger.error("[register] unexpected error", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
