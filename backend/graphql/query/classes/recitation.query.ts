/**
 * Recitation record query — `sessionRecitation`.
 *
 * Contract:
 *  - `sessionRecitation(sessionId: ID!): SessionRecitation`
 *      NULLABLE payload — `null` is a FIRST-CLASS response: a malformed id,
 *      an unknown session, a non-participant caller, and a session that
 *      does not yet carry its record ALL resolve to the IDENTICAL `null`
 *      (oracle-safe — the cases are indistinguishable on the wire).
 *
 * authScopes (`backend/graphql/AGENTS.md` participant-scoped pattern):
 *  - `{ authenticated: true }` ONLY — the scope wall exists against
 *    anonymous callers (UNAUTHORIZED / 401 pre-resolver); every role that
 *    passes the gate is handed to the service, whose DB-row participant
 *    predicate owns the entire tenancy decision. A plain single-key map
 *    needs no `$all` wrapper (no conjunction to force). The field is
 *    deliberately NOT role-gated: both participants read the record, and
 *    no role is granted or denied by name here.
 *
 * Resolver body is THIN DELEGATION (`backend/graphql/query/AGENTS.md`
 * + `backend/graphql/AGENTS.md`):
 *  - Identity comes EXCLUSIVELY from the verified context (`ctx.user.id`);
 *    the read takes no caller-supplied identity surface beyond the target
 *    `sessionId` (BOLA — the participant predicate reads the session row).
 *  - `ID` arrives as a string on the wire; the service boundary is numeric.
 *    Only a positive decimal-integer string coerces (a lazy parse like
 *    "1e0" would silently resolve a different session); every shape
 *    decision is the SERVICE's: the positive-safe-integer id guard answers
 *    a malformed id with `null` pre-DB.
 *  - NO try/catch, NO error mapping — the service's read contract never
 *    throws on any no-result shape, and a successful read never raises
 *    localized errors. Top-level static imports only.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - This file has NO named exports — it registers the root field at import
 *    time via `gqlSchemaBuilder.queryField(...)`.
 *  - Wired via side-effect barrels: `query/classes/index.ts` →
 *    `query/index.ts` → `gqlSchema.ts`.
 */

import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { SessionRecitationPothosObject } from "@/backend/graphql/pothos/classes/recitation.pothos";
import { UnauthorizedError } from "@/backend/lib/errors";
import { RecitationRecordService } from "@/backend/services";

// Side-effect: register the `sessionRecitation` query field.
gqlSchemaBuilder.queryField("sessionRecitation", t =>
  t.field({
    type: SessionRecitationPothosObject,
    // Nullable payload — `null` answers "malformed id", "unknown session",
    // "non-participant caller", and "not yet recorded" with ONE
    // indistinguishable null (oracle-safe). The service guarantees the
    // constant shape.
    nullable: true,
    // Authenticated but role-agnostic — the participant predicate lives
    // service-side. Anonymous callers get the `authenticated` scope's
    // UNAUTHORIZED (401) before the resolver ever runs.
    authScopes: {
      authenticated: true,
    },
    args: {
      sessionId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      // The `authenticated` scope guarantees a verified user row at
      // resolution time (anonymous callers never get past the scope step).
      // This branch exists purely for TypeScript narrowing — the repo-wide
      // no-non-null-assertion rule forbids dereferencing the nullable
      // context directly; it is unreachable in practice, and its denial
      // copy follows the resolver localization contract (AGENTS.md).
      if (!ctx.user) {
        throw new UnauthorizedError((await ctx.t("errorsTranslations")).unauthorized);
      }
      // `ID` arrives as a string on the wire; the service boundary is
      // numeric. Only a positive decimal-integer string coerces — a lazy
      // parse ("1e0", "0x1") would silently resolve a different session,
      // so any non-decimal id arrives at the service as NaN and rides the
      // malformed-id channel (the identical `null`, pre-DB). Existence and
      // participation resolve from the rows.
      const sessionId = /^[1-9]\d*$/.test(String(args.sessionId)) ? Number(args.sessionId) : Number.NaN;
      return RecitationRecordService.getSessionRecitation(ctx.user.id, sessionId);
    },
  })
);
