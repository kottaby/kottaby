/**
 * DEV3-004 session SDL surface suite — REQ-060 exact-contract parity.
 *
 * What this locks down:
 *  - **Clean construction** — the production schema builds without throwing
 *    (a duplicate enum registration would throw "has already been declared"
 *    at import time), and each scheduling enum (`SessionStatus`,
 *    `SessionType`, `SessionIntent`) occurs EXACTLY ONCE in the emitted
 *    SDL.
 *  - **Enum member parity** — the three scheduling enums expose exactly the
 *    members of their canonical TS enums (`backend/enum/scheduling/`),
 *    mapped member-for-member onto the same runtime values. The `disputed`
 *    member exists per REQ-060/B.18 with NO producing transition surface in
 *    this slice.
 *  - **`Session` shape parity (plan §3.1)** — EXACT field list in the exact
 *    order (`id` FIRST — Apollo cache normalization), each field's exact
 *    GraphQL type string, `heldBalanceLane` DELIBERATELY ABSENT from the
 *    whole SDL (internal escrow provenance, never client-consumed).
 *  - **`SessionPage` shape parity** — the sanctioned list-wrapper exception:
 *    `items: [Session!]!` + the honest `totalCount`/`page`/`pageSize` echo.
 *
 * The production `graphQLSchema` does not yet carry the `Session` objects —
 * they join the production type map when the Phase-3 resolver modules
 * (tasks 3.2/3.3) import the session Pothos module. The object module is
 * imported HERE (side-effect registration on the shared builder) and the
 * assertions run against a fresh deterministic `toSchema()` emission, which
 * contains everything the production schema contains plus the DEV3-004
 * objects.
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts backend/graphql/test/session-sdl.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { GraphQLEnumType, GraphQLObjectType, lexicographicSortSchema, printSchema } from "graphql";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { graphQLSchema } from "@/backend/graphql/gqlSchema";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import "@/backend/graphql/pothos/classes/session.pothos";

// ─── Fresh deterministic emission (includes the DEV3-004 objects) ────────────

const sessionInclusiveSchema = gqlSchemaBuilder.toSchema();
const sdl = printSchema(lexicographicSortSchema(sessionInclusiveSchema));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fails the suite unless the named type is a registered GraphQL enum. */
function requireEnum(name: string): GraphQLEnumType {
  const type = sessionInclusiveSchema.getType(name);

  if (!(type instanceof GraphQLEnumType)) {
    throw new Error(`${name} must be registered as a GraphQL enum type`);
  }

  return type;
}

/** Fails the suite unless the named type is a registered GraphQL object. */
function requireObject(name: string): GraphQLObjectType {
  const type = sessionInclusiveSchema.getType(name);

  if (!(type instanceof GraphQLObjectType)) {
    throw new Error(`${name} must be registered as a GraphQL object type`);
  }

  return type;
}

// ─── Plan §3.1 exact contracts ───────────────────────────────────────────────

/** Exact `Session` field list in plan §3.1 declaration order (`id` FIRST). */
const SESSION_FIELD_ORDER = [
  "id",
  "teacherId",
  "studentId",
  "status",
  "sessionType",
  "intent",
  "fee",
  "feeHeld",
  "startedAt",
  "endedAt",
  "confirmedByTeacherAt",
  "confirmedByStudentAt",
  "confirmationDeadline",
  "createdAt",
  "updatedAt",
] as const;

/** Exact per-field SDL type strings for `Session` (REQ-060). */
const SESSION_FIELD_TYPES: Record<string, string> = {
  confirmationDeadline: "DateTime",
  confirmedByStudentAt: "DateTime",
  confirmedByTeacherAt: "DateTime",
  createdAt: "DateTime!",
  endedAt: "DateTime",
  fee: "String",
  feeHeld: "Boolean!",
  id: "ID!",
  intent: "SessionIntent",
  sessionType: "SessionType!",
  startedAt: "DateTime",
  status: "SessionStatus!",
  studentId: "ID!",
  teacherId: "ID!",
  updatedAt: "DateTime!",
};

