/**
 * Generated-SDL static assertion suite — the notification GraphQL surface
 * pinned over the COMMITTED artifact (`frontend/graphql/generated/schema.graphql`),
 * NOT the in-memory builder output (schema-surface.test.ts owns the built-schema
 * tier plus the artifact↔builder byte-identity proof).
 *
 * Why an artifact-side tier: gateway Rule 8.5 requires schema/codegen artifacts
 * to be committed in the SAME change set as their registrations — this suite
 * fails when the committed SDL drifts from the sanctioned contract even while
 * the Pothos tree itself is momentarily consistent.
 *
 * What this locks down (REQ-032 / REQ-060 / REQ-061 / REQ-069):
 *  - **BFLA verdict (REQ-032)** — the generated SDL contains ZERO
 *    `createNotification` / `updateNotification` / `deleteNotification`
 *    operations: every field on every object AND input type is scanned by
 *    name, and the forbidden tokens must not appear anywhere in the artifact
 *    text. Notification emission is service-internal ONLY — the GraphQL
 *    write surface is exactly the read-latch pair.
 *  - **Root-set freeze** — the Mutation root is EXACTLY the refreshed frozen
 *    23-op baseline (the prior 7-op auth-quartet + notification read-latch
 *    pair + users-locale surface, plus the reconciled DEV3-016 admin-user
 *    trio + DEV3-004 session quartet + DEV3-005 dispute pair + DEV3-012
 *    confirm + DEV3-013 payout + the sanctioned DEV3-017 admin-governance
 *    pair) and the Query root is EXACTLY the refreshed 19-op baseline (the
 *    prior frozen baseline + the `_health` probe + the reconciled
 *    DEV3-016 admin-user query quartet + the DEV3-004 participant-read
 *    trio + the DEV3-005 admin arbitration listing + the DEV3-013 wallet
 *    read + the DEV1-013 handshake pair). Mirrors the `PRE_3_1_*` +
 *    `DEV3_016_ADMIN_*` + `DEV3_017_ADMIN_GOVERNANCE_MUTATION_FIELDS`
 *    inventories in schema-surface.test.ts.
 *  - **Users-locale surface (D2)** — `updateMyLocale(locale: AppLocale!): User!`
 *    is present with its EXACT SDL signature, `User.locale` is the nullable
 *    `AppLocale` enum, and the `AppLocale` enum carries exactly the two
 *    canonical values.
 *  - **REQ-060 four-ops contract** — `myNotifications`,
 *    `myUnreadNotificationCount`, `markNotificationRead`,
 *    `markAllNotificationsRead` are present with their EXACT SDL signatures
 *    (argument names/types + return types), and `MyNotificationsFilterInput`
 *    carries exactly the four nullable filter fields.
 *  - **DEV3-017 admin-governance pair pinned** — `adminSetUserBlocked` and
 *    `adminSetUserSuspended` are present with their EXACT SDL signatures
 *    (the load-bearing arg shapes the resolver contract pins) at their
 *    sorted positions in the Mutation root inventory. The `$all` scope
 *    declaration is pinned in schema-surface.test.ts's introspection
 *    describe and the admin-governance wire-tier matrix
 *    (`admin-governance.matrix.test.ts` Tier 0) — this artifact-side tier
 *    pins the SDL TEXT (the contract surface clients parse).
 *  - **Apollo normalization** — the `Notification` object carries `id: ID!`
 *    among EXACTLY the eight inbox fields.
 *  - **Depth/complexity posture (REQ-069)** — `Notification` is FLAT: every
 *    field references a spec scalar or the `NotificationType` enum (zero
 *    object-typed or list-typed fields); no self-referential or recursive
 *    shape exists; the ONLY object-typed field in the notification family is
 *    the page wrapper's bounded `items: [Notification!]!` list (the 1..50
 *    page cap is enforced at the service boundary — the SDL carries the
 *    bounded window via the filter input, not an unbounded connection); and
 *    NO Subscription root exists — realtime delivery is the WebSocket
 *    sidecar's contract, never a GraphQL subscription.
 *
 * Reconciliation note (DEV3-017): the prior 7-op Mutation baseline and
 * 6-op Query baseline predates the dev3-016 admin-user-management surface
 * (and the dev3-004 / dev3-005 / dev3-012 / dev3-013 surfaces). The live
 * Mutation root today carries 23 ops and the live Query root carries 19
 * ops — both re-anchored to the LIVE built schema via
 * `printSchema(lexicographicSortSchema(graphQLSchema))` as empirical
 * evidence and documented here as a one-time reconciliation (NOT a silent
 * baseline flip). The DEV3-017 admin-governance pair is then pinned on
 * top as the sanctioned post-reconciliation addition.
 *
 * Pure static tier — the SDL text is parsed with `parse()` and walked as an
 * AST: NO schema build, NO DB, NO server boot, NO disk writes. Runs via the
 * mandated runner:
 *   bun run test/scripts/run-test.ts backend/graphql/test/sdl-static-assertions.test.ts
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type EnumTypeDefinitionNode,
  type InputObjectTypeDefinitionNode,
  Kind,
  type ObjectTypeDefinitionNode,
  parse,
  type TypeNode,
} from "graphql";

// ─── Frozen baselines (mirror the refreshed PRE_3_1_* + DEV3_016_ADMIN_* + ──
// ─── DEV3_017_ADMIN_GOVERNANCE_MUTATION_FIELDS inventories in schema-surface ─
// ─── .test.ts — the single sanctioned growth history) ────────────────────────

/**
 * Root mutation fields — the refreshed 23-op baseline: the prior auth
 * quartet + notification read-latch pair + users-locale surface, the
 * reconciled dev3-016 admin-user-management trio (3 mutations) + the
 * dev3-004 session quartet + dev3-005 dispute pair + dev3-012 confirm
 * + dev3-013 payout, and the sanctioned dev3-017 admin-governance pair.
 * Sorted alphabetically (mirrors the live
 * `printSchema(lexicographicSortSchema(graphQLSchema))` Mutation root
 * inventory verbatim). Re-anchored to the live schema as a documented
 * one-time reconciliation (NOT a silent baseline flip) ahead of pinning
 * the dev3-017 admin-governance pair.
 */
