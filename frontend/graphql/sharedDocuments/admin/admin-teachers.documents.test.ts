/**
 * Structural lock over the admin-teacher shared GraphQL document.
 *
 * Mirrors the `admin-users.documents.test.ts` discipline for the read-only
 * admin teacher directory: the directory view depends on this SHARED
 * `TypedDocumentNode` document, so drift fails at this pure logic tier
 * instead of surfacing as a confusing wire mismatch later:
 *
 *   1. NAMED operation — a single named query whose GraphQL operation name
 *      matches the `{entityName}…Document` export convention, with the exact
 *      sanctioned variable set.
 *   2. Argument wiring — each declared variable is actually threaded into
 *      the root-field argument (no dead variables, no literal arguments).
 *   3. Self-scoped surface — the pinned variable set is the WHOLE variable
 *      surface; no caller-identity argument exists (the actor is always
 *      derived server-side from the authenticated caller — read-only
 *      surface, zero mutations).
 *   4. `id` field requirement — the `AdminTeacherListItemFields` fragment
 *      selects `id` FIRST so Apollo normalizes the cache entries.
 *   5. Fragment reuse — the directory rows spread the EXISTING
 *      `AdminTeacherListItemFields` fragment (no bespoke inline selection).
 *   6. Codegen binding + barrel parity — the constant stays
 *      `TypedDocumentNode`-typed against the generated operation type
 *      (compile-time proof by assignment), and the top-level barrel
 *      re-exports the SAME document instance.
 *
 * Zero server boot, zero DB, zero network: inspects only already-compiled
 * ASTs through graphql kind-guard narrowing — no unsafe assertions anywhere
 * (oxlint `no-unsafe-type-assertion`). NO useLazyQuery exists anywhere in
 * the documents layer; consumers import hooks from "@apollo/client/react".
 */