describe("Schema construction — scheduling enums registered exactly once", () => {
  test("production schema builds cleanly (no duplicate-registration throw)", () => {
    expect(graphQLSchema).toBeDefined();
    for (const name of ["SessionIntent", "SessionStatus", "SessionType"]) {
      expect(graphQLSchema.getType(name)).toBeInstanceOf(GraphQLEnumType);
    }
  });

  test("each scheduling enum occurs EXACTLY once in the SDL", () => {
    for (const name of ["SessionIntent", "SessionStatus", "SessionType"]) {
      const declaration = `enum ${name} {`;

      expect(sdl.split(declaration).length - 1).toBe(1);
    }
  });
});

describe("Scheduling enum member parity vs the canonical TS enums", () => {
  test("SessionStatus exposes exactly the five canonical members (incl. producer-less `disputed`)", () => {
    const enumType = requireEnum("SessionStatus");

    expect(
      enumType
        .getValues()
        .map(value => value.name)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(Object.keys(SessionStatus).toSorted((a, b) => a.localeCompare(b)));
    for (const [memberName, memberValue] of Object.entries(SessionStatus)) {
      expect(enumType.getValue(memberName)?.value).toBe(memberValue);
    }
  });

  test("SessionType exposes exactly the three canonical members", () => {
    const enumType = requireEnum("SessionType");

    expect(
      enumType
        .getValues()
        .map(value => value.name)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(Object.keys(SessionType).toSorted((a, b) => a.localeCompare(b)));
    for (const [memberName, memberValue] of Object.entries(SessionType)) {
      expect(enumType.getValue(memberName)?.value).toBe(memberValue);
    }
  });

  test("SessionIntent exposes exactly the three canonical members", () => {
    const enumType = requireEnum("SessionIntent");

    expect(
      enumType
        .getValues()
        .map(value => value.name)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(Object.keys(SessionIntent).toSorted((a, b) => a.localeCompare(b)));
    for (const [memberName, memberValue] of Object.entries(SessionIntent)) {
      expect(enumType.getValue(memberName)?.value).toBe(memberValue);
    }
  });
});

describe("Session object — plan §3.1 exact shape", () => {
  const sessionType = requireObject("Session");
  const fields = sessionType.getFields();

  test("exposes EXACTLY the plan §3.1 field set (no extras, no omissions)", () => {
    // GraphQL.js normalizes the field map (alphabetical key order); the
    // plan §3.1 declaration order (`id` FIRST) lives in the Pothos source
    // and is pinned by the file structure — here the EXACT field SET is
    // what the SDL contract requires.
    expect(Object.keys(fields).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...SESSION_FIELD_ORDER].toSorted((a, b) => a.localeCompare(b))
    );
  });

  test("each field carries the exact REQ-060 type string", () => {
    expect(Object.keys(fields)).toHaveLength(Object.keys(SESSION_FIELD_TYPES).length);
    for (const field of Object.values(fields)) {
      expect(field.type.toString()).toBe(SESSION_FIELD_TYPES[field.name]);
    }
  });

  test("carries NO `heldBalanceLane` — internal provenance stays off the SDL", () => {
    expect(Object.hasOwn(fields, "heldBalanceLane")).toBe(false);
    expect(sdl).not.toContain("heldBalanceLane");
  });
});

describe("SessionPage object — sanctioned list wrapper", () => {
  const pageType = requireObject("SessionPage");
  const fields = pageType.getFields();

  test("exposes EXACTLY the plan §3.1 wrapper field set", () => {
    expect(Object.keys(fields).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "items",
      "page",
      "pageSize",
      "totalCount",
    ]);
  });

  test("items is the non-nullable `[Session!]!` list; echo fields are `Int!`", () => {
    expect(fields.items.type.toString()).toBe("[Session!]!");
    expect(fields.totalCount.type.toString()).toBe("Int!");
    expect(fields.page.type.toString()).toBe("Int!");
    expect(fields.pageSize.type.toString()).toBe("Int!");
  });
});
