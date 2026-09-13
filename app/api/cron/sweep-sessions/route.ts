/**
 * Deadline-sweeper cron entry (`GET /api/cron/sweep-sessions`).
 *
 * The B.2 dual-confirmation timeout sweep as an
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
 *    missing/mismatched secret is a fail-closed 401 through the shared
 *    `UNAUTHORIZED` envelope. The secret is never accepted via query
 *    string.
 *  - **Mode gates fail closed** — the surface answers a BARE 404 unless
 *    BOTH `CRON_EXECUTION_MODE=external` AND `CRON_EXTERNAL_ENABLED=true`.
 *    The 404 is deliberately NOT the shared error envelope: every envelope
 *    carries a `code`, and any code (even a masked one) would tell the
 *    caller THIS path exists and is special — the oracle the disabled
 *    surface must never leak (a truly unknown path answers no envelope
 *    either). The bare response carries no body, no code, no
 *    `requestId`. The status literal is the ONE number the error-code
 *    taxonomy cannot express (its nine canonical codes have no 404 row by
 *    design — REST envelopes never 404) — documented here as the single
 *    sanctioned exemption.
 *  - **Envelope** — success `{ data: { cancelled, refunded }, requestId }`
 *    through `apiSuccessResponse`; a THROWN sweep failure (e.g. an
 *    unreadable lane rolling the sweep back) is caught and masked through
 *    `apiErrorResponse` (500 `INTERNAL_SERVER_ERROR` + one correlated log
 *    line) — the handler never lets an error escape raw.
 *
 * The heavy lifting is `SessionLifecycleService.sweepExpiredSessions` —
 * one transaction: the guarded batch cancel + the per-row same-lane
 * refunds. Zero row identities cross the wire: only the honest counts.
 */

import type { NextRequest } from "next/server";
import {
  apiErrorResponse,
  apiSuccessResponse,
  cronBearerFromRequest,
  cronUnauthorizedError,
  resolveRequestId,
} from "@/backend/lib/api";
import { getEnv } from "@/backend/lib/env";
import { SessionLifecycleService } from "@/backend/services/classes/session-lifecycle.service";

/**
 * The ONE status the error-code taxonomy cannot express: the endpoint-shaped
 * 404 of a disabled sweep surface. See the module docblock — deliberately a
 * BARE response (no envelope, no code, no requestId) so a disabled
 * deployment is indistinguishable from any other unknown path (R-204).
 */
const ENDPOINT_GONE_STATUS = 404;

export async function GET(request: NextRequest): Promise<Response> {
  // The route surface is locale-free: error classification receives the
  // deployment default ("en") — cron callers never render localized copy.
  const requestId = resolveRequestId(request.headers);
  const envelopeLocale = "en";

  // Mode gates FIRST — a disabled surface is a BARE 404, indistinguishable
  // from any other unknown path (no envelope, no code — see the docblock).
  const executionMode = getEnv("CRON_EXECUTION_MODE");
  const externalEnabled = getEnv("CRON_EXTERNAL_ENABLED");
  if (executionMode !== "external" || externalEnabled !== "true") {
    return new Response(null, { status: ENDPOINT_GONE_STATUS });
  }

  // Bearer gate — timing-safe compare against CRON_SECRET.
  if (!cronBearerFromRequest(name => request.headers.get(name), getEnv("CRON_SECRET")).ok) {
    return apiErrorResponse(cronUnauthorizedError(), { requestId, locale: envelopeLocale });
  }

  // The sweep owns its transaction; a thrown failure (unreadable lane →
  // rolled-back sweep) is masked through the shared envelope — never a raw
  // escape past the handler.
  try {
    const result = await SessionLifecycleService.sweepExpiredSessions();
    return apiSuccessResponse({ cancelled: result.cancelled, refunded: result.refunded }, { requestId });
  } catch (error: unknown) {
    return apiErrorResponse(error, { requestId, locale: envelopeLocale });
  }
}
