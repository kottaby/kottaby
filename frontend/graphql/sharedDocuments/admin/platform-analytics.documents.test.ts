/**
 * Structural lock over the platform-analytics shared GraphQL document.
 *
 * Mirrors the `sharedDocuments/notifications/notification.documents.test.ts`
 * discipline for the admin analytics domain: the dashboard container relies
 * on this SHARED `TypedDocumentNode` document, so drift fails at this pure
 * logic tier instead of surfacing as confusing wire mismatches later:
 *
 *   1. NAMED operation — the document is a single named query whose GraphQL
 *      operation name matches its export convention
 *      (`adminPlatformAnalyticsQueryDocument` ↔ `AdminPlatformAnalytics`).
 *   2. Zero-variable closed surface — the operation declares NO variables,
 *      carries NO fragments, and the root field takes NO arguments (not
 *      even literals): the whole-platform snapshot is derived server-side
 *      from the authenticated admin caller, leaving the client nothing to
 *      steer.
 *   3. Full closed selection — the operation selects the ENTIRE snapshot
 *      leaf-for-leaf: the `generatedAt` coherence stamp, all seven section
 *      aggregates and both 30-day trend series, every leaf exactly once and
 *      every leaf a bare scalar (no undeclared nesting).
 *   4. Aggregate anonymity — no `id` field is selected anywhere in the
 *      subtree: every `PlatformAnalytics*` type is an aggregate/embedded
 *      value object with no `id` (selecting one would fail validation).
 *   5. Codegen binding + barrel parity — the constant stays
 *      `TypedDocumentNode`-typed against the generated operation type
 *      (compile-time proof by assignment), and both the admin sub-barrel
 *      and the top-level barrel re-export the SAME document instance as the
 *      deep import (consumer import conventions table).
 *
 * Zero server boot, zero DB, zero network: inspects only the already-
 * compiled AST through graphql kind-guard narrowing — no unsafe assertions
 * anywhere (oxlint `no-unsafe-type-assertion`).
 */