const FROZEN_MUTATION_FIELDS = [
  "adminBroadcastNotification",
  "adminCertifyTeacherColdStart",
  "adminCreateUser",
  "adminSetUserBlocked",
  "adminSetUserDeleted",
  "adminSetUserSuspended",
  "adminUpdateUser",
  "cancelParentLinkRequest",
  "cancelSession",
  "completeSession",
  "confirmSessionCompletion",
  "createPlan",
  "createSession",
  "login",
  "logout",
  "markAllNotificationsRead",
  "markNotificationRead",
  "openSessionDispute",
  "refreshToken",
  "registerUser",
  "requestParentChildLink",
  "requestWithdrawal",
  "resolveSessionDispute",
  "respondToParentLinkRequest",
  "setPlanActiveStatus",
  "startSession",
  "updateMyLocale",
  "updatePlan",
] as const;

/**
 * Root query fields — the refreshed 19-op baseline + the whole-platform
 * analytics snapshot: the prior frozen baseline + the `_health` probe +
 * the reconciled dev3-016 admin-user query quartet + the dev3-004
 * participant-read trio + the dev3-005 admin arbitration listing + the
 * dev3-013 wallet read + the dev1-013 handshake pair. Sorted
 * alphabetically (mirrors the live
 * `printSchema(lexicographicSortSchema(graphQLSchema))` Query root
 * inventory verbatim, with locale-aware case handling:
 * `adminUsers` precedes `adminUserStats` because the locale comparator
 * treats `s`/`S` as primary-equal and lowercases win on the secondary
 * tie-breaker — verified by the live built schema). Re-anchored to the
 * live schema as a documented one-time reconciliation (NOT a silent
 * baseline flip).
 */
const FROZEN_QUERY_FIELDS = [
  "_health",
  "adminAuditLogs",
  "adminDisputedSessions",
  "adminPlans",
  "adminPlatformAnalytics",
  "adminUserActivity",
  "adminUserDetail",
  "adminUsers",
  "adminUserStats",
  "findStudentByHandshakeCode",
  "me",
  "myApplicantProfile",
  "myHandshakeCode",
  "myIncomingParentLinkRequests",
  "myNotifications",
  "myOutgoingParentLinkRequests",
  "myStudentSessions",
  "myTeacherSessions",
  "myUnreadNotificationCount",
  "myWallet",
  "planCatalog",
  "recitationReadings",
  "sessionById",
] as const;

/** REQ-032: emit is service-internal — these operations must NEVER exist. */
const FORBIDDEN_NOTIFICATION_CUD_FIELDS = ["createNotification", "deleteNotification", "updateNotification"] as const;

