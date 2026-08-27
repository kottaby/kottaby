import { db } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A Prisma transaction client (for tx propagation per REQ-041).
 * Repository methods accept `tx?` as the optional last parameter.
 */
export type DBTransaction = Prisma.TransactionClient;

type TxOrDb = PrismaClient | DBTransaction;

/**
 * DEV1-004 — StudentRepository
 *
 * Repository layer: pure data access, no domain errors, no i18n, no permission
 * logic. Returns booleans/primitives; the service layer translates failures
 * into domain errors.
 */
export const StudentRepository = {
  /**
   * Create a student record inside the current transaction.
   * (Registration path — called before the trial grant.)
   */
  async create(
    data: { email: string; fullName: string; role: string; locale: string },
    tx?: DBTransaction,
  ) {
    const queryDb: TxOrDb = tx ?? db;
    return queryDb.student.create({
      data: {
        email: data.email.toLowerCase(),
        fullName: data.fullName,
        role: data.role,
        locale: data.locale,
      },
    });
  },

  /**
   * REQ-012 / REQ-042 — Grant the free trial credit atomically.
   *
   * Single conditional UPDATE: increments `balanceTrial` and sets
   * `trialGrantedAt = now()` ONLY IF `trialGrantedAt IS NULL`. This is the
   * atomicity mechanism (no SELECT-then-UPDATE TOCTOU window). The row is
   * transactionally locked by the UPDATE itself.
   *
   * @returns `true` if the grant was applied (fresh), `false` if the guard
   *          predicate matched zero rows (already granted or student missing).
   *          The service layer converts `false` into a `ConflictError`.
   */
  async grantFreeTrialOnce(
    studentId: string,
    trialCount: number,
    tx?: DBTransaction,
  ): Promise<boolean> {
    const queryDb: TxOrDb = tx ?? db;
    const updated = await queryDb.student.updateMany({
      where: {
        id: studentId,
        trialGrantedAt: null,
      },
      data: {
        balanceTrial: { increment: trialCount },
        trialGrantedAt: new Date(),
      },
    });
    return updated.count > 0;
  },

  /**
   * Find a student by email (for re-registration / login lookups).
   */
  async findByEmail(email: string, tx?: DBTransaction) {
    const queryDb: TxOrDb = tx ?? db;
    return queryDb.student.findUnique({
      where: { email: email.toLowerCase() },
    });
  },

  /**
   * Find a student by id (for eligibility checks / dashboard reads).
   */
  async findById(id: string, tx?: DBTransaction) {
    const queryDb: TxOrDb = tx ?? db;
    return queryDb.student.findUnique({ where: { id } });
  },
};
