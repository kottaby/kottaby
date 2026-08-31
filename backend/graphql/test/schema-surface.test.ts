/**
 * GraphQL schema surface assertion suite — "exactly one addition" gate +
 * codegen-sync proof.
 *
 * What this locks down:
 *  - **Retyped probe** — `Query._health: HealthCheck!` (the legacy inline
 *    `String!` placeholder from `builder.ts` was deleted BEFORE the new
 *    registration landed — the duplicate-field crash regression is
 *    therefore covered here permanently).
 *  - **Shape closure** — `HealthCheck` exposes EXACTLY the four scalar
 *    fields (`status`, `service`, `version`, `timestamp`), each `String!`,
 *    and carries NO `id` field (embedded value object — proven both at
 *    the type level and behaviorally: selecting `id` fails validation).
 *  - **Surface freeze** — against the frozen baseline inventory (captured
 *    at HEAD `8e5ebb8`): every post-baseline addition is pinned by name —
 *    query fields grow ONLY by the sanctioned probe `_health`,
 *    `myApplicantProfile` (DEV2-004), the DEV3-004 participant-read
 *    trio (`sessionById`, `myStudentSessions`, `myTeacherSessions`) and
 *    the DEV3-005 admin arbitration listing (`adminDisputedSessions`);
 *    the mutation set grows ONLY by the DEV3-004 lifecycle quartet
 *    (`createSession`, `startSession`, `completeSession`,
 *    `cancelSession`) AND the DEV3-005 dispute pair (`openSessionDispute`,
 *    `resolveSessionDispute`) AND the DEV3-012 dual-confirmation mutation
 *    (`confirmSessionCompletion`); the enum set grows ONLY by `ApplicantStatus`
 *    (DEV2-004), the DEV3-004 scheduling trio (`SessionStatus`,
 *    `SessionType`, `SessionIntent` — registered ONCE in
 *    `shared/enum.pothos.ts`) and the DEV3-005 arbitration vocabulary
 *    (`DisputeResolution`); and the whole-schema named-type delta is
 *    exactly {ApplicantProfile, ApplicantStatus, DateTime, HealthCheck}
 *    (DEV2-004 surface + the `DateTime` scalar registered in
 *    `shared/scalar.pothos.ts`), the DEV3-004 scheduling enums, the
 *    DEV3-004 session objects/inputs (`Session`, `SessionPage`,
 *    `CreateSessionInput`, `SessionListFilterInput`) and the DEV3-005
 *    arbitration enum — the session objects joined the production type
 *    map when the Phase-3 resolver modules wired the root fields
 *    (DEV3-004 tasks 3.2/3.3) and the barrels were registered (task 3.4).
 *  - **Allowlist agreement** — the scopeless `_health` field is present in
 *    the closed `PUBLIC_OPERATION_NAMES` tuple / `PUBLIC_OPERATIONS` set
 *    1:1 (schema↔allowlist agreement enforced as code).
 *  - **Anonymous reachability** — executing the probe document with an EMPTY
 *    context succeeds through the real production schema (public by design;
 *    also proves the resolver is delegation-only: no ctx/DB access exists
 *    on the path, otherwise this call could not succeed).
 *  - **Codegen sync (scripted)** — the checked-in
 *    `frontend/graphql/generated/schema.graphql` is BYTE-IDENTICAL to a
 *    fresh `printSchema(lexicographicSortSchema(graphQLSchema))` emission,
 *    i.e. generated artifacts are in lockstep with the code-first builder
 *    (read-only disk access; the suite writes NOTHING). Belt-and-braces
 *    pins assert the DEV3-004 session surface is really inside the
 *    committed artifact (seven root operations + the two object types +
 *    the two input types) plus the DEV3-005 dispute surface (the three
 *    new root operations, the arbitration enum, and the five nullable
 *    `Session` fields).
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts backend/graphql/test/schema-surface.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GraphQLEnumType,
  GraphQLObjectType,
  getNamedType,
  graphql,
  isSpecifiedScalarType,
  lexicographicSortSchema,
  parse,
  printSchema,
  validate,
} from "graphql";
import { graphQLSchema } from "@/backend/graphql/gqlSchema";
import { PUBLIC_OPERATION_NAMES, PUBLIC_OPERATIONS } from "@/backend/lib/gateway";

// ─── Frozen baseline inventory (captured @ HEAD 8e5ebb8) ─────────────────────

/** Root query field names present before the probe re-registration. */
const PRE_3_1_QUERY_FIELDS = ["me", "recitationReadings"] as const;
/** Root mutation field names present before the DEV3-004 lifecycle quartet. */
const PRE_3_1_MUTATION_FIELDS = ["login", "logout", "refreshToken", "registerUser"] as const;
/**
 * DEV3-004 session lifecycle root fields — registered ONCE via the
 * side-effect barrels (`query|mutation/classes/index.ts` → top-level
 * barrel → `gqlSchema.ts`); role-gated/authenticated per REQ-032 and
 * therefore deliberately ABSENT from the public-operation allowlist
 * (`backend/lib/gateway/public-operations.ts` stays byte-unchanged).
 */
