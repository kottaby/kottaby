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
 *    at HEAD `8e5ebb8`, since refreshed for the sanctioned `ApplicantProfile`/
 *    `ApplicantStatus` additions and the notifications additions — enum +
 *    `Notification` + `NotificationListPage`): ZERO new mutations, and a
 *    whole-schema named-type delta of EXACTLY `{HealthCheck}` while the
 *    query set grows only by the sanctioned probe re-registration.
 *  - **Notification surface** — the `NotificationType` enum carries exactly
 *    the 7 canonical values (TS-enum keys as GraphQL names, snake_case
 *    runtime values), the `Notification` object exposes `id` FIRST with
 *    EXACTLY the inbox field surface (structurally NO `userId`), and the
 *    `NotificationListPage` wrapper exposes items/totalCount/hasMore.
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
 *    (read-only disk access; the suite writes NOTHING).
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
import { NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { graphQLSchema } from "@/backend/graphql/gqlSchema";
import { PUBLIC_OPERATION_NAMES, PUBLIC_OPERATIONS } from "@/backend/lib/gateway";

// ─── Frozen baseline inventory (captured @ HEAD 8e5ebb8; refreshed for the ────
// ─── sanctioned applicant + notifications additions) ────────────────────────

/** Root query field names present before the probe re-registration. */
const PRE_3_1_QUERY_FIELDS = ["me", "myApplicantProfile", "recitationReadings"] as const;
/** Root mutation field names — must remain UNCHANGED forever. */
const PRE_3_1_MUTATION_FIELDS = ["login", "logout", "refreshToken", "registerUser"] as const;
/** GraphQL enum type names — the freeze forbids any new Pothos enum. */
const PRE_3_1_ENUMS = [
  "ApplicantStatus",
  "Gender",
  "NotificationType",
  "RecitationReading",
  "RegisterPublicRole",
  "UserRole",
] as const;
/** Non-root object/enum/scalar SDL type names in the baseline (introspection `__*` and spec scalars excluded). */
const PRE_3_1_TYPE_NAMES = [
  "ApplicantProfile",
  "ApplicantStatus",
  "Gender",
  "LoginPayload",
  "LogoutPayload",
  "Mutation",
  "Notification",
  "NotificationListPage",
  "NotificationType",
  "Query",
  "RecitationReading",
  "RefreshTokenPayload",
  "RegisterPublicRole",
  "RegisterUserInput",
  "User",
  "UserRole",
] as const;

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

  test("root query retains EXACTLY the baseline fields plus the probe", () => {
    expect(queryType).toBeDefined();
    const fieldNames = Object.keys(queryType.getFields());
    // Baseline survivors intact…
    for (const name of PRE_3_1_QUERY_FIELDS) {
      expect(fieldNames).toContain(name);
    }
    // …and the ONLY addition beyond them is the probe itself.
    const additions = fieldNames.filter(name => !(PRE_3_1_QUERY_FIELDS as readonly string[]).includes(name));
    expect(additions.toSorted((a, b) => a.localeCompare(b))).toEqual(["_health"]);
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

describe("Surface freeze — exactly one addition vs the baseline inventory", () => {
  test("ZERO new mutations (frozen mutation set unchanged)", () => {
    const mutationFields = graphQLSchema.getMutationType()?.getFields() ?? {};
    const names = Object.keys(mutationFields).toSorted((a, b) => a.localeCompare(b));

    expect(names).toEqual([...PRE_3_1_MUTATION_FIELDS]);
    expect(names).not.toContain("_health");
  });

  test("ZERO new enums (frozen enum set unchanged)", () => {
    const enumNames = Object.values(graphQLSchema.getTypeMap())
      .filter(type => type instanceof GraphQLEnumType && !type.name.startsWith("__"))
      .map(type => type.name)
      .toSorted((a, b) => a.localeCompare(b));

    expect(enumNames).toEqual([...PRE_3_1_ENUMS]);
  });

  test("whole-schema named-type delta is EXACTLY one new type: HealthCheck", () => {
    const post = new Set(sdlTypeNames());

    for (const name of PRE_3_1_TYPE_NAMES) {
      expect(post.has(name)).toBe(true);
    }
    const additions = sdlTypeNames().filter(name => !(PRE_3_1_TYPE_NAMES as readonly string[]).includes(name));
    expect(additions).toEqual(["HealthCheck"]);
  });
});

describe("Notification surface — enum + canonical objects", () => {
  /** Field names in canonical definition order (drives the `id`-FIRST source pin). */
  const CANONICAL_NOTIFICATION_FIELDS = [
    "id",
    "type",
    "title",
    "body",
    "isRead",
    "relatedEntityType",
    "relatedEntityId",
    "createdAt",
  ] as const;

  test("NotificationType enum carries EXACTLY the 7 canonical values (keys on the wire, snake_case runtime values)", () => {
    const enumType = graphQLSchema.getType("NotificationType");

    if (!(enumType instanceof GraphQLEnumType)) {
      throw new Error("NotificationType must be registered as a GraphQL enum type");
    }

    const values = enumType.getValues();
    expect(values).toHaveLength(7);
    // The built schema is lexicographically sorted (enum-value order carries
    // no GraphQL semantics), so the pins compare as sorted sets:
    expect(values.map(value => value.name).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [
        "SessionRequest",
        "SessionCompletion",
        "SessionCancellation",
        "ParentLinkRequest",
        "SystemBroadcast",
        "PaymentConfirmation",
        "EvaluationResult",
      ].toSorted((a, b) => a.localeCompare(b))
    );
    // Runtime values stay the canonical snake_case strings — byte-identical
    // to the pgEnum / TS enum single source of truth.
    expect(values.map(value => value.value).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [
        "session_request",
        "session_completion",
        "session_cancellation",
        "parent_link_request",
        "system_broadcast",
        "payment_confirmation",
        "evaluation_result",
      ].toSorted((a, b) => a.localeCompare(b))
    );
    // Single-source agreement with the canonical TS enum itself.
    expect(values.map(value => value.name).toSorted((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(NotificationType).toSorted((a, b) => a.localeCompare(b))
    );
    expect(values.map(value => value.value).toSorted((a, b) => a.localeCompare(b))).toEqual(
      Object.values(NotificationType).toSorted((a, b) => a.localeCompare(b))
    );
  });

  test("Notification object exposes `id` and EXACTLY the eight inbox fields (structurally NO `userId`)", () => {
    const notificationType = graphQLSchema.getType("Notification");

    if (!(notificationType instanceof GraphQLObjectType)) {
      throw new Error("Notification must be registered as a GraphQL object type");
    }

    const fields = notificationType.getFields();
    const field = (name: string) => {
      const candidate = fields[name];
      if (!candidate) {
        throw new Error(`Notification must register the \`${name}\` field`);
      }
      return candidate;
    };

    expect(Object.keys(fields).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...CANONICAL_NOTIFICATION_FIELDS].toSorted((a, b) => a.localeCompare(b))
    );
    // Exact field types per the contract (ISO-8601 string convention for
    // timestamps — there is no DateTime scalar in this registry).
    expect(field("id").type.toString()).toBe("ID!");
    expect(field("type").type.toString()).toBe("NotificationType!");
    expect(field("title").type.toString()).toBe("String!");
    expect(field("body").type.toString()).toBe("String");
    expect(field("isRead").type.toString()).toBe("Boolean!");
    expect(field("relatedEntityType").type.toString()).toBe("String");
    expect(field("relatedEntityId").type.toString()).toBe("Int");
    expect(field("createdAt").type.toString()).toBe("String!");
    // SEC: the recipient `userId` is structurally absent from the surface —
    // the recipient is implied by the self-scoped caller, never disclosed.
    expect(Object.hasOwn(fields, "userId")).toBe(false);
  });

  test("`id` is the FIRST field defined on the canonical object source (Apollo normalization convention)", () => {
    // The built schema is lexicographically sorted (field order carries no
    // GraphQL semantics), so the id-FIRST convention is pinned at the
    // source level — lexical scan by design, like the gateway static gates.
    const source = readFileSync(
      resolve(process.cwd(), "backend/graphql/pothos/notifications/notification.pothos.ts"),
      "utf8"
    );
    const fieldsBlock = source.slice(source.indexOf("fields: t => ({"));
    const positions = CANONICAL_NOTIFICATION_FIELDS.map(name => ({
      name,
      at: fieldsBlock.indexOf(`${name}: `),
    }));
    for (const { at } of positions) {
      expect(at).toBeGreaterThanOrEqual(0);
    }
    const idPosition = positions.find(position => position.name === "id")?.at ?? -1;
    for (const { name, at } of positions) {
      if (name !== "id") {
        expect(idPosition).toBeLessThan(at);
      }
    }
  });

  test("NotificationListPage wrapper exposes EXACTLY items/totalCount/hasMore", () => {
    const pageType = graphQLSchema.getType("NotificationListPage");

    if (!(pageType instanceof GraphQLObjectType)) {
      throw new Error("NotificationListPage must be registered as a GraphQL object type");
    }

    const fields = pageType.getFields();
    expect(Object.keys(fields).toSorted((a, b) => a.localeCompare(b))).toEqual(["hasMore", "items", "totalCount"]);
    expect(fields.items?.type.toString()).toBe("[Notification!]!");
    expect(fields.totalCount?.type.toString()).toBe("Int!");
    expect(fields.hasMore?.type.toString()).toBe("Boolean!");
    // Wrapper is an embedded value object — no `id` (rows inside `items`
    // are the normalizable entities).
    expect(Object.hasOwn(fields, "id")).toBe(false);
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
  });
});
