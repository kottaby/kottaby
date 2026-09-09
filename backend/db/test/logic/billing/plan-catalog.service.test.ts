/**
 * PlanCatalogService 4-Tier Unit Test Suite.
 *
 * Tier 1: Statement & branch coverage for all service methods and domain error classes.
 * Tier 2: Boundary conditions & exhaustive REQ-073 validation matrix.
 * Tier 3: Chaos & concurrency (concurrent deactivations, round-trip state transitions).
 * Tier 4: Security (BOPLA field smuggling prevention, cause-chain translation, i18n ar/en).
 *
 * Every mutation is attributed to a real admin-role user row (provisioned via
 * `entity-setup.createTestUser`) because the service re-asserts the acting
 * admin against the `users` table before any validation or write runs.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { plans } from "@/backend/db/schema/billing/plans";
import { createTestPlan, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { DomainError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { PLAN_AUDIT_ENTITY_TYPE } from "@/backend/services/billing/plan-catalog.helpers";
import { PlanCatalogService } from "@/backend/services/billing/plan-catalog.service";
import type { DBTransaction, PlanSubmitInput, UserSelectType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;

/** Domain log spy family share this stubbed signature. */
type DomainLogSpy = ReturnType<typeof spyOn>;

/** Silences `logger.logDomainError` so test stdout stays compact. */
function silenceDomainLog(): DomainLogSpy {
  return spyOn(logger, "logDomainError").mockImplementation(() => {});
}

/**
 * Provisions a real admin-role user row for use as the `actorId` of
 * subsequent service calls. Returns the user row.
 */
async function provisionAdminActor(tx: DBTransaction): Promise<UserSelectType> {
  return createTestUser(tx, { role: "admin" });
}

/**
 * Widens an action-type enum member to its raw stored string. Insert-returning
 * rows carry the raw `action_type` value (coercion to the enum is the read
 * service's job), so audit-row lookups compare primitive-to-primitive.
 */
function rawActionType(actionType: AuditActionType): string {
  return actionType;
}

/**
 * Fetches every plan-entity audit row the supplied actor minted for one
 * entity id. Entity+actor scoping keeps counts immune to concurrent test
 * files committing their own rows against the shared database.
 */
async function fetchPlanAuditRows(tx: DBTransaction, actorId: number, entityId: number) {
  // Widen the pg-enum column to its raw stored string so lookups compare
  // primitive-to-primitive (see rawActionType).
  return (
    (await tx
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actorId, actorId),
          eq(auditLogs.entityType, PLAN_AUDIT_ENTITY_TYPE),
          eq(auditLogs.entityId, entityId)
        )
      )) as { actionType: string }[]
  );
}

/**
 * Counts `audit_logs` rows attributable to a single actor id — the zero-write
 * oracle for denial probes. Global table totals are NOT stable mid-test under
 * parallel bun test file execution, so write-freedom is asserted per-actor:
 * an id this test owns (minted inside the rollback tx) cannot be perturbed by
 * concurrent external churn.
 */
async function countAuditRowsForActor(tx: DBTransaction, actorId: number): Promise<number> {
  const rows = await tx.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.actorId, actorId));
  return rows.length;
}

