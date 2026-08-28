/**
 * SessionType enum — mirrors the `session_type` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical (per REQ-002).
 * Distinguishes regular vs evaluation sessions.
 */
export enum SessionType {
  StudentSession = "student_session",
  TeacherEvaluation = "teacher_evaluation",
  ReEvaluation = "re_evaluation",
}
