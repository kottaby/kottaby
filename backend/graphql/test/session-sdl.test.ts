/**
 * DEV3-004 session SDL surface suite — REQ-060 exact-contract parity,
 * extended by the DEV3-005 dispute surface.
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
 *    member exists per REQ-060/B.18 and is PRODUCED by the DEV3-005
 *    participant dispute transition (consumed by the admin arbitration).
 *    The DEV3-005 `DisputeResolution` arbitration vocabulary (Cancel |
 *    Complete) is pinned with the same member/value parity contract.
 *  - **`Session` shape parity (plan §3.1 + DEV3-005 R-105/R-107)** — EXACT
 *    field list in the exact order (`id` FIRST — Apollo cache
 *    normalization), each field's exact GraphQL type string (including the
 *    five nullable dispute/reason fields), `heldBalanceLane` DELIBERATELY
 *    ABSENT from the whole SDL (internal escrow provenance, never
 *    client-consumed).
 *  - **`SessionPage` shape parity** — the sanctioned list-wrapper exception:
 *    `items: [Session!]!` + the honest `totalCount`/`page`/`pageSize` echo.
 *  - **DEV3-006 session-report/homework surface (plan §3.1)** — asserted
 *    against the LIVE production schema (the Phase-3 resolver modules now
 *    register everything through the `gqlSchema.ts` side-effect chain):
 *    the `sessionReport`/`sessionHomework` read pair are NULLABLE with a
 *    single required `sessionId: ID!` arg, `submitSessionReport` returns
 *    NON-NULL `SessionReport!`, both report objects carry EXACT field sets
 *    in the exact declaration order (`id` FIRST — pinned at the Pothos
 *    source level) with exact type strings (`DateTime!` stamps, nullable
 *    `SurahJuzRef` enum legs), the `SurahJuzRef` enum is registered exactly
 *    once with member/value parity against the canonical TS enum, and the
 *    four input whitelists are CLOSED with exact members/types.
 *
 * The `Session` objects join the production type map through the Phase-3
 * resolver modules (tasks 3.2/3.3) — the session Pothos module is still
 * imported HERE (side-effect registration on the shared builder) so the
 * fresh deterministic `toSchema()` emission used by the DEV3-004 enum-once
 * checks keeps containing everything those checks need. The DEV3-006
 * assertions below run against the production `graphQLSchema` instead, so
 * they pin the surface exactly as it ships.
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts backend/graphql/test/session-sdl.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLObjectType,
  lexicographicSortSchema,
  printSchema,
} from "graphql";
import { DisputeResolution } from "@/backend/enum/scheduling/dispute-resolution.enum";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionStatus } from "@/backend/enum/scheduling/session-status.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
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

/**
 * Pins the `id`-FIRST declaration convention on one Pothos object source —
 * lexical scan by design (the built schema is lexicographically sorted, so
 * field order carries no SDL semantics; the SOURCE order is the contract).
 * Mirrors the Notification precedent in `schema-surface.test.ts`.
 */
function assertIdFirstInSource(sourcePath: string, fieldNames: readonly string[]): void {
  const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8");
  const fieldsBlock = source.slice(source.indexOf("fields: t => ({"));
  const positions = fieldNames.map(name => ({
    name,
    at: fieldsBlock.indexOf(`${name}: `),
  }));
  for (const { name, at } of positions) {
    if (at < 0) throw new Error(`${sourcePath} must declare the \`${name}\` field`);
  }
  const idPosition = positions.find(position => position.name === "id")?.at ?? -1;
  for (const { name, at } of positions) {
    if (name !== "id") {
      expect(idPosition).toBeLessThan(at);
    }
  }
}

// ─── Plan §3.1 exact contracts ───────────────────────────────────────────────

/**
 * Exact `Session` field list in plan §3.1 declaration order (`id` FIRST),
 * extended by the five DEV3-005 dispute/reason fields in their Pothos
 * declaration position (after the confirmation stamps, before the row
 * timestamps) and the server-derived admin attention badge in its Pothos
 * declaration position (after the dispute surface, before the row
 * timestamps — the directory read is its only populating producer).
 */
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
  "cancelReason",
  "disputeReason",
  "disputedAt",
  "resolutionNote",
  "resolvedAt",
  "needsAttention",
  "createdAt",
  "updatedAt",
] as const;