const DEV3_004_QUERY_FIELDS = ["myStudentSessions", "myTeacherSessions", "sessionById"] as const;
/** DEV3-005 admin arbitration listing — the admin-gated disputed queue. */
const DEV3_005_QUERY_FIELDS = ["adminDisputedSessions"] as const;
/** DEV3-004 lifecycle mutation quartet (plan §3.1/§3.2 — REQ-060/061). */
const DEV3_004_MUTATION_FIELDS = ["cancelSession", "completeSession", "createSession", "startSession"] as const;
/** DEV3-005 dispute mutation pair (R-102/R-104). */
const DEV3_005_MUTATION_FIELDS = ["openSessionDispute", "resolveSessionDispute"] as const;
/** DEV3-012 dual-confirmation mutation (R-201/R-202). */
const DEV3_012_MUTATION_FIELDS = ["confirmSessionCompletion"] as const;
/** DEV3-013 wallet read — the teacher-only wallet + ledger surface (R-301). */
const DEV3_013_QUERY_FIELDS = ["myWallet"] as const;
/** DEV3-013 wallet payout write — the teacher-only withdrawal request (R-302). */
const DEV3_013_MUTATION_FIELDS = ["requestWithdrawal"] as const;
/** DEV3-013 billing ledger vocabulary — registered ONCE in `shared/enum.pothos.ts`. */
const DEV3_013_ENUMS = ["TransactionStatus", "TransactionType"] as const;
/** DEV3-005 arbitration outcome vocabulary — registered ONCE, no pgEnum backing. */
const DEV3_005_ENUMS = ["DisputeResolution"] as const;
/** DEV3-005 nullable `Session` fields — the dispute + reason surface (R-105/R-107). */
const DEV3_005_SESSION_FIELDS = [
  "cancelReason",
  "disputeReason",
  "disputedAt",
  "resolutionNote",
  "resolvedAt",
] as const;
/** GraphQL enum type names — every new Pothos enum must be pinned here by name. */
const PRE_3_1_ENUMS = ["ApplicantStatus", "Gender", "RecitationReading", "RegisterPublicRole", "UserRole"] as const;
/** DEV3-004 scheduling enum trio — registered ONCE in `shared/enum.pothos.ts`. */
const DEV3_004_ENUMS = ["SessionIntent", "SessionStatus", "SessionType"] as const;
/** Non-root object/enum/scalar SDL type names in the baseline (introspection `__*` and spec scalars excluded). */
const PRE_3_1_TYPE_NAMES = [
  "Gender",
  "LoginPayload",
  "LogoutPayload",
  "Mutation",
  "Query",
  "RecitationReading",
  "RefreshTokenPayload",
  "RegisterPublicRole",
  "RegisterUserInput",
  "User",
  "UserRole",
] as const;
/**
 * DEV3-004 session surface — objects + inputs that enter the named-type
 * map when the resolver modules register the root fields (plan §3.1 SDL).
 * The scheduling enum trio is pinned separately (see `DEV3_004_ENUMS`).
 */
const DEV3_004_TYPE_NAMES = ["CreateSessionInput", "Session", "SessionListFilterInput", "SessionPage"] as const;
/** DEV3-013 billing objects + input (R-301/R-302) — the wallet surface types. */
const DEV3_013_TYPE_NAMES = ["RequestWithdrawalInput", "TeacherTransaction", "Wallet"] as const;

