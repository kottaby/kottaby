/**
 * Scheduling-domain shared GraphQL documents barrel.
 *
 * Re-exports the session lifecycle documents (DEV3-004): the participant
 * reads (`sessionById`, `myStudentSessions`, `myTeacherSessions`) and the
 * lifecycle mutation quartet (`createSession`, `startSession`,
 * `completeSession`, `cancelSession`).
 */
export * from "./session.documents";