import { describe, expect, test } from "bun:test";
import type { TypedDocumentNode } from "@apollo/client";
import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  OperationDefinitionNode,
} from "graphql";
import type { AdminTeachersExportQuery, AdminTeachersQuery } from "@/frontend/graphql/generated/gql/graphql";
import {
  adminTeachersExportQueryDocument as adminTeachersExportViaBarrel,
  adminTeachersQueryDocument as adminTeachersViaBarrel,
} from "@/frontend/graphql/sharedDocuments";
import {
  adminTeachersExportQueryDocument,
  adminTeachersQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin/admin-teachers.documents";

// ---------------------------------------------------------------------------
// Assertion-free AST helpers

/** Any node carrying a `selectionSet` that the helpers below walk. */
type SelectionSetNode = OperationDefinitionNode | FieldNode | FragmentDefinitionNode;

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

function fragmentDefinition(document: DocumentNode, name: string): FragmentDefinitionNode {
  const fragment = document.definitions.find(
    (definition): definition is FragmentDefinitionNode =>
      definition.kind === "FragmentDefinition" && definition.name.value === name
  );
  if (fragment === undefined) {
    throw new Error(`expected FragmentDefinition "${name}" to exist`);
  }
  return fragment;
}

function subFields(parent: SelectionSetNode): FieldNode[] {
  const selectionSet = parent.selectionSet;
  if (!selectionSet) {
    return [];
  }
  return selectionSet.selections.filter((selection): selection is FieldNode => selection.kind === "Field");
}

function subField(parent: SelectionSetNode, name: string): FieldNode | undefined {
  return subFields(parent).find(field => field.name.value === name);
}

/** Resolves a dotted selection path ("adminTeachers.items") or throws. */
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

function fieldNames(parent: SelectionSetNode): string[] {
  return subFields(parent).map(field => field.name.value);
}

/** Fragment spreads referenced on a selection set, by name. */
function fragmentSpreads(parent: OperationDefinitionNode | FieldNode): string[] {
  const selectionSet = parent.selectionSet;
  if (!selectionSet) {
    return [];
  }
  return selectionSet.selections
    .filter((selection): selection is FragmentSpreadNode => selection.kind === "FragmentSpread")
    .map(selection => selection.name.value);
}

function variableNames(operation: OperationDefinitionNode): string[] {
  return (operation.variableDefinitions ?? []).map(definition => definition.variable.name.value);
}

/** Variable names threaded as root-field arguments (`$x` → `x`), source order. */
function argumentVariableNames(field: FieldNode): string[] {
  return (field.arguments ?? []).flatMap(argument =>
    argument.value.kind === "Variable" ? [argument.value.name.value] : []
  );
}

// ---------------------------------------------------------------------------
// Contract

const ADMIN_TEACHER_ITEM_FIELDS = [
  "id",
  "name",
  "email",
  "phone",
  "country",
  "isApproved",
  "isEvaluator",
  "averageRating",
  "isOnline",
  "subjects",
  "isDeleted",
  "suspended",
  "isBlocked",
  "createdAt",
] as const;

// ---------------------------------------------------------------------------
// Contract tests

describe("admin-teacher document — named operation + channel + variables", () => {
  test("AdminTeachers is a single named query with the sanctioned variable set", () => {
    const operation = operationOrThrow(adminTeachersQueryDocument);
    expect(operation.name?.value).toBe("AdminTeachers");
    expect(operation.name?.value ?? "").not.toBe("");
    expect(operation.operation).toBe("query");
    // `page`/`pageSize` are ALWAYS provided by the directory hook — non-null.
    expect(variableNames(operation)).toEqual(["filters", "page", "pageSize"]);
  });

  test("every declared variable is wired into the root-field argument (no dead variables, no literal arguments)", () => {
    const operation = operationOrThrow(adminTeachersQueryDocument);
    const root = selectionPath(operation, "adminTeachers");
    expect(argumentVariableNames(root)).toEqual(["filters", "page", "pageSize"]);
  });

  test("variable surface carries zero caller-identity arguments (actor derived server-side)", () => {
    const operation = operationOrThrow(adminTeachersQueryDocument);
    for (const name of variableNames(operation)) {
      expect(name.toLowerCase()).not.toContain("actor");
      expect(name.toLowerCase()).not.toContain("userid");
    }
  });
});

describe("admin-teacher document — id + fragment-reuse shapes", () => {
  test("AdminTeacherListItemFields fragment selects id FIRST (directory row normalization)", () => {
    const fragment = fragmentDefinition(adminTeachersQueryDocument, "AdminTeacherListItemFields");
    expect(fieldNames(fragment)[0]).toBe("id");
    // The full sanctioned item field set is pinned source-order — field drift
    // (added or dropped columns) fails here instead of silently starving the
    // directory table.
    expect(fieldNames(fragment)).toEqual([...ADMIN_TEACHER_ITEM_FIELDS]);
  });

  test("directory rows spread the EXISTING AdminTeacherListItemFields fragment (no bespoke inline selection)", () => {
    const operation = operationOrThrow(adminTeachersQueryDocument);
    const selection = selectionPath(operation, "adminTeachers.items");
    expect(fragmentSpreads(selection)).toContain("AdminTeacherListItemFields");
  });

  test("the page envelope selects the honest total + server-computed pageCount", () => {
    const operation = operationOrThrow(adminTeachersQueryDocument);
    const page = selectionPath(operation, "adminTeachers");
    expect(fieldNames(page)).toEqual(["items", "total", "page", "pageSize", "pageCount"]);
  });
});

describe("admin-teacher document — codegen binding + barrel parity", () => {
  test("top-level barrel re-exports the SAME document instance (cache-key safety)", () => {
    expect(adminTeachersViaBarrel).toBe(adminTeachersQueryDocument);
  });

  test("document remains TypedDocumentNode-typed against the generated operation type", () => {
    // Compile-time proof by assignment — tsgo fails if the exported constant
    // loses its codegen typing or picks up an inline type literal.
    const typedAdminTeachers: TypedDocumentNode<AdminTeachersQuery> = adminTeachersQueryDocument;
    expect(typedAdminTeachers.loc).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Export-all contract — the server-side CSV source (R5)

describe("admin-teacher EXPORT document — named operation + pagination-free variables", () => {
  test("AdminTeachersExport is a single named query whose ONLY variable is filters", () => {
    const operation = operationOrThrow(adminTeachersExportQueryDocument);
    expect(operation.name?.value).toBe("AdminTeachersExport");
    expect(operation.operation).toBe("query");
    // NO page/pageSize — the export is bounded server-side (EXPORT_MAX_ROWS).
    expect(variableNames(operation)).toEqual(["filters"]);
  });

  test("every declared variable is wired into the root-field argument (no dead variables, no literal arguments)", () => {
    const operation = operationOrThrow(adminTeachersExportQueryDocument);
    const root = selectionPath(operation, "adminTeachersExport");
    expect(argumentVariableNames(root)).toEqual(["filters"]);
  });

  test("variable surface carries zero caller-identity arguments (actor derived server-side)", () => {
    const operation = operationOrThrow(adminTeachersExportQueryDocument);
    for (const name of variableNames(operation)) {
      expect(name.toLowerCase()).not.toContain("actor");
      expect(name.toLowerCase()).not.toContain("userid");
    }
  });
});

describe("admin-teacher EXPORT document — fragment reuse + envelope shapes", () => {
  test("export rows spread the EXISTING AdminTeacherListItemFields fragment (same row shape as the listing)", () => {
    const operation = operationOrThrow(adminTeachersExportQueryDocument);
    const rows = selectionPath(operation, "adminTeachersExport.rows");
    expect(fragmentSpreads(rows)).toContain("AdminTeacherListItemFields");
  });

  test("the export envelope selects the honest total + truncated cap flag (no pagination fields)", () => {
    const operation = operationOrThrow(adminTeachersExportQueryDocument);
    const envelope = selectionPath(operation, "adminTeachersExport");
    expect(fieldNames(envelope)).toEqual(["rows", "total", "truncated"]);
  });
});

describe("admin-teacher EXPORT document — codegen binding + barrel parity", () => {
  test("top-level barrel re-exports the SAME export document instance (cache-key safety)", () => {
    expect(adminTeachersExportViaBarrel).toBe(adminTeachersExportQueryDocument);
  });

  test("export document remains TypedDocumentNode-typed against the generated operation type", () => {
    // Compile-time proof by assignment — tsgo fails if the exported constant
    // loses its codegen typing or picks up an inline type literal.
    const typedExport: TypedDocumentNode<AdminTeachersExportQuery> = adminTeachersExportQueryDocument;
    expect(typedExport.loc).toBeDefined();
  });
});
