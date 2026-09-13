/**
 * Deadline-sweeper cron entry (`GET /api/cron/sweep-sessions`).
 *
 * The B.2 dual-confirmation timeout sweep as an
 * externally-triggered job endpoint, following the documented cron rules
 * (R1-R11 per `backend/services/fx/README.md`, which this route makes
 * concrete for the sessions surface). The full envelope contract — GET-only,
 * timing-safe bearer compare against `CRON_SECRET`, fail-closed bare-404
 * mode gates, masked success/failure envelopes, locale-free classification —
 * lives in the shared `createCronSweepEndpoint` factory
 * (`backend/lib/gateway/cron-endpoint.ts`), which this surface and its
 * subscription-expiry sibling (`expire-subscriptions`) both ride so the
 * envelopes cannot drift apart. This file adds ONLY the sweep it triggers
 * and its payload shape:
 *
 *  - success `{ data: { cancelled, refunded }, requestId }` — the honest
 *    counts only: zero row identities cross the wire;
 *  - a THROWN sweep failure (e.g. an unreadable lane rolling the sweep
 *    back) is masked through the shared error envelope.
 *
 * The heavy lifting is `SessionLifecycleService.sweepExpiredSessions` —
 * one transaction: the guarded batch cancel + the per-row same-lane
 * refunds.
 */

import { createCronSweepEndpoint } from "@/backend/lib/gateway/cron-endpoint";
import { SessionLifecycleService } from "@/backend/services/classes/session-lifecycle.service";

export const GET = createCronSweepEndpoint({
  run: () => SessionLifecycleService.sweepExpiredSessions(),
  payload: result => ({ cancelled: result.cancelled, refunded: result.refunded }),
});
