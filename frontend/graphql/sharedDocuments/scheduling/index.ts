/**
 * Scheduling-domain shared GraphQL documents barrel.
 *
 * Re-exports the session-recitation documents (the write-once
 * per-session recitation record — the `sessionRecitation` read and the
 * `setSessionRecitation` mutation) and the session lifecycle + dispute
 * documents: the participant reads (`sessionById`,
 * `myStudentSessions`, `myTeacherSessions`), the lifecycle mutation
 * quartet (`createSession`, `startSession`, `completeSession`,
 * `cancelSession`) and the dispute family (`openSessionDispute`,
 * `openPostConfirmationDispute`, `resolveSessionDispute`,
 * `adminDisputedSessions`, `adminDisputeCase`) — the case-read
 * envelopes split into the sibling `session-dispute-case.documents.ts`.
 */
export * from "./recitation.documents";
export * from "./session.documents";
