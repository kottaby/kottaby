/**
 * Session report/homework read queries — the participant read surface:
 *
 *  - `sessionReport(sessionId: ID!): SessionReport` — nullable; the row is
 *    returned ONLY to a participant of that session (its teacher or its
 *    student). A nonexistent id, a non-participant caller, and a session
 *    that carries no report yet all resolve to the IDENTICAL `null`
 *    (oracle-safe — the cases are indistinguishable on the wire); `null`
 *    is passed through untouched.
 *  - `sessionHomework(sessionId: ID!): SessionHomeWork` — nullable; the
 *    same participant gate and the same `null` collapse over the homework
 *    row.
 *
 * authScopes: `{ authenticated: true }` ONLY — the participant predicate
 * lives entirely service-side (a non-participant — parent/admin included —
 * gets `null`, never an error; existence is never disclosed
 * cross-participant). Anonymous callers get the `authenticated` scope's
 * UNAUTHORIZED (401) before the resolver ever runs.
 *
 * Resolver bodies are THIN DELEGATION (`backend/graphql/query/AGENTS.md` +
 * `backend/graphql/AGENTS.md`):
 *  - Identity comes EXCLUSIVELY from the verified context (`ctx.user.id`);
 *    the reads take no caller-supplied identity surface of any kind (BOLA).
 *  - The `ID` arg is parsed by the house `requirePositiveIntId` guard (no
 *    `as number`); the service re-asserts the positive-safe-integer shape
 *    pre-DB with the localized message. Zero repository calls.
 *  - No try/catch — the readers never raise (gate misses are `null`); the
 *    only resolver-local throw is the TypeScript-narrowing guard inside
 *    the shared delegation body below, whose message mirrors builder.ts's
 *    own `authenticated` scope verbatim. `ctx.locale` propagates for the
 *    service's localized id-shape guard.
 *
 * The two fields share ONE delegation body (`resolveParticipantSessionRow`)
 * per the duplication-elimination pattern (`backend/graphql/AGENTS.md`);
 * the context narrowing, the id parse, and the read hand-off stay in
 * exactly ONE place, parameterized by the service read function.
 *
 * Per backend/graphql/query/AGENTS.md:
 *  - NO named exports — the root fields register at import time via
 *    `gqlSchemaBuilder.queryField(...)`.
 *  - Wired through side-effect barrels:
 *    `query/classes/index.ts` → `query/index.ts` → `gqlSchema.ts`.
 */

import type { Context } from "@/backend/graphql/gqlContextFactory";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { SessionHomeWorkPothosObject } from "@/backend/graphql/pothos/classes/home-work.pothos";
import { SessionReportPothosObject } from "@/backend/graphql/pothos/classes/report.pothos";
import { requirePositiveIntId } from "@/backend/graphql/shared";
import { UnauthorizedError } from "@/backend/lib/errors";
import * as SessionReportService from "@/backend/services/classes/session-report.service";

/**
 * The shared participant-read delegation body behind `sessionReport` and
 * `sessionHomework`: narrows the verified context, boundary-parses the
 * `sessionId` arg, and hands off to ONE of the service's participant
 * readers. The nullable row is returned exactly as the service hands it
 * over — no wrapping, no re-shaping (every gate miss is the service's
 * `null`).
 */
async function resolveParticipantSessionRow<T>(
  args: { readonly sessionId: string | number },
  ctx: Context,
  reader: (callerUserId: number, sessionId: number, locale: string) => Promise<T | null>
): Promise<T | null> {
  // The `authenticated` scope guarantees a verified user row at resolution
  // time (anonymous callers never get past the scope step). This branch
  // exists purely for TypeScript narrowing — the repo-wide
  // no-non-null-assertion rule forbids dereferencing the nullable context
  // directly; the thrown message mirrors builder.ts's own `authenticated`
  // scope verbatim and is unreachable in practice.
  if (!ctx.user) {
    throw new UnauthorizedError("Authentication required.");
  }
  // `ID` arrives as a string on the wire; the house `requirePositiveIntId`
  // guard performs the boundary parse (no `as number`), and the service
  // re-asserts the id shape pre-DB.
  const sessionId = requirePositiveIntId(Number(args.sessionId), "sessionId");
  return reader(ctx.user.id, sessionId, ctx.locale);
}

// Side-effect: register the `sessionReport` query field.
gqlSchemaBuilder.queryField("sessionReport", t =>
  t.field({
    type: SessionReportPothosObject,
    // Nullable payload — `null` answers "nonexistent id", "non-participant
    // caller", and "no report yet" with ONE indistinguishable null
    // (oracle-safe). The service guarantees the constant shape.
    nullable: true,
    args: {
      sessionId: t.arg.id({ required: true }),
    },
    // Authenticated but role-agnostic: both participants (student AND
    // teacher) must reach the field; the participant predicate lives
    // service-side.
    authScopes: {
      authenticated: true,
    },
    resolve: (_root, args, ctx) => resolveParticipantSessionRow(args, ctx, SessionReportService.getSessionReport),
  })
);

// Side-effect: register the `sessionHomework` query field — the same
// participant gate and the same `null` collapse over the homework row.
gqlSchemaBuilder.queryField("sessionHomework", t =>
  t.field({
    type: SessionHomeWorkPothosObject,
    nullable: true,
    args: {
      sessionId: t.arg.id({ required: true }),
    },
    authScopes: {
      authenticated: true,
    },
    resolve: (_root, args, ctx) => resolveParticipantSessionRow(args, ctx, SessionReportService.getSessionHomework),
  })
);