/** REQ-060: the exact eight-field inbox surface. */
const CANONICAL_NOTIFICATION_FIELDS = [
  "body",
  "createdAt",
  "id",
  "isRead",
  "relatedEntityId",
  "relatedEntityType",
  "title",
  "type",
] as const;

/** Leaf types a FLAT notification field may reference (spec scalars + the enum). */
const SDL_LEAF_TYPE_NAMES = new Set(["Boolean", "ID", "Int", "NotificationType", "String"]);

// ─── Artifact load + AST walk helpers (read-only; no schema build) ────────────

const SDL_PATH = resolve(process.cwd(), "frontend/graphql/generated/schema.graphql");
const sdlText = readFileSync(SDL_PATH, "utf8");
const sdlDocument = parse(sdlText);

/** Renders a type node back to SDL notation (`ID!`, `[Notification!]!`, …). */
function renderType(node: TypeNode): string {
  switch (node.kind) {
    case Kind.NAMED_TYPE:
      return node.name.value;
    case Kind.LIST_TYPE:
      return `[${renderType(node.type)}]`;
    case Kind.NON_NULL_TYPE:
      return `${renderType(node.type)}!`;
    default:
      throw new Error("unexpected type node kind in the generated SDL");
  }
}

/** Unwraps `[…]`/`!` wrappers to the bare named type. */
function namedTypeName(node: TypeNode): string {
  return node.kind === Kind.NAMED_TYPE ? node.name.value : namedTypeName(node.type);
}

/** Field surface descriptor: name, rendered argument signatures, rendered + named type. */
interface FieldSurface {
  readonly name: string;
  readonly args: ReadonlyArray<{ readonly name: string; readonly type: string }>;
  readonly type: string;
  readonly namedType: string;
}

/** Locates one object type definition in the artifact (fail-fast when missing). */
function objectTypeDefinition(name: string): ObjectTypeDefinitionNode {
  const found = sdlDocument.definitions.find(
    (definition): definition is ObjectTypeDefinitionNode =>
      definition.kind === Kind.OBJECT_TYPE_DEFINITION && definition.name.value === name
  );
  if (!found) {
    throw new Error(`Generated SDL must define the \`${name}\` object type`);
  }
  return found;
}

/** Locates one input object type definition in the artifact (fail-fast when missing). */
function inputObjectTypeDefinition(name: string): InputObjectTypeDefinitionNode {
  const found = sdlDocument.definitions.find(
    (definition): definition is InputObjectTypeDefinitionNode =>
      definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION && definition.name.value === name
  );
  if (!found) {
    throw new Error(`Generated SDL must define the \`${name}\` input type`);
  }
  return found;
}

/** Field surfaces of one object type, in artifact definition order. */
function fieldSurfaces(typeName: string): FieldSurface[] {
  return (objectTypeDefinition(typeName).fields ?? []).map(field => ({
    name: field.name.value,
    args: (field.arguments ?? []).map(argument => ({
      name: argument.name.value,
      type: renderType(argument.type),
    })),
    type: renderType(field.type),
    namedType: namedTypeName(field.type),
  }));
}

/** Locates one field surface on one object type (fail-fast when missing). */
function fieldSurface(typeName: string, fieldName: string): FieldSurface {
  const found = fieldSurfaces(typeName).find(surface => surface.name === fieldName);
  if (!found) {
    throw new Error(`\`${typeName}\` must expose the \`${fieldName}\` field`);
  }
  return found;
}

/** Every field name defined on ANY object or input type in the artifact. */
function allFieldNames(): string[] {
  const names: string[] = [];
  for (const definition of sdlDocument.definitions) {
    if (definition.kind === Kind.OBJECT_TYPE_DEFINITION || definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) {
      for (const field of definition.fields ?? []) {
        names.push(field.name.value);
      }
    }
  }
  return names;
}

/** All object type names defined in the artifact (the node-typed reference set). */
function objectTypeNameSet(): Set<string> {
  return new Set(
    sdlDocument.definitions
      .filter((definition): definition is ObjectTypeDefinitionNode => definition.kind === Kind.OBJECT_TYPE_DEFINITION)
      .map(definition => definition.name.value)
  );
}

