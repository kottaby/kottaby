/**
 * Pre-resolver scope evaluation — in-process spy proof (handshake queries).
 *
 * This is a BACKEND GraphQL schema-layer unit test, colocated with the schema
 * it proves (moved out of the `frontend/graphql/test/` integration directory
 * per the integration-test guideline: tests there must interact exclusively
 * via the GraphQL API using `testClient`).
 *
 * Why in-process and not wire: cross-process spying on the live server is
 * impossible without test-only server code (prohibited), so the proof
 * executes the SAME built schema the server serves, in-process — identical
 * scope-auth plugin, identical resolvers — with `spyOn` over the service
 * namespace the resolvers call:
 *  - denied cells must record ZERO service calls while resolving to exactly
 *    one error carrying the expected `extensions.code`;
 *  - allowed control cells record exactly one service call each (the zero
 *    above is a scope-layer fact, not a dead spy).
 *
 * Fully mocked service — no database, no server, no fixtures: runs on every
 * provider (the integration file's skip-when-pglite guard does not apply).
 */

import { describe, expect, spyOn, test } from "bun:test";
import { graphql } from "graphql";

import { UserRole } from "@/backend/enum/users/user-role.enum";
import { graphQLSchema } from "@/backend/graphql/gqlSchema";
import { StudentHandshakeService } from "@/backend/services/students/student-handshake.service";

const SELF_READ_SOURCE = "{ myHandshakeCode }";
const DISCOVERY_SOURCE = "query ($code: String!) { findStudentByHandshakeCode(code: $code) { maskedName linkable } }";

const LOCALE_EN = "en";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("handshake code — Tier 4 pre-resolver scope evaluation (service spy, in-process)", () => {
  interface ScopeContextType {
    readonly locale: string;
    readonly role?: UserRole | null;
    readonly user?: { readonly id: number } | null;
  }

  interface DeniedCellType {
    readonly label: string;
    readonly source: string;
    readonly context: ScopeContextType;
    readonly expectedCode: string;
  }

  test("denied cells never execute the service; allowed control cells do (spy proof)", async () => {
    const selfReadSpy = spyOn(StudentHandshakeService, "getMyHandshakeCode").mockImplementation(
      async () => "KSB-00000000"
    );
    const discoverySpy = spyOn(StudentHandshakeService, "findStudentByHandshakeCode").mockImplementation(async () => ({
      maskedName: "M***",
      linkable: true,
    }));
    try {
      const deniedCells: readonly DeniedCellType[] = [
        {
          label: "anonymous on self-read",
          source: SELF_READ_SOURCE,
          context: { locale: LOCALE_EN },
          expectedCode: "UNAUTHORIZED",
        },
        {
          label: "anonymous on discovery",
          source: DISCOVERY_SOURCE,
          context: { locale: LOCALE_EN },
          expectedCode: "UNAUTHORIZED",
        },
        {
          label: "parent on self-read",
          source: SELF_READ_SOURCE,
          context: { locale: LOCALE_EN, role: UserRole.Parent, user: { id: 1 } },
          expectedCode: "FORBIDDEN",
        },
        {
          label: "teacher on self-read",
          source: SELF_READ_SOURCE,
          context: { locale: LOCALE_EN, role: UserRole.Teacher, user: { id: 1 } },
          expectedCode: "FORBIDDEN",
        },
        {
          label: "admin on self-read",
          source: SELF_READ_SOURCE,
          context: { locale: LOCALE_EN, role: UserRole.Admin, user: { id: 1 } },
          expectedCode: "FORBIDDEN",
        },
        {
          label: "non-canonical role claim on self-read",
          source: SELF_READ_SOURCE,
          context: { locale: LOCALE_EN, role: null, user: { id: 1 } },
          expectedCode: "FORBIDDEN",
        },
        {
          label: "student on discovery",
          source: DISCOVERY_SOURCE,
          context: { locale: LOCALE_EN, role: UserRole.Student, user: { id: 1 } },
          expectedCode: "FORBIDDEN",
        },
        {
          label: "teacher on discovery",
          source: DISCOVERY_SOURCE,
          context: { locale: LOCALE_EN, role: UserRole.Teacher, user: { id: 1 } },
          expectedCode: "FORBIDDEN",
        },
        {
          label: "admin on discovery",
          source: DISCOVERY_SOURCE,
          context: { locale: LOCALE_EN, role: UserRole.Admin, user: { id: 1 } },
          expectedCode: "FORBIDDEN",
        },
        {
          label: "non-canonical role claim on discovery",
          source: DISCOVERY_SOURCE,
          context: { locale: LOCALE_EN, role: null, user: { id: 1 } },
          expectedCode: "FORBIDDEN",
        },
      ];

      const outcomes = await Promise.all(
        deniedCells.map(cell =>
          graphql({
            schema: graphQLSchema,
            source: cell.source,
            variableValues: cell.source === DISCOVERY_SOURCE ? { code: "KSB-00000000" } : undefined,
            contextValue: cell.context,
          })
        )
      );
      for (const [index, outcome] of outcomes.entries()) {
        const cell = deniedCells[index];
        if (!cell) {
          throw new Error("denied-cell outcome missing its cell");
        }
        expect(outcome.errors).toHaveLength(1);
        expect(outcome.errors?.[0]?.extensions?.code).toBe(cell.expectedCode);
      }

      // THE pre-resolver proof: not a single denied cell reached the service.
      expect(selfReadSpy).toHaveBeenCalledTimes(0);
      expect(discoverySpy).toHaveBeenCalledTimes(0);

      // Instrumentation control: the allowed cells DO reach the (mocked)
      // service exactly once each — the zero above is a scope-layer fact, not
      // a dead spy.
      const [selfReadHit, discoveryHit] = await Promise.all([
        graphql({
          schema: graphQLSchema,
          source: SELF_READ_SOURCE,
          contextValue: { locale: LOCALE_EN, role: UserRole.Student, user: { id: 1 } },
        }),
        graphql({
          schema: graphQLSchema,
          source: DISCOVERY_SOURCE,
          variableValues: { code: "KSB-00000000" },
          contextValue: { locale: LOCALE_EN, role: UserRole.Parent, user: { id: 1 } },
        }),
      ]);
      expect(selfReadHit.errors).toBeUndefined();
      const selfReadData: unknown = selfReadHit.data;
      if (!isRecord(selfReadData)) {
        throw new Error("expected control self-read data");
      }
      expect(selfReadData.myHandshakeCode).toBe("KSB-00000000");

      expect(discoveryHit.errors).toBeUndefined();
      const discoveryData: unknown = discoveryHit.data;
      if (!isRecord(discoveryData)) {
        throw new Error("expected control discovery data");
      }
      const controlPayload: unknown = discoveryData.findStudentByHandshakeCode;
      if (!isRecord(controlPayload)) {
        throw new Error("expected control discovery payload");
      }
      expect(controlPayload.linkable).toBe(true);

      expect(selfReadSpy).toHaveBeenCalledTimes(1);
      expect(discoverySpy).toHaveBeenCalledTimes(1);
    } finally {
      selfReadSpy.mockRestore();
      discoverySpy.mockRestore();
    }
  });
});