import { describe, expect, test } from "bun:test";
import type { TypedDocumentNode } from "@apollo/client";
import type { DocumentNode, FieldNode, OperationDefinitionNode } from "graphql";
import type { AdminPlatformAnalyticsQuery } from "@/frontend/graphql/generated/gql/graphql";
import { adminPlatformAnalyticsQueryDocument as adminPlatformAnalyticsViaTopBarrel } from "@/frontend/graphql/sharedDocuments";
import { adminPlatformAnalyticsQueryDocument as adminPlatformAnalyticsViaAdminBarrel } from "@/frontend/graphql/sharedDocuments/admin";
import { adminPlatformAnalyticsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin/platform-analytics.documents";

// ---------------------------------------------------------------------------
// Assertion-free AST helpers

function operationOrThrow(document: DocumentNode): OperationDefinitionNode {
  const operations = document.definitions.filter(
    (definition): definition is OperationDefinitionNode => definition.kind === "OperationDefinition"
  );
  expect(operations).toHaveLength(1);
  if (operations.length < 1) {
    throw new Error("expected exactly one OperationDefinition");
  }
  return operations[0];
}

function subFields(parent: OperationDefinitionNode | FieldNode): FieldNode[] {
  const selectionSet = parent.selectionSet;
  if (!selectionSet) {
    return [];
  }
  return selectionSet.selections.filter((selection): selection is FieldNode => selection.kind === "Field");
}

function subField(parent: OperationDefinitionNode | FieldNode, name: string): FieldNode | undefined {
  return subFields(parent).find(field => field.name.value === name);
}

/** Resolves a dotted selection path ("adminPlatformAnalytics.users") or throws. */
function selectionPath(operation: OperationDefinitionNode, path: string): FieldNode {
  const segments = path.split(".");
  const first = subField(operation, segments[0]);
  if (first === undefined) {
    throw new Error(`expected selection ${path} to exist (missing ${segments[0]})`);
  }
  let current: FieldNode = first;
  for (const segment of segments.slice(1)) {
    const field = subField(current, segment);
    if (field === undefined) {
      throw new Error(`expected selection ${path} to exist (missing ${segment})`);
    }
    current = field;
  }
  return current;
}

function fieldNames(parent: OperationDefinitionNode | FieldNode): string[] {
  return subFields(parent).map(field => field.name.value);
}

function variableNames(operation: OperationDefinitionNode): string[] {
  return (operation.variableDefinitions ?? []).map(definition => definition.variable.name.value);
}

/** Dotted paths of every field in the subtree, pre-order (scalar or object). */
function collectFieldPaths(parent: OperationDefinitionNode | FieldNode, prefix: string): string[] {
  return subFields(parent).flatMap(field => {
    const path = prefix === "" ? field.name.value : `${prefix}.${field.name.value}`;
    return [path].concat(collectFieldPaths(field, path));
  });
}

/** Dotted paths of every OBJECT field (a field carrying its own selection set). */
function collectObjectPaths(parent: OperationDefinitionNode | FieldNode, prefix: string): string[] {
  return subFields(parent).flatMap(field => {
    const path = prefix === "" ? field.name.value : `${prefix}.${field.name.value}`;
    if (!field.selectionSet) {
      return [];
    }
    return [path].concat(collectObjectPaths(field, path));
  });
}

// ---------------------------------------------------------------------------
// Contract tables

/** Root selection, in contract (source) order: coherence stamp + seven
 * sections + both trend series — the full closed snapshot surface. */
const ROOT_FIELDS: readonly string[] = [
  "generatedAt",
  "users",
  "sessions",
  "revenue",
  "subscriptions",
  "teachers",
  "ratings",
  "health",
  "sessionTrendDaily",
  "revenueTrendDaily",
];

interface SelectionRow {
  /** Dotted selection path of the object-typed node. */
  readonly path: string;
  /** Exact sub-selection names, in contract (source) order. */
  readonly fields: readonly string[];
  /** Dotted paths (relative to the root field) of the `fields` entries that
   * are object selections with their own row. */
  readonly objectChildPaths?: readonly string[];
}

const SELECTION_TABLE: readonly SelectionRow[] = [
  {
    path: "adminPlatformAnalytics",
    fields: ROOT_FIELDS,
    objectChildPaths: [
      "adminPlatformAnalytics.users",
      "adminPlatformAnalytics.sessions",
      "adminPlatformAnalytics.revenue",
      "adminPlatformAnalytics.subscriptions",
      "adminPlatformAnalytics.teachers",
      "adminPlatformAnalytics.ratings",
      "adminPlatformAnalytics.health",
      "adminPlatformAnalytics.sessionTrendDaily",
      "adminPlatformAnalytics.revenueTrendDaily",
    ],
  },
  {
    path: "adminPlatformAnalytics.users",
    fields: [
      "totalCount",
      "activeCount",
      "suspendedCount",
      "blockedCount",
      "deletedCount",
      "adminsCount",
      "teachersCount",
      "studentsCount",
      "parentsCount",
      "newThisWeekCount",
      "recentlyActive24h",
    ],
  },
  {
    path: "adminPlatformAnalytics.sessions",
    fields: [
      "total",
      "today",
      "thisWeek",
      "thisMonth",
      "scheduled",
      "started",
      "completed",
      "cancelled",
      "disputed",
      "awaitingConfirmation",
    ],
  },
  {
    path: "adminPlatformAnalytics.revenue",
    fields: ["offlineActivationsCount", "gatewayRevenueByCurrency"],
    objectChildPaths: ["adminPlatformAnalytics.revenue.gatewayRevenueByCurrency"],
  },
  {
    path: "adminPlatformAnalytics.revenue.gatewayRevenueByCurrency",
    fields: ["currency", "totalAmount", "last30DaysAmount", "paidPaymentsCount"],
  },
  {
    path: "adminPlatformAnalytics.subscriptions",
    fields: ["total", "active", "pending", "expired", "cancelled", "suspended", "activeInWindowNow"],
  },
  {
    path: "adminPlatformAnalytics.teachers",
    fields: ["certifiedCount", "evaluatorCount", "onlineNowCount"],
  },
  {
    path: "adminPlatformAnalytics.ratings",
    fields: ["averageSessionRating", "sessionRatingsCount", "averageEvaluationScore", "evaluationScoresCount"],
  },
  {
    path: "adminPlatformAnalytics.health",
    fields: ["pendingDisputes", "pendingWithdrawals"],
  },
  {
    path: "adminPlatformAnalytics.sessionTrendDaily",
    fields: ["bucketStart", "sessionCount"],
  },
  {
    path: "adminPlatformAnalytics.revenueTrendDaily",
    fields: ["bucketStart", "currency", "amount"],
  },
];

const OBJECT_PATHS: readonly string[] = SELECTION_TABLE.map(row => row.path);

describe("platform analytics document — named operation + zero-variable closed surface", () => {
  test("AdminPlatformAnalytics is a single named zero-variable query", () => {
    const operation = operationOrThrow(adminPlatformAnalyticsQueryDocument);
    expect(operation.name?.value).toBe("AdminPlatformAnalytics");
    expect(operation.name?.value ?? "").not.toBe("");
    expect(operation.operation).toBe("query");
    expect(variableNames(operation)).toEqual([]);
  });

  test("the document carries no fragments (single operation definition, nothing else)", () => {
    expect(adminPlatformAnalyticsQueryDocument.definitions).toHaveLength(1);
    expect(adminPlatformAnalyticsQueryDocument.definitions[0]?.kind).toBe("OperationDefinition");
  });

  test("the root field carries zero arguments (closed input surface — nothing steerable)", () => {
    const operation = operationOrThrow(adminPlatformAnalyticsQueryDocument);
    const root = selectionPath(operation, "adminPlatformAnalytics");
    // graphql-js types `arguments` as optional; an absent one simply yields
    // zero arguments for the no-arg `adminPlatformAnalytics` root field.
    expect((root.arguments ?? []).map(argument => argument.name.value)).toEqual([]);
  });
});

describe("platform analytics document — full closed selection", () => {
  test("the root selects exactly the coherence stamp + seven sections + both trends", () => {
    const operation = operationOrThrow(adminPlatformAnalyticsQueryDocument);
    expect(fieldNames(selectionPath(operation, "adminPlatformAnalytics"))).toEqual([...ROOT_FIELDS]);
  });

  test("every object selection carries exactly its contracted leaves (leaf-for-leaf)", () => {
    const operation = operationOrThrow(adminPlatformAnalyticsQueryDocument);
    for (const row of SELECTION_TABLE) {
      expect(fieldNames(selectionPath(operation, row.path))).toEqual([...row.fields]);
    }
  });

  test("the generatedAt coherence stamp is selected as a bare scalar leaf", () => {
    const operation = operationOrThrow(adminPlatformAnalyticsQueryDocument);
    const generatedAt = subField(selectionPath(operation, "adminPlatformAnalytics"), "generatedAt");
    expect(generatedAt).toBeDefined();
    expect(generatedAt?.selectionSet).toBeUndefined();
  });

  test("every contracted scalar leaf is bare (no undeclared nesting anywhere)", () => {
    const operation = operationOrThrow(adminPlatformAnalyticsQueryDocument);
    for (const row of SELECTION_TABLE) {
      const objectChildNames = new Set((row.objectChildPaths ?? []).map(path => path.split(".").pop() ?? ""));
      for (const name of row.fields) {
        if (!objectChildNames.has(name)) {
          expect(subField(selectionPath(operation, row.path), name)?.selectionSet).toBeUndefined();
        }
      }
    }
  });

  test("the object-selection set is exactly the eleven documented nodes (closed composition)", () => {
    const operation = operationOrThrow(adminPlatformAnalyticsQueryDocument);
    const objectPaths = collectObjectPaths(operation, "");
    expect(objectPaths.toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...OBJECT_PATHS].toSorted((a, b) => a.localeCompare(b))
    );
  });

  test("NO id is selected anywhere in the subtree (aggregate anonymity)", () => {
    const operation = operationOrThrow(adminPlatformAnalyticsQueryDocument);
    const allPaths = collectFieldPaths(operation, "");
    for (const path of allPaths) {
      expect(path.split(".").pop()).not.toBe("id");
    }
  });
});

describe("platform analytics document — codegen binding + barrel parity", () => {
  test("admin sub-barrel and top-level barrel re-export the SAME document instance (cache-key safety)", () => {
    expect(adminPlatformAnalyticsViaAdminBarrel).toBe(adminPlatformAnalyticsQueryDocument);
    expect(adminPlatformAnalyticsViaTopBarrel).toBe(adminPlatformAnalyticsQueryDocument);
  });

  test("document remains TypedDocumentNode-typed against the generated operation type", () => {
    // Compile-time proof by assignment — tsgo fails if the exported constant
    // loses its codegen typing or picks up an inline type literal.
    const typed: TypedDocumentNode<AdminPlatformAnalyticsQuery> = adminPlatformAnalyticsQueryDocument;

    // Runtime use keeps the binding from being flagged as unused.
    expect(typed.loc).toBeDefined();
  });
});