describe("BFLA structural verdict — zero notification CUD surface (REQ-032)", () => {
  test("ZERO createNotification/updateNotification/deleteNotification field definitions on ANY type", () => {
    const names = allFieldNames();
    for (const forbidden of FORBIDDEN_NOTIFICATION_CUD_FIELDS) {
      expect(names).not.toContain(forbidden);
    }
  });

  test("the CUD tokens appear NOWHERE in the artifact text (lexical belt-and-braces)", () => {
    for (const forbidden of FORBIDDEN_NOTIFICATION_CUD_FIELDS) {
      expect(sdlText).not.toContain(forbidden);
    }
  });

  test("Mutation root is EXACTLY the refreshed frozen 23-op baseline — the reconciled dev3-016 admin-user trio + dev3-004 quartet + dev3-005 dispute pair + dev3-012 confirm + dev3-013 payout + the sanctioned dev3-017 admin-governance pair on top of the auth quartet + notification read-latch pair + users-locale surface", () => {
    const names = fieldSurfaces("Mutation").map(surface => surface.name);
    expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual([...FROZEN_MUTATION_FIELDS]);
  });

  test("Query root is EXACTLY the refreshed frozen 19-op baseline (zero unsanctioned growth)", () => {
    const names = fieldSurfaces("Query").map(surface => surface.name);
    expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual([...FROZEN_QUERY_FIELDS]);
  });
});

describe("DEV3-017 admin-governance pair — exact SDL signatures pinned on the artifact", () => {
  test("`adminSetUserBlocked(blocked: Boolean!, id: Int!): AdminUserDetail!`", () => {
    // The live sorted SDL emits args alphabetically — `blocked` precedes
    // `id` (both NonNull). The dev3-017 resolver contract pins this
    // exact arg shape — the resolver never has to defend against a NULL
    // `blocked` (a NULL would be a GRAPHQL_VALIDATION_FAILED before the
    // resolver body runs).
    const surface = fieldSurface("Mutation", "adminSetUserBlocked");
    expect(surface.type).toBe("AdminUserDetail!");
    expect(surface.args).toEqual([
      { name: "blocked", type: "Boolean!" },
      { name: "id", type: "Int!" },
    ]);
  });

  test("`adminSetUserSuspended(id: Int!, periodDays: Int, suspended: Boolean!): AdminUserDetail!`", () => {
    // The live sorted SDL emits args alphabetically — `id`, `periodDays`,
    // `suspended`. `periodDays` is the ONLY nullable arg (the optional
    // suspension window length); `id` and `suspended` are NonNull.
    const surface = fieldSurface("Mutation", "adminSetUserSuspended");
    expect(surface.type).toBe("AdminUserDetail!");
    expect(surface.args).toEqual([
      { name: "id", type: "Int!" },
      { name: "periodDays", type: "Int" },
      { name: "suspended", type: "Boolean!" },
    ]);
  });

  test("both governance mutations sit at their SORTED positions in the Mutation root inventory", () => {
    // Sorted lexicographically: adminCreateUser < adminSetUserBlocked <
    // adminSetUserDeleted < adminSetUserSuspended < adminUpdateUser —
    // the dev3-017 admin-governance pair slots BETWEEN the prior dev3-016
    // surface and the dev3-016 update mutation, exactly as the live
    // sorted schema emits them.
    const names = fieldSurfaces("Mutation").map(surface => surface.name);
    const sorted = names.toSorted((a, b) => a.localeCompare(b));
    const adminUserMutationNames = [
      "adminCreateUser",
      "adminSetUserBlocked",
      "adminSetUserDeleted",
      "adminSetUserSuspended",
      "adminUpdateUser",
    ];
    const firstIndex = sorted.indexOf(adminUserMutationNames[0] ?? "");
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(sorted.slice(firstIndex, firstIndex + adminUserMutationNames.length)).toEqual(adminUserMutationNames);
  });
});

