/**
 * platform-analytics.documents test — the closed client document contract
 * for the adminPlatformAnalytics read (DEV3-022c, task 4.1.TE).
 *
 * Pins (mirroring the notification.documents precedent):
 *  - the operation is NAMED `AdminPlatformAnalytics`;
 *  - the document declares ZERO variables (closed client surface);
 *  - the FULL selection set is present as a per-selection-path TREE
 *    assertion (Fix-C finding 7): parent path → SORTED leaf set, deep
 *    equality on paths AND leaves — an extra, missing, duplicated, or
 *    misnested leaf anywhere fails the contract;
 *  - NO `id` is selected anywhere (embedded value objects — D10);
 *  - the document is a TypedDocumentNode over BOTH the generated query AND
 *    variables types (Fix-C finding 8 — typing enforced by the export);
 *  - the barrel re-exports the document (identity).
 */

import { describe, expect, test } from "bun:test";
import { type DocumentNode, type OperationDefinitionNode, parse, print, type SelectionSetNode } from "graphql";
import * as adminBarrel from "@/frontend/graphql/sharedDocuments/admin";
import { adminPlatformAnalyticsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin/platform-analytics.documents";

/** Reads the single operation definition (fails via assertion otherwise). */
function operationOf(document: DocumentNode): OperationDefinitionNode {
  const operation = document.definitions.find(definition => definition.kind === "OperationDefinition");
  if (operation?.kind !== "OperationDefinition") {
    expect.unreachable("document must carry exactly one GraphQL operation");
  }
  return operation;
}

/**
 * Walks the operation's selection set into a per-selection-path tree:
 * dotted parent path → SORTED leaf-field names. Branch fields contribute
 * their own child paths; leaf fields land in the parent's sorted set. The
 * graphql AST types narrow through the `kind` discriminant — zero casts.
 */
function selectionTree(document: DocumentNode): Map<string, string[]> {
  const tree = new Map<string, string[]>();
  const visit = (selectionSet: SelectionSetNode, path: string): void => {
    const leaves: string[] = [];
    for (const selection of selectionSet.selections) {
      if (selection.kind !== "Field") {
        continue;
      }
      const childPath = path.length === 0 ? selection.name.value : `${path}.${selection.name.value}`;
      if (selection.selectionSet) {
        visit(selection.selectionSet, childPath);
      } else {
        leaves.push(selection.name.value);
      }
    }
    tree.set(
      path,
      leaves.toSorted((a, b) => a.localeCompare(b))
    );
  };
  visit(operationOf(document).selectionSet, "");
  return tree;
}

/** The closed selection contract, path by path (sorted leaf sets). */
const CLOSED_SELECTION_TREE = new Map<string, string[]>([
  ["", []],
  ["adminPlatformAnalytics", ["generatedAt"]],
  [
    "adminPlatformAnalytics.users",
    [
      "activeCount",
      "adminsCount",
      "blockedCount",
      "deletedCount",
      "newThisWeekCount",
      "parentsCount",
      "recentlyActive24h",
      "studentsCount",
      "suspendedCount",
      "teachersCount",
      "totalCount",
    ],
  ],
  [
    "adminPlatformAnalytics.sessions",
    [
      "awaitingConfirmation",
      "cancelled",
      "completed",
      "disputed",
      "scheduled",
      "started",
      "thisMonth",
      "thisWeek",
      "today",
      "total",
    ],
  ],
  ["adminPlatformAnalytics.revenue", ["offlineActivationsCount"]],
  [
    "adminPlatformAnalytics.revenue.gatewayRevenueByCurrency",
    ["currency", "last30DaysAmount", "paidPaymentsCount", "totalAmount"],
  ],
  [
    "adminPlatformAnalytics.subscriptions",
    ["active", "activeInWindowNow", "cancelled", "expired", "pending", "suspended", "total"],
  ],
  ["adminPlatformAnalytics.teachers", ["certifiedCount", "evaluatorCount", "onlineNowCount"]],
  [
    "adminPlatformAnalytics.ratings",
    ["averageEvaluationScore", "averageSessionRating", "evaluationScoresCount", "sessionRatingsCount"],
  ],
  ["adminPlatformAnalytics.health", ["pendingDisputes", "pendingWithdrawals"]],
  ["adminPlatformAnalytics.sessionTrendDaily", ["bucketStart", "sessionCount"]],
  ["adminPlatformAnalytics.revenueTrendDaily", ["amount", "bucketStart", "currency"]],
]);

describe("adminPlatformAnalytics document contract", () => {
  test("operation is named `AdminPlatformAnalytics` and is a query with ZERO variables", () => {
    const operation = operationOf(adminPlatformAnalyticsQueryDocument);
    expect(operation.name?.value).toBe("AdminPlatformAnalytics");
    expect(operation.operation).toBe("query");
    expect(operation.variableDefinitions ?? []).toHaveLength(0);
  });

  test("the document matches the closed selection TREE path-for-path (no extra/missing/duplicated/misnested leaf)", () => {
    // Structural sanity only — re-parsing the printed form must be a valid
    // document (the wire matrix pins server-side validation).
    const printed = print(adminPlatformAnalyticsQueryDocument);
    const reparsed = parse(printed);
    expect(reparsed.definitions.length).toBeGreaterThanOrEqual(1);

    // Deep equality over paths AND sorted leaf sets: an added leaf, a
    // removed leaf, a duplicated selection, or a leaf moved under the
    // wrong parent all break the exact map match.
    const tree = selectionTree(adminPlatformAnalyticsQueryDocument);
    expect([...tree.keys()].toSorted()).toEqual([...CLOSED_SELECTION_TREE.keys()].toSorted());
    for (const [path, leaves] of CLOSED_SELECTION_TREE) {
      expect(tree.get(path)).toEqual(leaves);
    }
    // Embedded value objects — NO id selections anywhere (D10).
    for (const leaves of tree.values()) {
      expect(leaves).not.toContain("id");
    }
  });

  test("the admin barrel re-exports the document (identity)", () => {
    expect(adminBarrel.adminPlatformAnalyticsQueryDocument).toBe(adminPlatformAnalyticsQueryDocument);
  });
});
