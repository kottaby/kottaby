/**
 * Session report mutation — the teacher-only `submitSessionReport`: the
 * post-session report write (notes + student rating) together with its two
 * optional homework composites (the previous-row grade write and the new
 * assignment), settling atomically inside the service's transaction.
 *
 * Contract:
 *  - `submitSessionReport(id: ID!, input: SubmitSessionReportInput!): SessionReport!`
 *      Teacher-only (`$all` scope conjunction). The acting teacher is
 *      resolved SERVER-side from `ctx.user.id` — never client-supplied
 *      (BOLA). Every business rule (payload validation, governance
 *      re-assertion, the completed-state gate, the one-report-per-session
 *      conflict, the grade write-once) lives in `SessionReportService`.
 *
 * authScopes 401/403 split (mirrors `session-lifecycle.mutation.ts`,
 * verified against @pothos/plugin-scope-auth@4.1.7):
 *  - A plain `{ authenticated: true, role: [...] }` map is WRONG in this
 *    engine: Pothos combines the keys of ONE scope map with ANY semantics
 *    (`defaultStrategy: "any"`), so ANY authenticated caller would pass.
 *  - The conjunction is therefore made EXPLICIT with `$all`: anonymous
 *    callers hit the `authenticated` scope's UnauthorizedError throw
 *    (extensions.code UNAUTHORIZED / 401 — explicit throws pass through
 *    builder.ts's unauthorizedError mapping VERBATIM), while authenticated
 *    non-teachers fail the `role` scope into the canonical localized
 *    ForbiddenError (FORBIDDEN / 403). The service re-asserts the teacher
 *    role + governance from the user row as defense in depth.
 *
 * Resolvers are THIN DELEGATION ONLY (`backend/graphql/mutation/AGENTS.md`
 * + `backend/graphql/AGENTS.md`): no business logic, no repository calls,
 * no try/catch — DomainErrors from `SessionReportService` propagate
 * uncaught to the masking boundary with their `extensions.code` untouched
 * (`SESSION_NOT_FOUND`, `SESSION_INVALID_TRANSITION`,
 * `SESSION_REPORT_ALREADY_EXISTS`, `CONFLICT`, `VALIDATION`, `FORBIDDEN`);
 * all localized messaging happens inside the service via `ctx.locale`
 * propagation — this file carries NO resolver-local copy and NO `ctx.t`
 * call.
 *
 * Per `backend/graphql/mutation/AGENTS.md`:
 *  - This file has NO named exports — it registers the root field at
 *    import time via `gqlSchemaBuilder.mutationField(...)`.
 *  - Wired via side-effect barrels: `mutation/classes/index.ts` →
 *    `mutation/index.ts` → `gqlSchema.ts`.
 */

import { UserRole } from "@/backend/enum/users/user-role.enum";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { SessionReportPothosObject } from "@/backend/graphql/pothos/classes/report.pothos";
import { SubmitSessionReportPothosInput } from "@/backend/graphql/pothos/classes/session-report-input.pothos";
import { requirePositiveIntId } from "@/backend/graphql/shared";
import { UnauthorizedError } from "@/backend/lib/errors";
import * as SessionReportService from "@/backend/services/classes/session-report.service";
import type { HomeWorkBlockInput, SessionReportSubmitInput } from "@/backend/types";

/**
 * Field-by-field hand-off for one optional homework block (BOPLA): the
 * wire block is copied member-by-member into the canonical
 * `HomeWorkBlockInput`; an unsupplied (or transport-`null`) leg drops to
 * `undefined`, mirroring the service's fail-closed "supplied" predicate.
 */
function wireBlockToInput(block: HomeWorkBlockInput | null | undefined): HomeWorkBlockInput | undefined {
  return block ? { fromAyah: block.fromAyah, toAyah: block.toAyah, surahJuz: block.surahJuz } : undefined;
}

// Side-effect: register the `submitSessionReport` mutation field.
gqlSchemaBuilder.mutationField("submitSessionReport", t =>
  t.field({
    type: SessionReportPothosObject,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: SubmitSessionReportPothosInput, required: true }),
    },
    description:
      "Submit the teacher's report for one completed session: notes, the student rating, and the optional homework composites (previous-row grades + the new assignment) settle atomically. A duplicate submission replays SESSION_REPORT_ALREADY_EXISTS.",
    // Explicit `$all` conjunction per the 401/403 split documented above:
    // anonymous callers hit UNAUTHORIZED (401), authenticated non-teachers
    // fail the `role` leg into the canonical localized FORBIDDEN (403).
    authScopes: {
      $all: {
        authenticated: true,
        role: [UserRole.Teacher],
      },
    },
    resolve: async (_root, args, ctx) => {
      // The `$all { authenticated: true }` scope guarantees a verified user
      // row at resolution time (anonymous callers never get past the scope
      // step). This branch exists purely for TypeScript narrowing — the
      // repo-wide no-non-null-assertion rule forbids dereferencing the
      // nullable context directly; the thrown message mirrors builder.ts's
      // own `authenticated` scope verbatim and is unreachable in practice.
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      // `ID` arrives as a string on the wire; the house
      // `requirePositiveIntId` guard performs the boundary parse (no
      // `as number`), and the service re-asserts the positive-safe-integer
      // shape pre-DB with the localized message.
      const sessionId = requirePositiveIntId(Number(args.id), "id");
      // BOPLA field-by-field hand-off — the client whitelist maps member by
      // member into the canonical `SessionReportSubmitInput` (NO spread);
      // the optional composites drop out when unsupplied. The service owns
      // every validation rule; nothing is re-checked here.
      const homework = args.input.homework;
      const previousGrades = args.input.previousGrades;
      const input: SessionReportSubmitInput = {
        teacherNotes: args.input.teacherNotes,
        studentRatingByTeacher: args.input.studentRatingByTeacher,
        homework: homework
          ? {
              jadid: wireBlockToInput(homework.jadid),
              madi: wireBlockToInput(homework.madi),
            }
          : undefined,
        previousGrades: previousGrades
          ? {
              currentGrade: previousGrades.currentGrade,
              revisionGrade: previousGrades.revisionGrade,
            }
          : undefined,
      };
      return SessionReportService.submitSessionReport(ctx.user.id, sessionId, input, ctx.locale);
    },
  })
);
