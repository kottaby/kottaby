/**
 * Entity-setup helpers for DB tests — factories that create isolated test
 * entities inside a transaction.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Always create your own data via these helpers inside `runInRollback`.
 *    NEVER query seed data as test input.
 *  - Generate unique emails / names / handshake codes via `randomUUID()` or
 *    distinct prefixes to avoid unique-constraint violations.
 *  - Each helper takes `tx` as the FIRST argument and passes it to the
 *    underlying repository method.
 *
 * The helpers here are NOT the canonical registration flow — they bypass the
 * service layer to set up test preconditions (e.g. a pre-existing user to
 * test duplicate-email rejection). For registration behavior, call
 * `RegistrationService.registerUser(...)` directly in the test body.
 */
import { randomUUID } from "node:crypto";
import { plans } from "@/backend/db/schema/billing/plans";
import { studentPayments } from "@/backend/db/schema/billing/student-payments";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";
import { wallet } from "@/backend/db/schema/billing/wallet";
import { reports } from "@/backend/db/schema/classes/reports";
import { session } from "@/backend/db/schema/classes/session";
import { parents } from "@/backend/db/schema/parents/parents";
import { students } from "@/backend/db/schema/students/students";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { evaluations } from "@/backend/db/schema/teachers/evaluations";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
import {
  PaymentGateway,
  PaymentStatus,
  SubscriptionStatus,
  TransactionStatus,
  TransactionType,
} from "@/backend/enum/billing";
import { SessionStatus, SessionType } from "@/backend/enum/scheduling";
import { TeacherRequestPreference } from "@/backend/enum/teachers";
import type {
  AdminSelectType,
  ApplicantSelectType,
  DBTransaction,
  EvaluationSelectType,
  ParentSelectType,
  PlanSelectType,
  ReportSelectType,
  SessionSelectType,
  StudentPaymentSelectType,
  StudentSelectType,
  SubscriptionSelectType,
  TeacherSelectType,
  TeacherTransactionSelectType,
  UserSelectType,
  WalletSelectType,
} from "@/backend/types";

/** Default test bcrypt hash stub (placeholder — NOT a real hash, never used for verification). */
const TEST_BCRYPT_STUB_HASH = "$2a$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUV1234567890ABCDEFGHIJKLMNOPQRSTUV";

/**
 * Creates a unique test user with a random email. Override any field via
 * `overrides` — useful for setting `role` to a specific value or pre-seeding
 * `isDeleted` to test governance-state rejection paths.
 *
 * @example
 * const user = await createTestUser(tx);
 * const admin = await createTestUser(tx, { role: "admin" });
 */