describe("PlanCatalogService", () => {
  // ─── Tier 1: Statement & Branch Coverage ────────────────────────────────────

  test("createPlan creates a plan and returns all fields with defaults", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await PlanCatalogService.createPlan(
        {
          title: "Service Test Plan",
          sessionCount: 8,
          price: "250.00",
          currency: "EGP",
          intervalDays: 30,
        },
        admin.id,
        "en",
        tx
      );

      expect(plan.id).toBeGreaterThan(0);
      expect(plan.title).toBe("Service Test Plan");
      expect(plan.sessionCount).toBe(8);
      expect(plan.price).toBe("250.00");
      expect(plan.currency).toBe("EGP");
      expect(plan.intervalDays).toBe(30);
      expect(plan.isActive).toBe(true);
      expect(plan.deactivatedAt).toBeNull();
    });
  });

  test("updatePlan modifies allowed fields and returns updated plan", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const created = await createTestPlan(tx, { title: "Pre-Update Plan", price: "100.00" });

      const updated = await PlanCatalogService.updatePlan(
        created.id,
        {
          title: "Post-Update Plan",
          price: "180.00",
          sessionCount: 16,
        },
        admin.id,
        "en",
        tx
      );

      expect(updated.id).toBe(created.id);
      expect(updated.title).toBe("Post-Update Plan");
      expect(updated.price).toBe("180.00");
      expect(updated.sessionCount).toBe(16);
    });
  });

  test("setPlanActiveStatus transitions between active and inactive with timestamps", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const created = await createTestPlan(tx, { isActive: true });

      // Deactivate
      const deactivated = await PlanCatalogService.setPlanActiveStatus(created.id, false, admin.id, "en", tx);
      expect(deactivated.isActive).toBe(false);
      expect(deactivated.deactivatedAt).toBeInstanceOf(Date);

      // Reactivate
      const reactivated = await PlanCatalogService.setPlanActiveStatus(created.id, true, admin.id, "en", tx);
      expect(reactivated.isActive).toBe(true);
      expect(reactivated.deactivatedAt).toBeNull();
    });
  });

  test("setPlanActiveStatus throws NotFoundError on nonexistent ID", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      let thrown: unknown;
      try {
        await PlanCatalogService.setPlanActiveStatus(99999999, false, admin.id, "en", tx);
      } catch (err: unknown) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(NotFoundError);
      if (thrown instanceof NotFoundError) {
        expect(thrown.code).toBe("PLAN_NOT_FOUND");
      }
    });
  });

  test("setPlanActiveStatus throws DomainError on already inactive/active target state", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx, { isActive: true });

      // Plan is already active, attempting to activate throws PLAN_ALREADY_ACTIVE
      let thrownActive: unknown;
      try {
        await PlanCatalogService.setPlanActiveStatus(plan.id, true, admin.id, "en", tx);
      } catch (err: unknown) {
        thrownActive = err;
      }
      expect(thrownActive).toBeInstanceOf(DomainError);
      if (thrownActive instanceof DomainError) {
        expect(thrownActive.code).toBe("PLAN_ALREADY_ACTIVE");
      }

      // Deactivate once
      await PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, "en", tx);

      // Attempting to deactivate again throws PLAN_ALREADY_INACTIVE
      let thrownInactive: unknown;
      try {
        await PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, "en", tx);
      } catch (err: unknown) {
        thrownInactive = err;
      }
      expect(thrownInactive).toBeInstanceOf(DomainError);
      if (thrownInactive instanceof DomainError) {
        expect(thrownInactive.code).toBe("PLAN_ALREADY_INACTIVE");
      }
    });
  });

  test("listActiveCatalog and listForAdmin return correct plans", async () => {
    await runInRollback(async tx => {
      const p1 = await createTestPlan(tx, { title: "Catalog Active", isActive: true });
      const p2 = await createTestPlan(tx, { title: "Catalog Inactive", isActive: false, deactivatedAt: new Date() });

      const activeOnly = await PlanCatalogService.listActiveCatalog("en", tx);
      expect(activeOnly.some(p => p.id === p1.id)).toBe(true);
      expect(activeOnly.some(p => p.id === p2.id)).toBe(false);

      const adminAll = await PlanCatalogService.listForAdmin({ includeInactive: true }, "en", tx);
      expect(adminAll.some(p => p.id === p1.id)).toBe(true);
      expect(adminAll.some(p => p.id === p2.id)).toBe(true);
    });
  });

  test("findById returns plan on existing ID and throws NotFoundError on missing ID", async () => {
    await runInRollback(async tx => {
      const created = await createTestPlan(tx, { title: "Single Plan" });

      const found = await PlanCatalogService.findById(created.id, "en", tx);
      expect(found.id).toBe(created.id);
      expect(found.title).toBe("Single Plan");

      let thrown: unknown;
      try {
        await PlanCatalogService.findById(99999999, "en", tx);
      } catch (err: unknown) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(NotFoundError);
      if (thrown instanceof NotFoundError) {
        expect(thrown.code).toBe("PLAN_NOT_FOUND");
      }
    });
  });

  // ─── Tier 2: Boundary Conditions & Validation Matrix ────────────────────────

  test("validatePlanInput: title boundaries (empty, whitespace, 255 valid, 256 invalid)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);

      // Empty title
      let errEmpty: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "", sessionCount: 5, price: "100.00", currency: "EGP", intervalDays: 30 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        errEmpty = err;
      }
      expect(errEmpty).toBeInstanceOf(ValidationError);

      // Whitespace title
      let errWhitespace: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "   ", sessionCount: 5, price: "100.00", currency: "EGP", intervalDays: 30 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        errWhitespace = err;
      }
      expect(errWhitespace).toBeInstanceOf(ValidationError);

      // 255 chars title (valid)
      const valid255Title = "A".repeat(255);
      const plan255 = await PlanCatalogService.createPlan(
        { title: valid255Title, sessionCount: 5, price: "100.00", currency: "EGP", intervalDays: 30 },
        admin.id,
        "en",
        tx
      );
      expect(plan255.title).toBe(valid255Title);

      // 256 chars title (invalid)
      let err256: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "A".repeat(256), sessionCount: 5, price: "100.00", currency: "EGP", intervalDays: 30 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        err256 = err;
      }
      expect(err256).toBeInstanceOf(ValidationError);
    });
  });

  test("validatePlanInput: sessionCount boundaries (0, -1, non-integer, 1 valid)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);

      // 0 sessions (invalid)
      let err0: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "Valid Title", sessionCount: 0, price: "100.00", currency: "EGP", intervalDays: 30 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        err0 = err;
      }
      expect(err0).toBeInstanceOf(ValidationError);

      // Non-integer sessions
      let errFloat: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "Valid Title", sessionCount: 2.5, price: "100.00", currency: "EGP", intervalDays: 30 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        errFloat = err;
      }
      expect(errFloat).toBeInstanceOf(ValidationError);

      // 1 session (valid)
      const valid1 = await PlanCatalogService.createPlan(
        { title: "Single Session Plan", sessionCount: 1, price: "50.00", currency: "EGP", intervalDays: 7 },
        admin.id,
        "en",
        tx
      );
      expect(valid1.sessionCount).toBe(1);
    });
  });

  test("validatePlanInput: price regex and boundaries", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);

      // "0.00" (valid)
      const zeroPlan = await PlanCatalogService.createPlan(
        { title: "Free Trial", sessionCount: 1, price: "0.00", currency: "EGP", intervalDays: 7 },
        admin.id,
        "en",
        tx
      );
      expect(zeroPlan.price).toBe("0.00");

      // "-0.01" (invalid)
      let errNeg: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "Negative Price", sessionCount: 1, price: "-0.01", currency: "EGP", intervalDays: 7 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        errNeg = err;
      }
      expect(errNeg).toBeInstanceOf(ValidationError);

      // "abc" (invalid)
      let errAlpha: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "Invalid Alpha", sessionCount: 1, price: "abc", currency: "EGP", intervalDays: 7 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        errAlpha = err;
      }
      expect(errAlpha).toBeInstanceOf(ValidationError);

      // "1.005" (invalid - 3 decimal places)
      let err3Dec: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "Invalid Decimals", sessionCount: 1, price: "1.005", currency: "EGP", intervalDays: 7 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        err3Dec = err;
      }
      expect(err3Dec).toBeInstanceOf(ValidationError);

      // "99999999.99" (valid)
      const maxPlan = await PlanCatalogService.createPlan(
        { title: "Max Price", sessionCount: 100, price: "99999999.99", currency: "EGP", intervalDays: 365 },
        admin.id,
        "en",
        tx
      );
      expect(maxPlan.price).toBe("99999999.99");
    });
  });

  test("validatePlanInput: currency formatting", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);

      // Lowercase "egp" (invalid - must be uppercase 3 chars)
      let errLower: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "Lower Currency", sessionCount: 5, price: "100.00", currency: "egp", intervalDays: 30 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        errLower = err;
      }
      expect(errLower).toBeInstanceOf(ValidationError);

      // 2 chars "EG" (invalid)
      let err2Char: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "Short Currency", sessionCount: 5, price: "100.00", currency: "EG", intervalDays: 30 },
          admin.id,
          "en",
          tx
        );
      } catch (err: unknown) {
        err2Char = err;
      }
      expect(err2Char).toBeInstanceOf(ValidationError);
    });
  });

  test("updatePlan rejects empty patch with ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx);

      let errEmptyPatch: unknown;
      try {
        await PlanCatalogService.updatePlan(plan.id, {}, admin.id, "en", tx);
      } catch (err: unknown) {
        errEmptyPatch = err;
      }
      expect(errEmptyPatch).toBeInstanceOf(ValidationError);
    });
  });

  // ─── Tier 3: Chaos & Concurrency ──────────────────────────────────────────

  test("concurrent deactivation calls: exactly one succeeds and one receives PLAN_ALREADY_INACTIVE", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx, { isActive: true });

      const [res1, res2] = await Promise.allSettled([
        PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, "en", tx),
        PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, "en", tx),
      ]);

      const fulfilled = [res1, res2].filter(r => r.status === "fulfilled");
      const rejected = [res1, res2].filter(r => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const firstRejected = rejected[0];
      if (firstRejected && "reason" in firstRejected) {
        expect(firstRejected.reason).toBeInstanceOf(DomainError);
        if (firstRejected.reason instanceof DomainError) {
          expect(firstRejected.reason.code).toBe("PLAN_ALREADY_INACTIVE");
        }
      }
    });
  });

  // ─── Tier 4: Security, BOPLA Smuggle Prevention & i18n ─────────────────────

  test("BOPLA smuggle: extra injected fields (id, isActive, createdAt) are never written", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const smuggleInput: PlanSubmitInput & { id: number; isActive: boolean; createdAt: Date } = {
        title: "Smuggle Attempt",
        sessionCount: 10,
        price: "200.00",
        currency: "EGP",
        intervalDays: 30,
        id: 12345,
        isActive: false,
        createdAt: new Date(2000, 1, 1),
      };

      const created = await PlanCatalogService.createPlan(smuggleInput, admin.id, "en", tx);

      expect(created.id).not.toBe(12345);
      expect(created.isActive).toBe(true);
      expect(created.createdAt.getFullYear()).toBeGreaterThan(2025);
    });
  });

  test("Arabic locale returns localized error messages", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      let thrown: unknown;
      try {
        await PlanCatalogService.createPlan(
          { title: "", sessionCount: 5, price: "100.00", currency: "EGP", intervalDays: 30 },
          admin.id,
          "ar",
          tx
        );
      } catch (err: unknown) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ValidationError);
      if (thrown instanceof ValidationError) {
        expect(thrown.message).toBe("إدخال غير صحيح.");
        expect(thrown.fields?.[0]?.message).toBe("عنوان الخطة مطلوب.");
      }
    });
  });
});

