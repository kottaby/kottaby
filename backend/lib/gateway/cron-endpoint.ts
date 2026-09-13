/**
 * Shared cron sweep-endpoint factory — the gateway envelope every
 * externally-triggered sweep job rides (`app/api/cron/*`).
 *
 * Extracted from the twin route files (`sweep-sessions`, the older
 * sessions sweep, and `expire-subscriptions`, its subscription-expiry
 * sibling) whose envelope bodies were intentionally written line-for-line
 * identical (REQ-020 mirroring doctrine) — the shared factory now guarantees
 * that identity structurally, so the two surfaces cannot drift apart.
 *
 * The contract each route inherits:
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
 *  - **Envelope** — success `{ data: <payload>, requestId }` through
 *    `apiSuccessResponse`; a THROWN sweep failure (e.g. an invariant
 *    breach rolling the cohort back) is caught and masked through
 *    `apiErrorResponse` (500 `INTERNAL_SERVER_ERROR` + one correlated log
 *    line) — the handler never lets an error escape raw.
 *  - **Locale-free** — error classification receives the deployment
 *    default ("en"); cron callers never render localized copy.
 *
 * The env gates are read INSIDE the returned handler (never at factory
 * time) so tests can stub `process.env` per invocation.
 */

import type { NextRequest } from "next/server";
import { apiErrorResponse, apiSuccessResponse, resolveRequestId } from "@/backend/lib/api";
import { bearerSecretMatches, cronUnauthorizedError } from "@/backend/lib/api/cron-auth";
import { getEnv } from "@/backend/lib/env";

/**
 * The ONE status the error-code taxonomy cannot express: the endpoint-shaped
 * 404 of a disabled sweep surface. See the module docblock — deliberately a
 * BARE response (no envelope, no code, no requestId) so a disabled
 * deployment is indistinguishable from any other unknown path.
 */
const ENDPOINT_GONE_STATUS = 404;

interface CronSweepEndpointConfig<TResult> {
  /**
   * The transactional sweep to run EXACTLY ONCE per authenticated call —
   * the route owns no sweep logic of its own.
   */
  readonly run: () => Promise<TResult>;
  /**
   * The honest-counts payload extracted from the sweep result — zero row
   * identities cross the wire, only the counts.
   */
  readonly payload: (result: TResult) => Record<string, unknown>;
}

/**
 * Builds the GET handler for a cron sweep surface with the full shared
 * envelope (bare-404 kill switch, timing-safe bearer gate, masked
 * success/failure envelopes).
 */
export function createCronSweepEndpoint<TResult>(
  config: CronSweepEndpointConfig<TResult>
): (request: NextRequest) => Promise<Response> {
  return async function GET(request: NextRequest): Promise<Response> {
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
    const secret = getEnv("CRON_SECRET");
    const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
    if (secret === undefined || secret.length === 0 || !bearerSecretMatches(presented, secret)) {
      return apiErrorResponse(cronUnauthorizedError(), { requestId, locale: envelopeLocale });
    }

    // The sweep owns its transaction; a thrown failure is masked through
    // the shared envelope — never a raw escape past the handler.
    try {
      const result = await config.run();
      return apiSuccessResponse(config.payload(result), { requestId });
    } catch (error: unknown) {
      return apiErrorResponse(error, { requestId, locale: envelopeLocale });
    }
  };
}
