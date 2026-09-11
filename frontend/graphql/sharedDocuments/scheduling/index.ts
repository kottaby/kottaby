/**
 * Scheduling-domain shared GraphQL documents barrel.
 *
 * Re-exports the session-recitation documents (the write-once
 * per-session recitation record — the `sessionRecitation` read and the
 * `setSessionRecitation` mutation) and the session lifecycle + dispute
 * documents: the participant reads (`sessionById`,
 * `myStudentSessions`, `myTeacherSessions`), the lifecycle mutation
 * quartet (`createSession`, `startSession`, `completeSession`,
 * `cancelSession`) and the dispute trio (`openSessionDispute`,
 * `resolveSessionDispute`, `adminDisputedSessions`).
 */
export * from "./recitation.documents";
export * from "./session.documents";