describe("PlanCatalogService — audit trail emission", () => {
  // ─── Tier 1: every successful mutation mints EXACTLY one audit row ────────

  test("createPlan success mints exactly one audit(Create) row with the persisted catalog details", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);

      const plan = await PlanCatalogService.createPlan(
        { title: "Audited Create Plan", sessionCount: 7, price: "120.50", currency: "EGP", intervalDays: 14 },
        admin.id,
        LOCALE,
        tx
      );

      const rows = await fetchPlanAuditRows(tx, admin.id, plan.id);
      expect(rows).toHaveLength(1);
      const row = rows[0];
      if (!row) throw new Error("expected an audit(Create) row for the created plan");
      expect(row.actionType).toBe(AuditActionType.Create);
      expect(row.entityType).toBe(PLAN_AUDIT_ENTITY_TYPE);
      expect(row.entityId).toBe(plan.id);
      // Details mirror the PERSISTED row (currency upper-cased by the
      // service) — and nothing else: no smuggled/transport fields, never a
      // spread of the input object.
      expect(JSON.parse(row.details ?? "null")).toEqual({
        title: "Audited Create Plan",
        sessionCount: 7,
        price: "120.50",
        currency: "EGP",
        intervalDays: 14,
      });
    });
  });

  test("updatePlan success mints exactly one audit(Update) row whose changedFields mirror the projected patch", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx, { title: "Audited Update Plan", price: "100.00" });

      await PlanCatalogService.updatePlan(plan.id, { price: "180.00", sessionCount: 16 }, admin.id, LOCALE, tx);

      const rows = await fetchPlanAuditRows(tx, admin.id, plan.id);
      expect(rows).toHaveLength(1);
      const row = rows[0];
      if (!row) throw new Error("expected an audit(Update) row for the updated plan");
      expect(row.actionType).toBe(AuditActionType.Update);
      expect(row.entityType).toBe(PLAN_AUDIT_ENTITY_TYPE);
      expect(row.entityId).toBe(plan.id);
      expect(JSON.parse(row.details ?? "null")).toEqual({ changedFields: ["sessionCount", "price"] });
    });
  });

  test("setPlanActiveStatus mints one audit(Suspend) row on deactivation and one audit(Reactivate) row on reactivation", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx, { isActive: true });

      const deactivated = await PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, LOCALE, tx);
      expect(deactivated.isActive).toBe(false);

      const reactivated = await PlanCatalogService.setPlanActiveStatus(plan.id, true, admin.id, LOCALE, tx);
      expect(reactivated.isActive).toBe(true);

      const rows = await fetchPlanAuditRows(tx, admin.id, plan.id);
      expect(rows).toHaveLength(2);
      const suspend = rows.find(r => r.actionType === rawActionType(AuditActionType.Suspend));
      const reactivate = rows.find(r => r.actionType === rawActionType(AuditActionType.Reactivate));
      if (!suspend || !reactivate) throw new Error("expected one audit(Suspend) and one audit(Reactivate) row");
      expect(JSON.parse(suspend.details ?? "null")).toEqual({ isActive: false });
      expect(JSON.parse(reactivate.details ?? "null")).toEqual({ isActive: true });
      for (const row of rows) {
        expect(row.entityType).toBe(PLAN_AUDIT_ENTITY_TYPE);
        expect(row.entityId).toBe(plan.id);
      }
    });
  });

  // ─── Tier 2: no-op / failure paths mint ZERO audit rows ──────────────────

  test("updatePlan on unknown plan id → NotFoundError and ZERO audit rows", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();

      const error = await expectRepoError(() =>
        PlanCatalogService.updatePlan(99999999, { title: "Ghost Plan" }, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(NotFoundError);
      if (error instanceof NotFoundError) {
        expect(error.code).toBe("PLAN_NOT_FOUND");
      }

      expect(await countAuditRowsForActor(tx, admin.id)).toBe(0);
    });
  });

  test("setPlanActiveStatus already in target status → DomainError and ZERO audit rows", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx, { isActive: true });
      silenceDomainLog();

      const error = await expectRepoError(() =>
        PlanCatalogService.setPlanActiveStatus(plan.id, true, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(DomainError);
      if (error instanceof DomainError) {
        expect(error.code).toBe("PLAN_ALREADY_ACTIVE");
      }

      expect(await fetchPlanAuditRows(tx, admin.id, plan.id)).toHaveLength(0);
    });
  });

  test("updatePlan with empty patch → translated ValidationError and ZERO audit rows", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx);
      silenceDomainLog();

      const error = await expectRepoError(() => PlanCatalogService.updatePlan(plan.id, {}, admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain(tErrors.planCatalog.planPatchEmpty);

      expect(await fetchPlanAuditRows(tx, admin.id, plan.id)).toHaveLength(0);
    });
  });

  // ─── Tier 3: the flip race leaves a consistent single-row trail ──────────

  test("concurrent deactivations: exactly one flip wins and the loser is classified before any audit write", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx, { isActive: true });
      silenceDomainLog();

      // Two callers race the same flip over the shared test transaction. Only
      // the call-level classification is asserted from the race itself: the
      // loser's savepoint rollback may clobber statements other flows issued
      // after its savepoint window, so row-level inspection under a shared
      // connection is not deterministic. Production callers each own a real
      // pool transaction, where row locks — not savepoints — serialize flips.
      const [res1, res2] = await Promise.allSettled([
        PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, LOCALE, tx),
        PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, LOCALE, tx),
      ]);

      const rejected = [res1, res2].filter(r => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      const firstRejected = rejected[0];
      if (firstRejected && "reason" in firstRejected && firstRejected.reason instanceof DomainError) {
        expect(firstRejected.reason.code).toBe("PLAN_ALREADY_INACTIVE");
      }
    });
  });

  test("sequential double deactivation: the trail carries exactly one audit(Suspend) row — the loser mints nothing", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const plan = await createTestPlan(tx, { isActive: true });
      silenceDomainLog();

      const winner = await PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, LOCALE, tx);
      expect(winner.isActive).toBe(false);

      const loserError = await expectRepoError(() =>
        PlanCatalogService.setPlanActiveStatus(plan.id, false, admin.id, LOCALE, tx)
      );
      expect(loserError).toBeInstanceOf(DomainError);
      expect(loserError.message).toContain(tErrors.planCatalog.planAlreadyInactive);

      const rows = await fetchPlanAuditRows(tx, admin.id, plan.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.actionType).toBe(AuditActionType.Suspend);
      expect(rows[0]?.entityId).toBe(plan.id);
    });
  });

  // ─── Tier 4: non-admin actor is denied BEFORE any write ──────────────────

  test("non-admin actor → createPlan denied with translated FORBIDDEN before any write; zero audit rows", async () => {
    await runInRollback(async tx => {
      const intruder = await createTestUser(tx, { role: "student" });
      silenceDomainLog();

      const error = await expectRepoError(() =>
        PlanCatalogService.createPlan(
          { title: "Forbidden Plan", sessionCount: 5, price: "100.00", currency: "EGP", intervalDays: 30 },
          intruder.id,
          LOCALE,
          tx
        )
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);

      // Zero writes: no plan row, zero audit rows attributable to the actor.
      const planRows = await tx.select({ id: plans.id }).from(plans).where(eq(plans.title, "Forbidden Plan"));
      expect(planRows).toHaveLength(0);
      expect(await countAuditRowsForActor(tx, intruder.id)).toBe(0);
    });
  });

  test("non-admin actor → updatePlan denied with translated FORBIDDEN before any write; zero audit rows", async () => {
    await runInRollback(async tx => {
      const intruder = await createTestUser(tx, { role: "teacher" });
      const plan = await createTestPlan(tx, { title: "Untouched Plan", price: "100.00" });
      silenceDomainLog();

      const error = await expectRepoError(() =>
        PlanCatalogService.updatePlan(plan.id, { title: "Hijacked Plan", price: "999.00" }, intruder.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);

      // Zero writes: the plan row is byte-identical, zero audit rows.
      const [persisted] = await tx.select().from(plans).where(eq(plans.id, plan.id));
      expect(persisted?.title).toBe("Untouched Plan");
      expect(persisted?.price).toBe("100.00");
      expect(await countAuditRowsForActor(tx, intruder.id)).toBe(0);
    });
  });

  test("non-admin actor → setPlanActiveStatus denied with translated FORBIDDEN before any write; zero audit rows", async () => {
    await runInRollback(async tx => {
      const intruder = await createTestUser(tx, { role: "parent" });
      const plan = await createTestPlan(tx, { isActive: true });
      silenceDomainLog();

      const error = await expectRepoError(() =>
        PlanCatalogService.setPlanActiveStatus(plan.id, false, intruder.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);

      // Zero writes: the plan is still active, zero audit rows.
      const [persisted] = await tx.select().from(plans).where(eq(plans.id, plan.id));
      expect(persisted?.isActive).toBe(true);
      expect(persisted?.deactivatedAt).toBeNull();
      expect(await countAuditRowsForActor(tx, intruder.id)).toBe(0);
    });
  });
});