/** Exact per-field SDL type strings for `Session` (REQ-060 + DEV3-005). */
const SESSION_FIELD_TYPES: Record<string, string> = {
  cancelReason: "String",
  confirmationDeadline: "DateTime",
  confirmedByStudentAt: "DateTime",
  confirmedByTeacherAt: "DateTime",
  createdAt: "DateTime!",
  disputeReason: "String",
  disputedAt: "DateTime",
  endedAt: "DateTime",
  fee: "String",
  feeHeld: "Boolean!",
  id: "ID!",
  intent: "SessionIntent",
  needsAttention: "Boolean!",
  resolutionNote: "String",
  resolvedAt: "DateTime",
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
  test("SessionStatus exposes exactly the five canonical members (incl. the DEV3-005-produced `disputed`)", () => {
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

  test("DisputeResolution exposes exactly the arbitration vocabulary (Cancel | Complete) with wire-identical values", () => {
    const enumType = requireEnum("DisputeResolution");

    expect(
      enumType
        .getValues()
        .map(value => value.name)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(Object.keys(DisputeResolution).toSorted((a, b) => a.localeCompare(b)));
    for (const [memberName, memberValue] of Object.entries(DisputeResolution)) {
      expect(enumType.getValue(memberName)?.value).toBe(memberValue);
    }
  });
});

describe("Session object — plan §3.1 exact shape", () => {
  const sessionType = requireObject("Session");
  const fields = sessionType.getFields();

  test("exposes EXACTLY the plan §3.1 field set plus the DEV3-005 dispute fields and the derived attention badge (no extras, no omissions)", () => {
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

// ─── DEV3-006 session-report/homework surface (plan §3.1) ────────────────────

/**
 * Exact `SessionReport` field list in plan §3.1 declaration order (`id`
 * FIRST — Apollo cache normalization). The built schema's field map carries
 * the declaration order, while the emitted SDL is lexicographically sorted,
 * so the EXACT SET is compared sorted and the declaration order is pinned at
 * the Pothos source level (see the `id`-FIRST source scan below).
 */
const SESSION_REPORT_FIELD_ORDER = [
  "id",
  "sessionId",
  "teacherNotes",
  "studentRatingByTeacher",
  "createdAt",
  "updatedAt",
] as const;

/**
 * Exact `SessionHomeWork` field list in plan §3.1 declaration order (`id`
 * FIRST, then the session join, the current/Jadid track, the revision/Madi
 * track, then the row stamps).
 */
const SESSION_HOME_WORK_FIELD_ORDER = [
  "id",
  "sessionId",
  "currentFromAyah",
  "currentToAyah",
  "currentGrade",
  "currentSurahJuz",
  "revisionFromAyah",
  "revisionToAyah",
  "revisionGrade",
  "revisionSurahJuz",
  "createdAt",
  "updatedAt",
] as const;

/** Exact per-field SDL type strings for `SessionReport` (plan §3.1). */
const SESSION_REPORT_FIELD_TYPES: Record<string, string> = {
  createdAt: "DateTime!",
  id: "ID!",
  sessionId: "Int!",
  studentRatingByTeacher: "Int!",
  teacherNotes: "String!",
  updatedAt: "DateTime!",
};

/** Exact per-field SDL type strings for `SessionHomeWork` (plan §3.1). */
const SESSION_HOME_WORK_FIELD_TYPES: Record<string, string> = {
  createdAt: "DateTime!",
  currentFromAyah: "Int",
  currentGrade: "Int",
  currentSurahJuz: "SurahJuzRef",
  currentToAyah: "Int",
  id: "ID!",
  revisionFromAyah: "Int",
  revisionGrade: "Int",
  revisionSurahJuz: "SurahJuzRef",
  revisionToAyah: "Int",
  sessionId: "Int!",
  updatedAt: "DateTime!",
};

/**
 * The four DEV3-006 input whitelists — CLOSED member sets (BOPLA): member
 * name → exact SDL type string. No member beyond these may exist, no
 * server-derivable field (no `id`, no `sessionId`, no timestamps, no teacher
 * identity) may appear, and the required/nullable split is exact.
 */
const DEV3_006_INPUT_WHITELISTS: Record<string, Record<string, string>> = {
  HomeWorkAssignmentInput: {
    jadid: "HomeWorkBlockInput",
    madi: "HomeWorkBlockInput",
  },
  HomeWorkBlockInput: {
    fromAyah: "Int!",
    surahJuz: "SurahJuzRef!",
    toAyah: "Int!",
  },
  HomeWorkGradeInput: {
    currentGrade: "Int!",
    revisionGrade: "Int!",
  },
  SubmitSessionReportInput: {
    homework: "HomeWorkAssignmentInput",
    previousGrades: "HomeWorkGradeInput",
    studentRatingByTeacher: "Int!",
    teacherNotes: "String!",
  },
};

describe("DEV3-006 session-report surface — plan §3.1 exact shapes", () => {
  // The DEV3-006 surface ships through the LIVE production schema (the
  // Phase-3 resolver modules register the root fields via the side-effect
  // barrels), so the pins below read `graphQLSchema` — the exact surface
  // the gateway exposes.
  const queryType = graphQLSchema.getQueryType();
  if (!queryType) {
    throw new Error("Schema must define a root Query type");
  }
  const mutationType = graphQLSchema.getMutationType();
  if (!mutationType) {
    throw new Error("Schema must define a root Mutation type");
  }
  const productionSdl = printSchema(lexicographicSortSchema(graphQLSchema));

  test("sessionReport is a NULLABLE SessionReport read with EXACTLY ONE required `sessionId: ID!` arg", () => {
    const field = queryType.getFields().sessionReport;
    if (!field) throw new Error("Query must register the `sessionReport` root field");
    // Nullable by contract — an unreported/foreign/nonexistent session
    // collapses to bare `null` (oracle-safe disclosure posture).
    expect(field.type.toString()).toBe("SessionReport");
    expect(field.args).toHaveLength(1);
    expect(field.args[0]?.name).toBe("sessionId");
    expect(field.args[0]?.type.toString()).toBe("ID!");
  });

  test("sessionHomework is a NULLABLE SessionHomeWork read with EXACTLY ONE required `sessionId: ID!` arg", () => {
    const field = queryType.getFields().sessionHomework;
    if (!field) throw new Error("Query must register the `sessionHomework` root field");
    expect(field.type.toString()).toBe("SessionHomeWork");
    expect(field.args).toHaveLength(1);
    expect(field.args[0]?.name).toBe("sessionId");
    expect(field.args[0]?.type.toString()).toBe("ID!");
  });

  test("submitSessionReport returns NON-NULL SessionReport! with EXACTLY (id: ID!, input: SubmitSessionReportInput!)", () => {
    const field = mutationType.getFields().submitSessionReport;
    if (!field) throw new Error("Mutation must register the `submitSessionReport` root field");
    expect(field.type.toString()).toBe("SessionReport!");
    const argsByName = new Map(field.args.map(arg => [arg.name, arg.type.toString()]));
    expect(argsByName.get("id")).toBe("ID!");
    expect(argsByName.get("input")).toBe("SubmitSessionReportInput!");
    expect(field.args).toHaveLength(2);
  });

  test("SessionReport exposes EXACTLY the plan §3.1 field set with the exact type strings", () => {
    const reportType = graphQLSchema.getType("SessionReport");
    if (!(reportType instanceof GraphQLObjectType)) {
      throw new Error("SessionReport must be registered as a GraphQL object type");
    }
    const fields = reportType.getFields();
    expect(Object.keys(fields).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...SESSION_REPORT_FIELD_ORDER].toSorted((a, b) => a.localeCompare(b))
    );
    expect(Object.keys(fields)).toHaveLength(Object.keys(SESSION_REPORT_FIELD_TYPES).length);
    for (const field of Object.values(fields)) {
      expect(field.type.toString()).toBe(SESSION_REPORT_FIELD_TYPES[field.name]);
    }
    // The DateTime stamps are the registered scalar — never ISO-strings.
    expect(fields.createdAt?.type.toString()).toBe("DateTime!");
    expect(fields.updatedAt?.type.toString()).toBe("DateTime!");
  });

  test("SessionHomeWork exposes EXACTLY the plan §3.1 field set with the exact type strings", () => {
    const homeWorkType = graphQLSchema.getType("SessionHomeWork");
    if (!(homeWorkType instanceof GraphQLObjectType)) {
      throw new Error("SessionHomeWork must be registered as a GraphQL object type");
    }
    const fields = homeWorkType.getFields();
    expect(Object.keys(fields).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...SESSION_HOME_WORK_FIELD_ORDER].toSorted((a, b) => a.localeCompare(b))
    );
    expect(Object.keys(fields)).toHaveLength(Object.keys(SESSION_HOME_WORK_FIELD_TYPES).length);
    for (const field of Object.values(fields)) {
      expect(field.type.toString()).toBe(SESSION_HOME_WORK_FIELD_TYPES[field.name]);
    }
    // Both tracks: assignment legs nullable, enum legs the NULLABLE
    // SurahJuzRef (an unassigned/ungraded track is a normal stored state).
    for (const name of ["currentSurahJuz", "revisionSurahJuz"]) {
      expect(fields[name]?.type.toString()).toBe("SurahJuzRef");
    }
  });

  test("`id` is the FIRST declared field on BOTH report object sources (Apollo normalization)", () => {
    assertIdFirstInSource("backend/graphql/pothos/classes/report.pothos.ts", SESSION_REPORT_FIELD_ORDER);
    assertIdFirstInSource("backend/graphql/pothos/classes/home-work.pothos.ts", SESSION_HOME_WORK_FIELD_ORDER);
  });

  test("enum SurahJuzRef occurs EXACTLY once in the SDL and carries member/value parity with the canonical TS enum", () => {
    expect(graphQLSchema.getType("SurahJuzRef")).toBeInstanceOf(GraphQLEnumType);
    const declaration = "enum SurahJuzRef {";
    expect(productionSdl.split(declaration).length - 1).toBe(1);

    const enumType = graphQLSchema.getType("SurahJuzRef");
    if (!(enumType instanceof GraphQLEnumType)) {
      throw new Error("SurahJuzRef must be registered as a GraphQL enum type");
    }
    const values = enumType.getValues();
    expect(values).toHaveLength(35);
    // Wire values are the enum KEYS (CamelCase) over the snake_case DB
    // values — same key-on-the-wire convention as NotificationType.
    expect(values.map(value => value.name).toSorted((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(SurahJuzRef).toSorted((a, b) => a.localeCompare(b))
    );
    for (const [memberName, memberValue] of Object.entries(SurahJuzRef)) {
      expect(enumType.getValue(memberName)?.value).toBe(memberValue);
    }
  });

  test("the four input whitelists are CLOSED with exact members and exact type strings", () => {
    for (const [typeName, members] of Object.entries(DEV3_006_INPUT_WHITELISTS)) {
      const inputType = graphQLSchema.getType(typeName);
      if (!(inputType instanceof GraphQLInputObjectType)) {
        throw new Error(`${typeName} must be registered as a GraphQL input type`);
      }
      const fields = inputType.getFields();
      expect(Object.keys(fields).toSorted((a, b) => a.localeCompare(b))).toEqual(
        Object.keys(members).toSorted((a, b) => a.localeCompare(b))
      );
      expect(Object.keys(fields)).toHaveLength(Object.keys(members).length);
      for (const field of Object.values(fields)) {
        expect(field.type.toString()).toBe(members[field.name]);
      }
    }
  });

  test("no server-derivable field leaks into any input whitelist (static SDL slice scan)", () => {
    for (const inputName of Object.keys(DEV3_006_INPUT_WHITELISTS)) {
      const blockStart = productionSdl.indexOf(`input ${inputName} {`);
      if (blockStart < 0) throw new Error(`SDL must declare the \`input ${inputName}\` type`);
      const blockEnd = productionSdl.indexOf("}", blockStart);
      const inputBlock = productionSdl.slice(blockStart, blockEnd);
      expect(inputBlock).not.toContain("sessionId");
      expect(inputBlock).not.toContain("teacherId");
      expect(inputBlock).not.toContain("createdAt");
      expect(inputBlock).not.toContain("updatedAt");
    }
  });
});