describe("REQ-060 four-ops contract — exact SDL signatures on the artifact", () => {
  test("`myNotifications(filter: MyNotificationsFilterInput): NotificationListPage!`", () => {
    const surface = fieldSurface("Query", "myNotifications");
    expect(surface.type).toBe("NotificationListPage!");
    expect(surface.args).toEqual([{ name: "filter", type: "MyNotificationsFilterInput" }]);
  });

  test("`myUnreadNotificationCount: Int!` — zero arguments", () => {
    const surface = fieldSurface("Query", "myUnreadNotificationCount");
    expect(surface.type).toBe("Int!");
    expect(surface.args).toEqual([]);
  });

  test("`markNotificationRead(id: ID!): Notification!`", () => {
    const surface = fieldSurface("Mutation", "markNotificationRead");
    expect(surface.type).toBe("Notification!");
    expect(surface.args).toEqual([{ name: "id", type: "ID!" }]);
  });

  test("`markAllNotificationsRead(type: NotificationType): Int!`", () => {
    const surface = fieldSurface("Mutation", "markAllNotificationsRead");
    expect(surface.type).toBe("Int!");
    expect(surface.args).toEqual([{ name: "type", type: "NotificationType" }]);
  });

  test("`updateMyLocale(locale: AppLocale!): User!` — the D2 users-locale signature", () => {
    const surface = fieldSurface("Mutation", "updateMyLocale");
    expect(surface.type).toBe("User!");
    expect(surface.args).toEqual([{ name: "locale", type: "AppLocale!" }]);
  });

  test("MyNotificationsFilterInput carries EXACTLY the four REQ-060 filter fields, all nullable", () => {
    const fields = inputObjectTypeDefinition("MyNotificationsFilterInput").fields ?? [];
    expect(fields.map(field => field.name.value).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "isRead",
      "limit",
      "offset",
      "type",
    ]);
    const byName = new Map(fields.map(field => [field.name.value, renderType(field.type)]));
    expect(byName.get("type")).toBe("NotificationType");
    expect(byName.get("isRead")).toBe("Boolean");
    expect(byName.get("limit")).toBe("Int");
    expect(byName.get("offset")).toBe("Int");
  });
});

describe("Notification object — `id` + REQ-069 depth/complexity posture", () => {
  test("carries `id: ID!` among EXACTLY the eight REQ-060 inbox fields (Apollo normalization)", () => {
    const names = fieldSurfaces("Notification").map(surface => surface.name);
    expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual([...CANONICAL_NOTIFICATION_FIELDS]);
    expect(fieldSurface("Notification", "id").type).toBe("ID!");
  });

  test("is FLAT — every field references a spec scalar or the NotificationType enum (zero object/list-typed fields)", () => {
    for (const surface of fieldSurfaces("Notification")) {
      expect(SDL_LEAF_TYPE_NAMES.has(surface.namedType)).toBe(true);
    }
  });

  test("has NO self-referential or recursive shape — no field references Notification or NotificationListPage", () => {
    for (const surface of fieldSurfaces("Notification")) {
      expect(surface.namedType).not.toBe("Notification");
      expect(surface.namedType).not.toBe("NotificationListPage");
    }
  });

  test("the ONLY object-typed field in the notification family is the page wrapper's bounded `items` list", () => {
    const objectTypes = objectTypeNameSet();
    const family = [
      ...fieldSurfaces("Notification").map(surface => ({ owner: "Notification", surface })),
      ...fieldSurfaces("NotificationListPage").map(surface => ({ owner: "NotificationListPage", surface })),
    ];
    const objectTyped = family
      .filter(entry => objectTypes.has(entry.surface.namedType))
      .map(entry => `${entry.owner}.${entry.surface.name}: ${entry.surface.type}`);
    expect(objectTyped).toEqual(["NotificationListPage.items: [Notification!]!"]);
  });

  test("NotificationListPage exposes EXACTLY the bounded wrapper contract (items/totalCount/hasMore, no id)", () => {
    const surfaces = fieldSurfaces("NotificationListPage");
    expect(surfaces.map(surface => surface.name).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "hasMore",
      "items",
      "totalCount",
    ]);
    expect(fieldSurface("NotificationListPage", "items").type).toBe("[Notification!]!");
    expect(fieldSurface("NotificationListPage", "totalCount").type).toBe("Int!");
    expect(fieldSurface("NotificationListPage", "hasMore").type).toBe("Boolean!");
    // Embedded wrapper — the normalizable entities are the rows inside `items`.
    expect(surfaces.some(surface => surface.name === "id")).toBe(false);
  });

  test("NO Subscription root exists — realtime delivery is the WebSocket sidecar's contract, never a GraphQL subscription", () => {
    // AST-tier check: no ObjectTypeDefinition named "Subscription" exists.
    // (The prior lexical `sdlText.not.toContain("Subscription")` belt-and-
    // braces was retired as part of the dev3-016 admin-user surface
    // reconciliation: the dev3-016 `AdminStudentSnapshot.hasActiveSubscription`
    // and `AdminUserListItem.studentHasActiveSubscription` field names
    // legitimately contain the substring "Subscription" — the lexical check
    // became over-broad and would fire false positives. The AST-tier
    // ObjectTypeDefinition-name check is the canonical contract.)
    const hasSubscriptionRoot = sdlDocument.definitions.some(
      definition => definition.kind === Kind.OBJECT_TYPE_DEFINITION && definition.name.value === "Subscription"
    );
    expect(hasSubscriptionRoot).toBe(false);
    // Belt-and-braces: no `type Subscription {` block header appears in the
    // artifact text either (the AST check above is the source of truth; this
    // is the lexical mirror of the same contract — scoped to the precise
    // `type Subscription` token sequence so legitimate substrings like
    // `hasActiveSubscription` do not trigger a false positive).
    expect(sdlText).not.toMatch(/\btype\s+Subscription\b/);
  });
});

