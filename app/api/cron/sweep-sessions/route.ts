/**
 * Deadline-sweeper cron entry (`GET /api/cron/sweep-sessions`).
 *
 * DEV3-012 (R-203) — the B.2 dual-confirmation timeout sweep as an
 * externally-triggered job endpoint, following the documented cron rules
 * (R1-R11 per `backend/services/fx/README.md`, which this route makes
 * concrete for the sessions surface):
 *
 *  - **GET-only** — Vercel Cron / external schedulers inject
 *    `Authorization: Bearer ${CRON_SECRET}` on GET; Next.js answers every
 *    other verb with its own 405 for routes exporting only GET.
 *  - **Timing-safe bearer compare** against `CRON_SECRET`
 *    (`node:crypto.timingSafeEqual` over fixed-length SHA-256 digests —
 *    never a plain string compare, no length leak, no early exit); a
 *    missing/mismatched secret is a fail-closed 401. The secret is never
 *    accepted via query string.
 *  - **Mode gates fail closed** — the surface answers 404 unless BOTH
 *    `CRON_EXECUTION_MODE=external` AND `CRON_EXTERNAL_ENABLED=true`; a
 *    disabled or unconfigured deployment exposes no sweep endpoint at
 *    all (indistinguishable from any other unknown path). A deployment
 *    with no secret configured also fails closed (401), never open.
 *  - **Envelope** — success `{ data: { cancelled, refunded }, requestId }`
 *    through `apiSuccessResponse`; failures use the shared error envelope
 *    with statuses derived through the error-code taxonomy (no numeric
 *    status literals in this file).
 *
 * The heavy lifting is `SessionLifecycleService.sweepExpiredSessions` —
 * one transaction: the guarded batch cancel + the per-row same-lane
 * refunds. Zero row identities cross the wire: only the honest counts.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccessResponse, resolveRequestId } from "@/backend/lib/api";
import { getEnv } from "@/backend/lib/env";
import { DomainError, NotFoundError } from "@/backend/lib/errors";
import { SessionLifecycleService } from "@/backend/services/classes/session-lifecycle.service";

/** The disabled-surface denial — classified to 404 (endpoint-shaped 404). */
function sweepDisabledError(): NotFoundError {
  return new NotFoundError("ENDPOINT", "Sweep endpoint is not available on this deployment.");
}

/** The failed-auth denial — classified to 401 (UNAUTHORIZED family). */
function sweepUnauthorizedError(): DomainError {
  return new DomainError("UNAUTHORIZED", "Invalid cron credentials.");
}

/**
 * Timing-safe bearer comparison: both sides are hashed to fixed-length
 * SHA-256 digests first, so `timingSafeEqual` never sees (or leaks via
 * early exit) length differences between the presented and expected
 * secrets.
 */
function bearerSecretMatches(presented: string | null, expected: string): boolean {
  if (presented === null || presented.length === 0) {
    return false;
  }
  const presentedDigest = createHash("sha256").update(presented).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(presentedDigest, expectedDigest);
}

export async function GET(request: NextRequest): Promise<Response> {
  // The route surface is locale-free: error classification receives the
  // deployment default ("en") — cron callers never render localized copy.
  const requestId = resolveRequestId(request.headers);
  const envelopeLocale = "en";

  // Mode gates FIRST — a disabled surface is a 404, indistinguishable from
  // any other unknown path (the endpoint effectively does not exist).
  const executionMode = getEnv("CRON_EXECUTION_MODE");
  const externalEnabled = getEnv("CRON_EXTERNAL_ENABLED");
  if (executionMode !== "external" || externalEnabled !== "true") {
    return apiErrorResponse(sweepDisabledError(), { requestId, locale: envelopeLocale });
  }

  // Bearer gate — timing-safe compare against CRON_SECRET.
  const secret = getEnv("CRON_SECRET");
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (secret === undefined || secret.length === 0 || !bearerSecretMatches(presented, secret)) {
    return apiErrorResponse(sweepUnauthorizedError(), { requestId, locale: envelopeLocale });
  }

  const result = await SessionLifecycleService.sweepExpiredSessions();
  return apiSuccessResponse({ cancelled: result.cancelled, refunded: result.refunded }, { requestId });
}
