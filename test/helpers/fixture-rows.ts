/**
 * Direct-DB fixture-row primitives for the live-server GraphQL integration
 * suites — the sanctioned provisioning seam (frontend/graphql/test/AGENTS.md:
 * integration test FILES interact via testClient exclusively; shared test
 * infrastructure under `test/helpers/` owns entity provisioning that has no
 * public GraphQL surface, e.g. the admin role-child row or a certified
 * `teacher` child row). Rows are inserted with full column control over
 * lifecycle state; the suites accumulate committed rows on the test
 * database by convention (no cleanup).
 */

import { eq } from "drizzle-orm";
import { db } from "@/backend/db";
import { plans } from "@/backend/db/schema/billing/plans";
import { session } from "@/backend/db/schema/classes/session";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
import { SubscriptionCreditLane } from "@/backend/enum/billing/subscription-credit-lane.enum";
import { HeldBalanceLane } from "@/backend/enum/scheduling/held-balance-lane.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import type { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { hashPassword } from "@/backend/lib/auth/password";
import {
  VERIFICATION_PLAN_CURRENCY,
  VERIFICATION_PLAN_INTERVAL_DAYS,
  VERIFICATION_PLAN_PRICE,
  VERIFICATION_PLAN_SESSION_COUNT,
  VERIFICATION_PLAN_TITLE,
} from "@/shared/constants/verification-plan.constants";

/** Direct-DB session-row insert (full column control over lifecycle state). */
export async function insertSessionRow(overrides: {
  teacherId: number;
  studentId: number;
  status: SessionStatus;
}): Promise<{ id: number }> {
  const [row] = await db
    .insert(session)
    .values({
      teacherId: overrides.teacherId,
      studentId: overrides.studentId,
      status: overrides.status,
      sessionType: SessionType.StudentSession,
      intent: SessionIntent.Hifz,
      fee: "10.00",
      feeHeld: true,
      heldBalanceLane: HeldBalanceLane.Hifz,
    })
    .returning({ id: session.id });
  if (!row) throw new Error("session insert returned no rows");
  return row;
}

/**
 * Certified-teacher child row for an already-registered teacher user
 * (`isApproved=true` — the only shape that hosts real sessions).
 */
export async function insertCertifiedTeacherRow(userId: number): Promise<number> {
  const [teacherRow] = await db.insert(teacher).values({ id: userId, isApproved: true }).returning({ id: teacher.id });
  if (!teacherRow) throw new Error("teacher child-row insert returned no rows");
  return teacherRow.id;
}

/**
 * Committed ACTIVE verification-plan catalog row (the seeded product
 * contract: canonical title constant, session count, price, currency,
 * interval, Reviews lane). Provisioned ONLY when the catalog lacks the
 * canonical member — the purchase flow resolves the plan server-side by
 * exact title, and the purchase service REJECTS an ambiguous catalog
 * (multiple active rows sharing the canonical title), so suites must never
 * blind-insert a second one. Returns the row id for explicit cleanup.
 */
export async function insertVerificationPlanRow(): Promise<{ id: number }> {
  const [row] = await db
    .insert(plans)
    .values({
      title: VERIFICATION_PLAN_TITLE,
      sessionCount: VERIFICATION_PLAN_SESSION_COUNT,
      price: VERIFICATION_PLAN_PRICE,
      currency: VERIFICATION_PLAN_CURRENCY,
      intervalDays: VERIFICATION_PLAN_INTERVAL_DAYS,
      balanceLane: SubscriptionCreditLane.Reviews,
      isActive: true,
    })
    .returning({ id: plans.id });
  if (!row) throw new Error("verification plan fixture insert returned no rows");
  return row;
}

/**
 * Explicit-id hard delete of a tracked plan fixture row plus its zero
 * residue re-probe (the suites' afterAll hygiene, owned by this seam so
 * the integration test files stay on the GraphQL boundary).
 */
export async function deletePlanRowById(id: number): Promise<void> {
  await db.delete(plans).where(eq(plans.id, id));
  const residue = await db.$count(plans, eq(plans.id, id));
  if (residue !== 0) {
    throw new Error(`plan fixture cleanup failed: plan ${id} still present`);
  }
}

/**
 * Admin user + `admin` child row for an email that must NOT go through the
 * public registration (RegisterPublicRole BFLA exclusion). Returns the
 * admin user's numeric id so the suite can log in over the real login path.
 */
export async function insertAdminUserWithChildRow(params: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}): Promise<number> {
  const [adminUser] = await db
    .insert(users)
    .values({
      fullName: params.fullName,
      email: params.email,
      phone: params.phone,
      passwordHash: await hashPassword(params.password),
      role: "admin",
      isDeleted: false,
      suspended: false,
      isBlocked: false,
      lastActiveAt: new Date(),
    })
    .returning();
  if (!adminUser) throw new Error("admin user insert returned no rows");
  const [adminRow] = await db.insert(admin).values({ id: adminUser.id }).returning({ id: admin.id });
  if (!adminRow) throw new Error("admin child-row insert returned no rows");
  return adminUser.id;
}