export async function createTestUser(
  tx: DBTransaction,
  overrides: Partial<UserSelectType> = {}
): Promise<UserSelectType> {
  const [row] = await tx
    .insert(users)
    .values({
      fullName: `Test User ${randomUUID().slice(0, 8)}`,
      email: `test-${randomUUID()}@test.local`,
      phone: "+10000000000",
      passwordHash: TEST_BCRYPT_STUB_HASH,
      role: "student",
      // Governance defaults
      isDeleted: false,
      suspended: false,
      isBlocked: false,
      lastActiveAt: new Date(),
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestUser: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `students` row for a previously-created user. Generates a unique
 * `handshakeCode` so multiple test students don't collide.
 */
export async function createTestStudent(
  tx: DBTransaction,
  userId: number,
  overrides: Partial<StudentSelectType> = {}
): Promise<StudentSelectType> {
  const [row] = await tx
    .insert(students)
    .values({
      id: userId,
      handshakeCode: `KSB-${randomUUID().slice(0, 8).toUpperCase()}`,
      balanceHifz: 0,
      balanceTajweed: 0,
      balanceReviews: 0,
      parentId: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestStudent: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `parents` row for a previously-created user (PK only — the
 * `parents` table has no extra columns beyond shared PK + timestamps).
 */
export async function createTestParent(tx: DBTransaction, userId: number): Promise<ParentSelectType> {
  const [row] = await tx.insert(parents).values({ id: userId }).returning();
  if (!row) {
    throw new Error("createTestParent: insert returned no rows");
  }
  return row;
}

/**
 * Creates an `applicants` row for a previously-created user. Defaults
 * `status='pending'`, `verification_attempts=0`.
 */
export async function createTestApplicant(
  tx: DBTransaction,
  userId: number,
  overrides: Partial<ApplicantSelectType> = {}
): Promise<ApplicantSelectType> {
  const [row] = await tx
    .insert(applicants)
    .values({
      id: userId,
      status: "pending",
      verificationAttempts: 0,
      lastAttemptAt: null,
      cooldownUntil: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestApplicant: insert returned no rows");
  }
  return row;
}

/**
 * Creates an `admin` row for a previously-created user (PK only — the `admin`
 * table has no extra columns beyond shared PK + timestamps).
 */
export async function createTestAdmin(tx: DBTransaction, userId: number): Promise<AdminSelectType> {
  const [row] = await tx.insert(admin).values({ id: userId }).returning();
  if (!row) {
    throw new Error("createTestAdmin: insert returned no rows");
  }
  return row;
}

/**
 * Creates a unique test subscription plan row with randomized unique title.
 */
export async function createTestPlan(
  tx: DBTransaction,
  overrides: Partial<PlanSelectType> = {}
): Promise<PlanSelectType> {
  const [row] = await tx
    .insert(plans)
    .values({
      title: `Test Plan ${randomUUID().slice(0, 8)}`,
      sessionCount: 8,
      price: "200.00",
      currency: "EGP",
      intervalDays: 30,
      isActive: true,
      deactivatedAt: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestPlan: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `teacher` role-child row for a previously-created user with
 * `role='teacher'` (shared PK = `users.id`). Schema-mirroring defaults:
 * uncertified, non-evaluator, offline. Analytics journeys override
 * `isApproved`/`isOnline`/`isEvaluator` to model certified / online /
 * evaluator teachers.
 *
 * @example
 * const teacherUser = await createTestUser(tx, { role: "teacher" });
 * const teacherRow = await createTestTeacherRow(tx, teacherUser.id, { isApproved: true });
 */
export async function createTestTeacherRow(
  tx: DBTransaction,
  userId: number,
  overrides: Partial<TeacherSelectType> = {}
): Promise<TeacherSelectType> {
  const [row] = await tx
    .insert(teacher)
    .values({
      id: userId,
      isApproved: false,
      isEvaluator: false,
      averageRating: null,
      isOnline: false,
      subjects: null,
      requestPreference: TeacherRequestPreference.Queue,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestTeacherRow: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `subscriptions` row linking a purchaser (`userId`, any role)
 * to a `plans` row. Schema-mirroring defaults: `pending` status, no window
 * bounds, no offline-payment metadata. Journeys set explicit
 * RELATIVE-to-`now` `startDate`/`endDate` (REQ-026) plus
 * `status: SubscriptionStatus.Active` and an offline `paymentMethod`
 * (e.g. `PaymentGateway.OfflineCash`) to model ACTIVE-window subscriptions
 * and offline activations.
 *
 * @example
 * const sub = await createTestSubscription(tx, user.id, plan.id, {
 *   status: SubscriptionStatus.Active,
 *   startDate: new Date(now.getTime() - 86_400_000),
 * });
 */
export async function createTestSubscription(
  tx: DBTransaction,
  userId: number,
  planId: number,
  overrides: Partial<SubscriptionSelectType> = {}
): Promise<SubscriptionSelectType> {
  const [row] = await tx
    .insert(subscriptions)
    .values({
      userId,
      planId,
      status: SubscriptionStatus.Pending,
      startDate: null,
      endDate: null,
      paymentMethod: null,
      paymentReference: null,
      paymentVerifiedAt: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestSubscription: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `student_payments` ledger row for a previously-created
 * student. The table is APPEND-ONLY (immutability trigger) — factories
 * must create fresh rows, never mutate existing ones. Schema-mirroring
 * defaults: `pending` status, gateway `stripe`, EGP decimal-string amount
 * (never a float — CHECK `amount >= 0` honored). Journeys set
 * `status: PaymentStatus.Paid`, an explicit `currency` for multi-currency
 * splits, and RELATIVE-to-`now` `createdAt` for window oracles (REQ-026).
 *
 * @example
 * const payment = await createTestStudentPayment(tx, student.id, {
 *   status: PaymentStatus.Paid,
 *   amount: "125.50",
 *   currency: "USD",
 *   createdAt: new Date(now.getTime() - 3_600_000),
 * });
 */
export async function createTestStudentPayment(
  tx: DBTransaction,
  studentId: number,
  overrides: Partial<StudentPaymentSelectType> = {}
): Promise<StudentPaymentSelectType> {
  const [row] = await tx
    .insert(studentPayments)
    .values({
      studentId,
      subscriptionId: null,
      amount: "200.00",
      currency: "EGP",
      paymentGateway: PaymentGateway.Stripe,
      status: PaymentStatus.Pending,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestStudentPayment: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `session` row between a certified teacher (teacher.id — the
 * shared PK with users) and a student (students.id). Schema-mirroring
 * defaults: `scheduled` status, regular `student_session` type, no fee in
 * escrow, no confirmations. Journeys set `status`
 * (e.g. `SessionStatus.Completed`), `confirmedByStudentAt` (the
 * awaiting-confirmation flip), and RELATIVE-to-`now` `createdAt` for the
 * window/trend oracles (REQ-026).
 *
 * @example
 * const sess = await createTestSession(tx, teacherRow.id, student.id, {
 *   status: SessionStatus.Completed,
 *   createdAt: new Date(now.getTime() - 60_000),
 * });
 */
export async function createTestSession(
  tx: DBTransaction,
  teacherId: number,
  studentId: number,
  overrides: Partial<SessionSelectType> = {}
): Promise<SessionSelectType> {
  const [row] = await tx
    .insert(session)
    .values({
      teacherId,
      studentId,
      status: SessionStatus.Scheduled,
      sessionType: SessionType.StudentSession,
      intent: null,
      fee: null,
      feeHeld: false,
      startedAt: null,
      endedAt: null,
      confirmedByStudentAt: null,
      confirmedByTeacherAt: null,
      confirmationDeadline: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestSession: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `reports` post-session report row for a previously-created
 * session. Honors the 0–5 CHECK: `studentRatingByTeacher` defaults to `4`
 * and any override MUST stay within the band (0–5) or the INSERT fails.
 * Sessions cascade-delete their reports.
 *
 * @example
 * const report = await createTestSessionReport(tx, sess.id, { studentRatingByTeacher: 5 });
 */
export async function createTestSessionReport(
  tx: DBTransaction,
  sessionId: number,
  overrides: Partial<ReportSelectType> = {}
): Promise<ReportSelectType> {
  const [row] = await tx
    .insert(reports)
    .values({
      sessionId,
      teacherNotes: "Test report notes",
      studentRatingByTeacher: 4,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestSessionReport: insert returned no rows");
  }
  return row;
}

/**
 * Creates an `evaluations` row: `evaluatedId` (the candidate) and
 * `evaluatorId` (the certified sheikh) are BOTH `users.id` references.
 * Honors the 0–100 CHECK: `score` defaults to `85` and any override MUST
 * stay within the band. Soft-delete (`isDeleted`) is overridable so
 * journeys can model the soft-deleted exclusion.
 *
 * @example
 * const evaluation = await createTestEvaluation(tx, studentUser.id, teacherUser.id, { score: 92 });
 */
export async function createTestEvaluation(
  tx: DBTransaction,
  evaluatedId: number,
  evaluatorId: number,
  overrides: Partial<EvaluationSelectType> = {}
): Promise<EvaluationSelectType> {
  const [row] = await tx
    .insert(evaluations)
    .values({
      evaluatedId,
      evaluatorId,
      sessionId: null,
      score: 85,
      notes: null,
      isDeleted: false,
      deletedAt: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestEvaluation: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `wallet` row for a previously-approved teacher (one wallet per
 * teacher — UNIQUE constraint). Zero-balanced decimal-string defaults
 * (CHECKs `balance >= 0` / `total_earning >= 0` honored).
 *
 * @example
 * const teacherWallet = await createTestWallet(tx, teacherRow.id);
 */
export async function createTestWallet(
  tx: DBTransaction,
  teacherId: number,
  overrides: Partial<WalletSelectType> = {}
): Promise<WalletSelectType> {
  const [row] = await tx
    .insert(wallet)
    .values({
      teacherId,
      balance: "0.00",
      totalEarning: "0.00",
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestWallet: insert returned no rows");
  }
  return row;
}

/**
 * Creates an append-only `teacher_transaction` ledger row against a
 * previously-created wallet. `type` has NO schema default — the factory
 * defaults to `earning`; journeys model a pending withdrawal via
 * `{ type: TransactionType.Withdrawal, status: TransactionStatus.Pending }`.
 * Amounts are decimal strings (CHECK `amount >= 0` honored); the row is
 * immutable after insert (immutability trigger).
 *
 * @example
 * const txRow = await createTestTeacherTransaction(tx, teacherWallet.id, {
 *   type: TransactionType.Withdrawal,
 *   amount: "50.00",
 * });
 */
export async function createTestTeacherTransaction(
  tx: DBTransaction,
  walletId: number,
  overrides: Partial<TeacherTransactionSelectType> = {}
): Promise<TeacherTransactionSelectType> {
  const [row] = await tx
    .insert(teacherTransaction)
    .values({
      walletId,
      sessionId: null,
      description: `Test transaction ${randomUUID().slice(0, 8)}`,
      amount: "10.00",
      type: TransactionType.Earning,
      status: TransactionStatus.Pending,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestTeacherTransaction: insert returned no rows");
  }
  return row;
}
