/**
 * Scheduling-domain shared GraphQL documents barrel.
 *
 * Re-exports the session-recitation documents (DEV3-007: the write-once
 * per-session recitation record — the `sessionRecitation` read and the
 * `setSessionRecitation` mutation) and the session lifecycle + dispute
 * documents (DEV3-004 + DEV3-005): the participant reads (`sessionById`,
 * `myStudentSessions`, `myTeacherSessions`), the lifecycle mutation
 * quartet (`createSession`, `startSession`, `completeSession`,
 * `cancelSession`) and the DEV3-005 dispute trio (`openSessionDispute`,
 * `resolveSessionDispute`, `adminDisputedSessions`).
 */
export * from "./recitation.documents";
export * from "./session.documents";