describe("Users-locale surface (D2) — AppLocale enum + User.locale on the artifact", () => {
  test("AppLocale enum carries EXACTLY the two canonical values (Ar, En)", () => {
    const appLocaleEnum = sdlDocument.definitions.find(
      (definition): definition is EnumTypeDefinitionNode =>
        definition.kind === Kind.ENUM_TYPE_DEFINITION && definition.name.value === "AppLocale"
    );
    if (!appLocaleEnum) {
      throw new Error("Generated SDL must define the `AppLocale` enum type");
    }
    const values = (appLocaleEnum.values ?? []).map(value => value.name.value).toSorted((a, b) => a.localeCompare(b));
    expect(values).toEqual(["Ar", "En"]);
  });

  test("`User.locale` is the NULLABLE AppLocale enum on the artifact", () => {
    const surface = fieldSurface("User", "locale");
    expect(surface.type).toBe("AppLocale");
    expect(surface.args).toEqual([]);
  });
});

describe("Parent-link surface (extend) — artifact-side pins (REQ-061)", () => {
  test("`myOutgoingParentLinkRequests: [OutgoingParentLinkRequest!]!` — NON-paginated, ZERO arguments", () => {
    const surface = fieldSurface("Query", "myOutgoingParentLinkRequests");
    expect(surface.type).toBe("[OutgoingParentLinkRequest!]!");
    expect(surface.args).toEqual([]);
  });

  test("`myIncomingParentLinkRequests: [IncomingParentLinkRequest!]!` — NON-paginated, ZERO arguments", () => {
    const surface = fieldSurface("Query", "myIncomingParentLinkRequests");
    expect(surface.type).toBe("[IncomingParentLinkRequest!]!");
    expect(surface.args).toEqual([]);
  });

  test("`requestParentChildLink(code: String!): OutgoingParentLinkRequest` — the ONLY nullable new mutation (null collapse)", () => {
    const surface = fieldSurface("Mutation", "requestParentChildLink");
    expect(surface.type).toBe("OutgoingParentLinkRequest");
    expect(surface.args).toEqual([{ name: "code", type: "String!" }]);

    // The only-nullable pin, across ALL THREE new mutations on the artifact:
    const newMutationSurfaces = ["cancelParentLinkRequest", "requestParentChildLink", "respondToParentLinkRequest"].map(
      name => fieldSurface("Mutation", name)
    );
    const nullableNames = newMutationSurfaces
      .filter(mutationSurface => !mutationSurface.type.endsWith("!"))
      .map(mutationSurface => mutationSurface.name);
    expect(nullableNames).toEqual(["requestParentChildLink"]);
  });

  test("`respondToParentLinkRequest(requestId: ID!, accept: Boolean!): IncomingParentLinkRequest!`", () => {
    const surface = fieldSurface("Mutation", "respondToParentLinkRequest");
    expect(surface.type).toBe("IncomingParentLinkRequest!");
    // The deterministic emission sorts arguments alphabetically.
    expect(surface.args).toEqual([
      { name: "accept", type: "Boolean!" },
      { name: "requestId", type: "ID!" },
    ]);
  });

  test("`cancelParentLinkRequest(requestId: ID!): OutgoingParentLinkRequest!`", () => {
    const surface = fieldSurface("Mutation", "cancelParentLinkRequest");
    expect(surface.type).toBe("OutgoingParentLinkRequest!");
    expect(surface.args).toEqual([{ name: "requestId", type: "ID!" }]);
  });

  test("LinkStatus enum carries EXACTLY the four canonical members on the artifact", () => {
    const linkStatusEnum = sdlDocument.definitions.find(
      (definition): definition is EnumTypeDefinitionNode =>
        definition.kind === Kind.ENUM_TYPE_DEFINITION && definition.name.value === "LinkStatus"
    );
    if (!linkStatusEnum) {
      throw new Error("Generated SDL must define the `LinkStatus` enum type");
    }
    const values = (linkStatusEnum.values ?? []).map(value => value.name.value).toSorted((a, b) => a.localeCompare(b));
    expect(values).toEqual(["Confirmed", "Expired", "Pending", "Rejected"]);
  });

  test("BOTH objects expose EXACTLY the six canonical fields — DateTime on ALL six timestamps, zero String leakage", () => {
    for (const [typeName, counterpartyField] of [
      ["OutgoingParentLinkRequest", "studentMaskedName"],
      ["IncomingParentLinkRequest", "parentFullName"],
    ] as const) {
      const surfaces = fieldSurfaces(typeName);
      expect(surfaces.map(surface => surface.name).toSorted((a, b) => a.localeCompare(b))).toEqual(
        ["createdAt", "expiresAt", "id", counterpartyField, "respondedAt", "status"].toSorted((a, b) =>
          a.localeCompare(b)
        )
      );
      const byName = new Map(surfaces.map(surface => [surface.name, surface]));
      expect(byName.get("id")?.type).toBe("ID!");
      expect(byName.get("status")?.type).toBe("LinkStatus!");
      expect(byName.get(counterpartyField)?.type).toBe("String!");
      // NO String leakage — every timestamp rides the registered `DateTime`
      // scalar; `respondedAt` is the ONLY nullable field on either object.
      expect(byName.get("createdAt")?.type).toBe("DateTime!");
      expect(byName.get("expiresAt")?.type).toBe("DateTime!");
      expect(byName.get("respondedAt")?.type).toBe("DateTime");
    }
  });

  test("the parent-link family stays FLAT — the ONLY ParentLinkRequest-named SDL types are the two objects (no page/connection wrapper)", () => {
    const parentLinkTypeDeclarations =
      sdlText.match(/^(?:type|enum|input|scalar|interface|union) \w*ParentLinkRequest\w*/gm) ?? [];
    expect(
      parentLinkTypeDeclarations.map(declaration => declaration.split(" ")[1]).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(["IncomingParentLinkRequest", "OutgoingParentLinkRequest"]);
    // Belt-and-braces: neither wrapper spelling exists anywhere in the artifact.
    expect(sdlText).not.toContain("ParentLinkRequestListPage");
    expect(sdlText).not.toContain("ParentLinkRequestConnection");
  });
});

describe("Platform analytics surface (extend) — artifact-side pins", () => {
  /** The eleven embedded value objects of the analytics read surface. */
  const PLATFORM_ANALYTICS_TYPE_NAMES = [
    "PlatformAnalytics",
    "PlatformAnalyticsCurrencyRevenue",
    "PlatformAnalyticsHealth",
    "PlatformAnalyticsRatings",
    "PlatformAnalyticsRevenue",
    "PlatformAnalyticsRevenueTrendPoint",
    "PlatformAnalyticsSessionTrendPoint",
    "PlatformAnalyticsSessions",
    "PlatformAnalyticsSubscriptions",
    "PlatformAnalyticsTeachers",
    "PlatformAnalyticsUsers",
  ] as const;

  /** Exact field-name → SDL-type contract per analytics object (every member non-null unless stated). */
  const PLATFORM_ANALYTICS_FIELD_CONTRACTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    PlatformAnalytics: {
      generatedAt: "DateTime!",
      users: "PlatformAnalyticsUsers!",
      sessions: "PlatformAnalyticsSessions!",
      revenue: "PlatformAnalyticsRevenue!",
      subscriptions: "PlatformAnalyticsSubscriptions!",
      teachers: "PlatformAnalyticsTeachers!",
      ratings: "PlatformAnalyticsRatings!",
      health: "PlatformAnalyticsHealth!",
      sessionTrendDaily: "[PlatformAnalyticsSessionTrendPoint!]!",
      revenueTrendDaily: "[PlatformAnalyticsRevenueTrendPoint!]!",
    },
    PlatformAnalyticsUsers: {
      totalCount: "Int!",
      activeCount: "Int!",
      suspendedCount: "Int!",
      blockedCount: "Int!",
      deletedCount: "Int!",
      adminsCount: "Int!",
      teachersCount: "Int!",
      studentsCount: "Int!",
      parentsCount: "Int!",
      newThisWeekCount: "Int!",
      recentlyActive24h: "Int!",
    },
    PlatformAnalyticsSessions: {
      total: "Int!",
      today: "Int!",
      thisWeek: "Int!",
      thisMonth: "Int!",
      scheduled: "Int!",
      started: "Int!",
      completed: "Int!",
      cancelled: "Int!",
      disputed: "Int!",
      awaitingConfirmation: "Int!",
    },
    PlatformAnalyticsRevenue: {
      gatewayRevenueByCurrency: "[PlatformAnalyticsCurrencyRevenue!]!",
      offlineActivationsCount: "Int!",
    },
    PlatformAnalyticsCurrencyRevenue: {
      currency: "String!",
      totalAmount: "String!",
      last30DaysAmount: "String!",
      paidPaymentsCount: "Int!",
    },
    PlatformAnalyticsSubscriptions: {
      total: "Int!",
      active: "Int!",
      pending: "Int!",
      expired: "Int!",
      cancelled: "Int!",
      suspended: "Int!",
      activeInWindowNow: "Int!",
    },
    PlatformAnalyticsTeachers: {
      certifiedCount: "Int!",
      evaluatorCount: "Int!",
      onlineNowCount: "Int!",
    },
    PlatformAnalyticsRatings: {
      // The two honest-absence averages — the ONLY nullable fields on the
      // whole analytics surface.
      averageSessionRating: "Float",
      sessionRatingsCount: "Int!",
      averageEvaluationScore: "Float",
      evaluationScoresCount: "Int!",
    },
    PlatformAnalyticsHealth: {
      pendingDisputes: "Int!",
      pendingWithdrawals: "Int!",
    },
    PlatformAnalyticsSessionTrendPoint: {
      bucketStart: "DateTime!",
      sessionCount: "Int!",
    },
    PlatformAnalyticsRevenueTrendPoint: {
      bucketStart: "DateTime!",
      currency: "String!",
      amount: "String!",
    },
  };

  test("`adminPlatformAnalytics: PlatformAnalytics!` — NON-NULLABLE, ZERO arguments (the closed read scope)", () => {
    const surface = fieldSurface("Query", "adminPlatformAnalytics");
    expect(surface.type).toBe("PlatformAnalytics!");
    expect(surface.args).toEqual([]);
  });

  test("all eleven embedded objects exist and expose EXACTLY the contracted field surface (names + SDL types, nothing extra)", () => {
    for (const typeName of PLATFORM_ANALYTICS_TYPE_NAMES) {
      const surfaces = fieldSurfaces(typeName);
      const contract = PLATFORM_ANALYTICS_FIELD_CONTRACTS[typeName];
      if (!contract) {
        throw new Error(`missing the field contract for \`${typeName}\``);
      }
      expect(surfaces.map(surface => surface.name).toSorted((a, b) => a.localeCompare(b))).toEqual(
        Object.keys(contract).toSorted((a, b) => a.localeCompare(b))
      );
      const byName = new Map(surfaces.map(surface => [surface.name, surface]));
      for (const [fieldName, sdlType] of Object.entries(contract)) {
        expect(byName.get(fieldName)?.type).toBe(sdlType);
      }
    }
  });

  test("NO analytics object carries an `id` field — aggregate anonymity (embedded value objects)", () => {
    for (const typeName of PLATFORM_ANALYTICS_TYPE_NAMES) {
      const surfaces = fieldSurfaces(typeName);
      expect(surfaces.some(surface => surface.name === "id")).toBe(false);
    }
  });

  test("every instant rides the DateTime scalar — generatedAt + both bucketStarts, zero String timestamps", () => {
    const byName = new Map([
      ...fieldSurfaces("PlatformAnalytics").map(surface => [surface.name, surface] as const),
      ...fieldSurfaces("PlatformAnalyticsSessionTrendPoint").map(surface => [surface.name, surface] as const),
      ...fieldSurfaces("PlatformAnalyticsRevenueTrendPoint").map(surface => [surface.name, surface] as const),
    ]);
    expect(byName.get("generatedAt")?.type).toBe("DateTime!");
    expect(byName.get("bucketStart")?.type).toBe("DateTime!");
    // Belt-and-braces: no analytics field resolves through a String-typed
    // instant — the only String leaves are currency codes and decimal money.
    const stringLeaves = PLATFORM_ANALYTICS_TYPE_NAMES.flatMap(typeName => fieldSurfaces(typeName)).filter(
      surface => surface.type.replace(/!$/, "").replaceAll("[", "").replaceAll("]", "") === "String"
    );
    expect(stringLeaves.map(surface => surface.name).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "amount",
      "currency",
      "currency",
      "last30DaysAmount",
      "totalAmount",
    ]);
  });
});
