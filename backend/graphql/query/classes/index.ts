/**
 * `classes` query-domain barrel — side-effect imports every query file in
 * this sub-directory.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - Each entry is a side-effect import — the imported file registers root
 *    query fields on `gqlSchemaBuilder` at import time. They have no named
 *    exports.
 *  - The top-level `backend/graphql/query/index.ts` imports THIS barrel;
 *    `gqlSchema.ts` imports the top-level barrel exactly once.
 *  - `session-lifecycle.query.ts` registers `sessionById`,
 *    `myStudentSessions`, `myTeacherSessions`, and
 *    `adminDisputedSessions`.
 *  - `admin-session-governance.query.ts` registers `adminSessions` and
 *    `adminSession`.
 */
import "./admin-session-governance.query";
import "./session-lifecycle.query";
import "./session-report.query";