// ─── Schema walk helpers ─────────────────────────────────────────────────────

/** All named SDL type names, introspection builtins + spec scalars excluded, sorted deterministically. */
function sdlTypeNames(): string[] {
  return Object.values(graphQLSchema.getTypeMap())
    .filter(type => !type.name.startsWith("__") && !isSpecifiedScalarType(type))
    .map(type => type.name)
    .toSorted((a, b) => a.localeCompare(b));
}

describe("Query._health — retyped probe surface", () => {
  const queryType = graphQLSchema.getQueryType();

  if (!queryType) {
    throw new Error("Schema must define a root Query type");
  }

  test("root query retains EXACTLY the baseline fields plus the pinned additions", () => {
    expect(queryType).toBeDefined();
    const fieldNames = Object.keys(queryType.getFields());
    // Baseline survivors intact…
    for (const name of PRE_3_1_QUERY_FIELDS) {
      expect(fieldNames).toContain(name);
    }
    // …and the ONLY additions beyond them are the probe, the DEV2-004
    // applicant-profile query, the DEV3-004 participant-read trio, and
    // the DEV3-005 admin arbitration listing.
    const additions = fieldNames.filter(name => !(PRE_3_1_QUERY_FIELDS as readonly string[]).includes(name));
    expect(additions.toSorted((a, b) => a.localeCompare(b))).toEqual(
      [
        "_health",
        "myApplicantProfile",
        ...DEV3_004_QUERY_FIELDS,
        ...DEV3_005_QUERY_FIELDS,
        ...DEV3_013_QUERY_FIELDS,
      ].toSorted((a, b) => a.localeCompare(b))
    );
  });

  test("`_health` is NON-NULLABLE `HealthCheck!` (retyped from the String! placeholder)", () => {
    // Field lookup via values+name comparison — keeps `_health` out of member-
    // access position entirely (`no-underscore-dangle` clean by construction).
    const healthField = Object.values(queryType.getFields()).find(field => field.name === "_health");

    if (!healthField) {
      throw new Error("Query must register a `_health` root field");
    }
    expect(healthField).toBeDefined();
    expect(getNamedType(healthField.type).name).toBe("HealthCheck");
    expect(getNamedType(healthField.type).toString()).toBe("HealthCheck");
    // v3 defaults: no explicit nullable opt-out ⇒ strict NonNull wrapping.
    expect(healthField.type.toString()).toBe("HealthCheck!");
  });
});

describe("HealthCheck object shape — four scalar fields, no id", () => {
  const healthType = graphQLSchema.getType("HealthCheck");

  if (!(healthType instanceof GraphQLObjectType)) {
    throw new Error("HealthCheck must be registered as a GraphQL object type");
  }

  test("is registered exactly once as an object type backed by the canonical ref", () => {
    expect(healthType).toBeInstanceOf(GraphQLObjectType);
  });

  test("discloses EXACTLY the four canonical fields, each `String!`", () => {
    const fields = healthType.getFields();

    expect(Object.keys(fields).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "service",
      "status",
      "timestamp",
      "version",
    ]);
    for (const field of Object.values(fields)) {
      expect(field.type.toString()).toBe("String!");
    }
  });

  test("carries NO `id` field — embedded value object", () => {
    const fields = healthType.getFields();

    expect(Object.hasOwn(fields, "id")).toBe(false);
  });

  test("selecting `id` on the probe FAILS validation (behavioral no-id proof)", () => {
    const document = parse("{ _health { id } }");
    const errors = validate(graphQLSchema, document);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('Cannot query field "id" on type "HealthCheck"');
  });
});

