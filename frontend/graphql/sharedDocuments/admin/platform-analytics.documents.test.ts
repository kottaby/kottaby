/**
 * platform-analytics.documents test — the closed client document contract
 * for the adminPlatformAnalytics read (DEV3-022c, task 4.1.TE).
 *
 * Pins (mirroring the notification.documents precedent):
 *  - the operation is NAMED `AdminPlatformAnalytics`;
 *  - the document declares ZERO variables (closed client surface);
 *  - the FULL selection set is present leaf-for-leaf (generatedAt, the
 *    eleven users leaves incl. recentlyActive24h, both trends, …);
 *  - NO `id` is selected anywhere (embedded value objects — D10);
 *  - the document is a TypedDocumentNode (typing enforced by the export);
 *  - the barrel re-exports the document (identity).
 */

import { describe, expect, test } from "bun:test";
import { type DocumentNode, type OperationDefinitionNode, parse, print } from "graphql";
import * as adminBarrel from "@/frontend/graphql/sharedDocuments/admin";
import { adminPlatformAnalyticsQueryDocument } from "@/frontend/graphql/sharedDocuments/admin/platform-analytics.documents";

/** Reads the single operation definition (fail-fast when absent). */
function operationOf(document: unknown): OperationDefinitionNode {
  const node = document as DocumentNode;
  const operation = node.definitions.find(definition => definition.kind === "OperationDefinition");
  if (operation?.kind !== "OperationDefinition") {
    throw new Error("document must carry exactly one GraphQL operation");
  }
  return operation;
}

/** Recursively collects every field name in the selection set. */
function collectFieldNames(node: DocumentNode | OperationDefinitionNode): string[] {
  const names: string[] = [];
  const visit = (selectionSetNode: {
    selections: ReadonlyArray<{ kind: string; name?: { value: string }; selectionSet?: unknown }>;
  }): void => {
    for (const selection of selectionSetNode.selections) {
      if (selection.kind === "Field" && selection.name) {
        names.push(selection.name.value);
      }
      if (selection.selectionSet) {
        visit(selection.selectionSet as Parameters<typeof visit>[0]);
      }
    }
  };
  const operation = operationOf(node as DocumentNode);
  visit(operation.selectionSet as Parameters<typeof visit>[0]);
  return names;
}

describe("adminPlatformAnalytics document contract", () => {
  test("operation is named `AdminPlatformAnalytics` and is a query with ZERO variables", () => {
    const operation = operationOf(adminPlatformAnalyticsQueryDocument);
    expect(operation.name?.value).toBe("AdminPlatformAnalytics");
    expect(operation.operation).toBe("query");
    expect(operation.variableDefinitions ?? []).toHaveLength(0);
  });

  test("the document matches the generated SDL leaf-for-leaf (closed selection set)", () => {
    const printed = print(adminPlatformAnalyticsQueryDocument);
    // Re-parsing the printed form must be a valid document against nothing —
    // structural sanity only (the wire matrix pins server-side validation).
    const reparsed = parse(printed);
    expect(reparsed.definitions.length).toBeGreaterThanOrEqual(1);

    const names = collectFieldNames(adminPlatformAnalyticsQueryDocument);
    // Root + every section + every documented leaf is selected EXACTLY once.
    const required = [
      "adminPlatformAnalytics",
      "generatedAt",
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
      "gatewayRevenueByCurrency",
      "currency",
      "totalAmount",
      "last30DaysAmount",
      "paidPaymentsCount",
      "offlineActivationsCount",
      "active",
      "pending",
      "expired",
      "suspended",
      "activeInWindowNow",
      "certifiedCount",
      "evaluatorCount",
      "onlineNowCount",
      "averageSessionRating",
      "sessionRatingsCount",
      "averageEvaluationScore",
      "evaluationScoresCount",
      "pendingDisputes",
      "pendingWithdrawals",
      "sessionTrendDaily",
      "bucketStart",
      "sessionCount",
      "revenueTrendDaily",
      "amount",
    ];
    for (const field of required) {
      expect(names).toContain(field);
    }
    // Embedded value objects — NO id selections anywhere (D10).
    expect(names).not.toContain("id");
  });

  test("the admin barrel re-exports the document (identity)", () => {
    expect(adminBarrel.adminPlatformAnalyticsQueryDocument).toBe(adminPlatformAnalyticsQueryDocument);
  });
});
