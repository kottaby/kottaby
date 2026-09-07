/**
 * Shared GraphQL documents for the session lifecycle + dispute + report
 * domain (DEV3-004 + DEV3-005 + DEV3-012 + DEV3-006) — RE-EXPORT HUB.
 *
 * Fourteen operations over the DEV3-004 + DEV3-006 SDL surfaces: three reads
 * (`sessionById`, `myStudentSessions`, `myTeacherSessions`), the
 * lifecycle quartet of mutations (`createSession`, `startSession`,
 * `completeSession`, `cancelSession`), the DEV3-005 dispute trio
 * (`openSessionDispute`, `resolveSessionDispute` mutations + the
 * `adminDisputedSessions` admin read), the DEV3-012 dual-confirmation
 * mutation (`confirmSessionCompletion`) and the DEV3-006 report/homework
 * trio (`submitSessionReport` mutation + the `sessionReport`,
 * `sessionHomework` reads).
 *
 * The definitions live in thematic siblings (the single-file original
 * exceeded the `max-lines` budget); this hub re-exports ALL of them so the
 * deep import path (`sharedDocuments/scheduling/session.documents`) and
 * the export surface stay IDENTICAL for every existing consumer and for
 * the `documents.contract.test.ts` structural lock. `export *` re-exports
 * the module bindings themselves — barrel and deep imports resolve to the
 * SAME document instance (cache-key safety, per the contract test's
 * "barrel ≡ deep import identity" lock).
 *
 * Split map (each sibling keeps the shared field-shape contract: every
 * `Session` payload selects `id` first for cache normalization and carries
 * the DEV3-005 dispute/cancel-audit fields — see the sibling headers):
 *
 *  - `session-reads.documents.ts`      — `sessionById`,
 *    `myStudentSessions`, `myTeacherSessions`;
 *  - `session-lifecycle.documents.ts`  — `createSession`, `startSession`,
 *    `completeSession`, `cancelSession`, `confirmSessionCompletion`;
 *  - `session-disputes.documents.ts`   — `openSessionDispute`,
 *    `resolveSessionDispute`, `adminDisputedSessions`;
 *  - `session-report.documents.ts`     — `submitSessionReport`,
 *    `sessionReport`, `sessionHomework` (DEV3-006).
 */

export * from "@/frontend/graphql/sharedDocuments/scheduling/session-disputes.documents";
export * from "@/frontend/graphql/sharedDocuments/scheduling/session-lifecycle.documents";
export * from "@/frontend/graphql/sharedDocuments/scheduling/session-reads.documents";
export * from "@/frontend/graphql/sharedDocuments/scheduling/session-report.documents";