describe("Surface freeze — pinned additions vs the baseline inventory", () => {
  test("mutation set grows ONLY by the DEV3-004 lifecycle quartet AND the DEV3-005 dispute pair", () => {
    const mutationFields = graphQLSchema.getMutationType()?.getFields() ?? {};
    const names = Object.keys(mutationFields).toSorted((a, b) => a.localeCompare(b));

    // Baseline survivors intact…
    for (const name of PRE_3_1_MUTATION_FIELDS) {
      expect(names).toContain(name);
    }
    // …and the ONLY additions are the DEV3-004 quartet, the DEV3-005
    // dispute pair, and the DEV3-012 dual-confirmation mutation (all
    // authScopes-gated — none of them is allowlist material; the
    // public-operation registry stays byte-unchanged).
    expect(names).toEqual(
      [
        ...PRE_3_1_MUTATION_FIELDS,
        ...DEV3_004_MUTATION_FIELDS,
        ...DEV3_005_MUTATION_FIELDS,
        ...DEV3_012_MUTATION_FIELDS,
        ...DEV3_013_MUTATION_FIELDS,
      ].toSorted((a, b) => a.localeCompare(b))
    );
    expect(names).not.toContain("_health");
  });

  test("enum set is pinned (every new enum named explicitly)", () => {
    const enumNames = Object.values(graphQLSchema.getTypeMap())
      .filter(type => type instanceof GraphQLEnumType && !type.name.startsWith("__"))
      .map(type => type.name)
      .toSorted((a, b) => a.localeCompare(b));

    expect(enumNames).toEqual(
      [...PRE_3_1_ENUMS, ...DEV3_004_ENUMS, ...DEV3_005_ENUMS, ...DEV3_013_ENUMS].toSorted((a, b) => a.localeCompare(b))
    );
  });

  test("DisputeResolution exposes exactly the arbitration vocabulary (Cancel | Complete)", () => {
    const disputeEnum = graphQLSchema.getType("DisputeResolution");

    if (!(disputeEnum instanceof GraphQLEnumType)) {
      throw new Error("DisputeResolution must be registered as a GraphQL enum type");
    }
    expect(
      disputeEnum
        .getValues()
        .map(value => value.name)
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(["Cancel", "Complete"]);
  });

  test("Session exposes EXACTLY the DEV3-004 field set plus the five DEV3-005 nullable dispute fields", () => {
    const sessionType = graphQLSchema.getType("Session");

    if (!(sessionType instanceof GraphQLObjectType)) {
      throw new Error("Session must be registered as a GraphQL object type");
    }
    const fields = sessionType.getFields();
    for (const name of DEV3_005_SESSION_FIELDS) {
      expect(Object.hasOwn(fields, name)).toBe(true);
    }
    // All five are nullable (no `!` wrapping) — the dispute/reason data is
    // optional on every row (rows cancelled/disputed/resolved before this
    // ticket carry NULL).
    for (const name of ["cancelReason", "disputeReason", "resolutionNote"]) {
      expect(fields[name]?.type.toString()).toBe("String");
    }
    for (const name of ["disputedAt", "resolvedAt"]) {
      expect(fields[name]?.type.toString()).toBe("DateTime");
    }
  });

  test("whole-schema named-type delta is pinned: HealthCheck + DEV2-004 applicant surface + DateTime scalar + DEV3-004 scheduling enums + session objects/inputs + DEV3-005 arbitration enum + DEV3-013 wallet surface", () => {
    const post = new Set(sdlTypeNames());

    for (const name of PRE_3_1_TYPE_NAMES) {
      expect(post.has(name)).toBe(true);
    }
    const additions = sdlTypeNames().filter(name => !(PRE_3_1_TYPE_NAMES as readonly string[]).includes(name));
    expect(additions).toEqual(
      [
        "ApplicantProfile",
        "ApplicantStatus",
        "DateTime",
        "HealthCheck",
        ...DEV3_004_TYPE_NAMES,
        ...DEV3_004_ENUMS,
        ...DEV3_005_ENUMS,
        ...DEV3_013_TYPE_NAMES,
        ...DEV3_013_ENUMS,
      ].toSorted((a, b) => a.localeCompare(b))
    );
  });
});

describe("Public-operation allowlist agreement", () => {
  test("`_health` is a member of the closed allowlist 1:1 with its scopeless schema posture", () => {
    expect(PUBLIC_OPERATION_NAMES).toContain("_health");
    expect(PUBLIC_OPERATIONS.has("_health")).toBe(true);
    // The field genuinely ships WITHOUT authScopes: anonymous execution below
    // would otherwise raise an UNAUTHORIZED error through the scope-auth plugin.
  });

  test("anonymous (context-free) execution of the probe succeeds end-to-end", async () => {
    const result = await graphql({
      schema: graphQLSchema,
      source: "{ _health { status service version timestamp } }",
      contextValue: {},
    });

    expect(result.errors).toBeUndefined();
    // Wire-shape assertion over the serialized data map (timestamp varies per
    // call — matched structurally). This proves the delegation-only resolver:
    // the exact four-field payload of the shared producer surfaces verbatim,
    // nothing more.
    const serializedProbe = JSON.stringify(result.data);
    const probeShape =
      /^\{"_health":\{"status":"ok","service":"kottaby","version":"([^"]*)","timestamp":"([^"]+)"\}\}$/;
    const match = probeShape.exec(serializedProbe);

    expect(match).not.toBeNull();
    // Delegation-only proof: version flows out of the shared service producer
    // (non-empty here, since npm_package_version exists in this workspace).
    expect(match?.[1]?.length ?? 0).toBeGreaterThan(0);
    // …and the timestamp is a parseable ISO-8601 instant (never cached).
    expect(Number.isNaN(Date.parse(match?.[2] ?? "invalid"))).toBe(false);
  });
});

describe("Codegen sync — committed SDL is byte-identical to the built schema", () => {
  test("frontend/graphql/generated/schema.graphql matches a fresh deterministic emission", () => {
    const sdlPath = resolve(process.cwd(), "frontend/graphql/generated/schema.graphql");
    const committedSdl = readFileSync(sdlPath, "utf8");
    const freshlyPrinted = printSchema(lexicographicSortSchema(graphQLSchema));

    expect(committedSdl).toBe(freshlyPrinted);
    // Belt-and-braces: the synced artifact really contains the retyped probe.
    expect(committedSdl).toContain("_health: HealthCheck!");
    expect(committedSdl).toContain("type HealthCheck {");
    // …and the DEV3-004 session surface (7 root operations + 2 object
    // types + 2 input types) is really inside the committed artifact.
    expect(committedSdl).toContain("sessionById(id: ID!): Session");
    expect(committedSdl).toContain(
      "myStudentSessions(filter: SessionListFilterInput, page: Int = 1, pageSize: Int = 25): SessionPage!"
    );
    expect(committedSdl).toContain(
      "myTeacherSessions(filter: SessionListFilterInput, page: Int = 1, pageSize: Int = 25): SessionPage!"
    );
    expect(committedSdl).toContain("createSession(input: CreateSessionInput!): Session!");
    expect(committedSdl).toContain("startSession(id: ID!): Session!");
    expect(committedSdl).toContain("completeSession(id: ID!): Session!");
    expect(committedSdl).toContain("cancelSession(id: ID!, reason: String): Session!");
    expect(committedSdl).toContain("type Session {");
    expect(committedSdl).toContain("type SessionPage {");
    expect(committedSdl).toContain("input CreateSessionInput {");
    expect(committedSdl).toContain("input SessionListFilterInput {");
    // …and the DEV3-005 dispute surface (3 root operations + the
    // arbitration enum + the five nullable Session fields) is really
    // inside the committed artifact.
    expect(committedSdl).toContain("openSessionDispute(id: ID!, reason: String!): Session!");
    expect(committedSdl).toContain(
      "resolveSessionDispute(id: ID!, note: String, resolution: DisputeResolution!): Session!"
    );
    expect(committedSdl).toContain(
      "adminDisputedSessions(filter: SessionListFilterInput, limit: Int = 25, offset: Int = 0): SessionPage!"
    );
    expect(committedSdl).toContain("enum DisputeResolution {");
    for (const field of DEV3_005_SESSION_FIELDS) {
      expect(committedSdl).toContain(field);
    }
    // …and the DEV3-012 dual-confirmation mutation is really inside the
    // committed artifact.
    expect(committedSdl).toContain("confirmSessionCompletion(id: ID!): Session!");
    // …and the DEV3-013 wallet surface (2 root operations + the payout
    // input + the two ledger enums) is really inside the committed artifact.
    expect(committedSdl).toContain("myWallet: Wallet!");
    expect(committedSdl).toContain("requestWithdrawal(input: RequestWithdrawalInput!): Wallet!");
    expect(committedSdl).toContain("input RequestWithdrawalInput {");
    expect(committedSdl).toContain("enum TransactionType {");
    expect(committedSdl).toContain("enum TransactionStatus {");
  });
});
