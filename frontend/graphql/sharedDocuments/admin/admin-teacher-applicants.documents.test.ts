/**
 * Structural lock over the admin-teacher-applicant shared GraphQL document.
 *
 * Mirrors the `admin-teachers.documents.test.ts` discipline for the
 * read-only applicant queue: the applicants tab depends on this SHARED
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
 *   4. `id` field requirement — the `AdminApplicantListItemFields` fragment
 *      selects `id` FIRST so Apollo normalizes the cache entries.
 *   5. Fragment reuse — the queue rows spread the EXISTING
 *      `AdminApplicantListItemFields` fragment (no bespoke inline selection).
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
import type {
  AdminTeacherApplicantsExportQuery,
  AdminTeacherApplicantsQuery,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminTeacherApplicantsExportQueryDocument as applicantsExportViaBarrel,
  adminTeacherApplicantsQueryDocument as applicantsViaBarrel,
} from "@/frontend/graphql/sharedDocuments";
import {
  adminTeacherApplicantsExportQueryDocument,
  adminTeacherApplicantsQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin/admin-teacher-applicants.documents";

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

/** Resolves a dotted selection path ("adminTeacherApplicants.items") or throws. */
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

const ADMIN_APPLICANT_ITEM_FIELDS = [
  "id",
  "name",
  "email",
  "phone",
  "country",
  "status",
  "verificationAttempts",
  "lastAttemptAt",
  "cooldownUntil",
  "isDeleted",
  "suspended",
  "isBlocked",
  "createdAt",
] as const;

// ---------------------------------------------------------------------------
// Contract tests

describe("admin-teacher-applicant document — named operation + channel + variables", () => {
  test("AdminTeacherApplicants is a single named query with the sanctioned variable set", () => {
    const operation = operationOrThrow(adminTeacherApplicantsQueryDocument);
    expect(operation.name?.value).toBe("AdminTeacherApplicants");
    expect(operation.name?.value ?? "").not.toBe("");
    expect(operation.operation).toBe("query");
    // `page`/`pageSize` are ALWAYS provided by the queue hook — non-null.
    expect(variableNames(operation)).toEqual(["filters", "page", "pageSize"]);
  });

  test("every declared variable is wired into the root-field argument (no dead variables, no literal arguments)", () => {
    const operation = operationOrThrow(adminTeacherApplicantsQueryDocument);
    const root = selectionPath(operation, "adminTeacherApplicants");
    expect(argumentVariableNames(root)).toEqual(["filters", "page", "pageSize"]);
  });

  test("variable surface carries zero caller-identity arguments (actor derived server-side)", () => {
    const operation = operationOrThrow(adminTeacherApplicantsQueryDocument);
    for (const name of variableNames(operation)) {
      expect(name.toLowerCase()).not.toContain("actor");
      expect(name.toLowerCase()).not.toContain("userid");
    }
  });
});

describe("admin-teacher-applicant document — id + fragment-reuse shapes", () => {
  test("AdminApplicantListItemFields fragment selects id FIRST (queue row normalization)", () => {
    const fragment = fragmentDefinition(adminTeacherApplicantsQueryDocument, "AdminApplicantListItemFields");
    expect(fieldNames(fragment)[0]).toBe("id");
    // The full sanctioned item field set is pinned source-order — field drift
    // (added or dropped columns) fails here instead of silently starving the
    // applicants table.
    expect(fieldNames(fragment)).toEqual([...ADMIN_APPLICANT_ITEM_FIELDS]);
  });

  test("queue rows spread the EXISTING AdminApplicantListItemFields fragment (no bespoke inline selection)", () => {
    const operation = operationOrThrow(adminTeacherApplicantsQueryDocument);
    const selection = selectionPath(operation, "adminTeacherApplicants.items");
    expect(fragmentSpreads(selection)).toContain("AdminApplicantListItemFields");
  });

  test("the page envelope selects the honest total + server-computed pageCount + the statusCounts aggregate", () => {
    const operation = operationOrThrow(adminTeacherApplicantsQueryDocument);
    const page = selectionPath(operation, "adminTeacherApplicants");
    expect(fieldNames(page)).toEqual(["items", "total", "page", "pageSize", "pageCount", "statusCounts"]);
    // The aggregate's sub-selection is pinned to the canonical four slots —
    // source-order drift or a smuggled extra field fails here.
    const statusCounts = selectionPath(operation, "adminTeacherApplicants.statusCounts");
    expect(fieldNames(statusCounts)).toEqual(["pending", "inEvaluation", "failed", "passed"]);
  });
});

describe("admin-teacher-applicant document — codegen binding + barrel parity", () => {
  test("top-level barrel re-exports the SAME document instance (cache-key safety)", () => {
    expect(applicantsViaBarrel).toBe(adminTeacherApplicantsQueryDocument);
  });

  test("document remains TypedDocumentNode-typed against the generated operation type", () => {
    // Compile-time proof by assignment — tsgo fails if the exported constant
    // loses its codegen typing or picks up an inline type literal.
    const typedApplicants: TypedDocumentNode<AdminTeacherApplicantsQuery> = adminTeacherApplicantsQueryDocument;
    expect(typedApplicants.loc).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Export-all contract — the server-side CSV source (R5)

describe("admin-teacher-applicant EXPORT document — named operation + pagination-free variables", () => {
  test("AdminTeacherApplicantsExport is a single named query whose ONLY variable is filters", () => {
    const operation = operationOrThrow(adminTeacherApplicantsExportQueryDocument);
    expect(operation.name?.value).toBe("AdminTeacherApplicantsExport");
    expect(operation.operation).toBe("query");
    // NO page/pageSize — the export is bounded server-side (EXPORT_MAX_ROWS).
    expect(variableNames(operation)).toEqual(["filters"]);
  });

  test("every declared variable is wired into the root-field argument (no dead variables, no literal arguments)", () => {
    const operation = operationOrThrow(adminTeacherApplicantsExportQueryDocument);
    const root = selectionPath(operation, "adminTeacherApplicantsExport");
    expect(argumentVariableNames(root)).toEqual(["filters"]);
  });

  test("variable surface carries zero caller-identity arguments (actor derived server-side)", () => {
    const operation = operationOrThrow(adminTeacherApplicantsExportQueryDocument);
    for (const name of variableNames(operation)) {
      expect(name.toLowerCase()).not.toContain("actor");
      expect(name.toLowerCase()).not.toContain("userid");
    }
  });
});

describe("admin-teacher-applicant EXPORT document — fragment reuse + envelope shapes", () => {
  test("export rows spread the EXISTING AdminApplicantListItemFields fragment (same row shape as the queue)", () => {
    const operation = operationOrThrow(adminTeacherApplicantsExportQueryDocument);
    const rows = selectionPath(operation, "adminTeacherApplicantsExport.rows");
    expect(fragmentSpreads(rows)).toContain("AdminApplicantListItemFields");
  });

  test("the export envelope selects the honest total + truncated cap flag (statusCounts is NOT exported)", () => {
    const operation = operationOrThrow(adminTeacherApplicantsExportQueryDocument);
    const envelope = selectionPath(operation, "adminTeacherApplicantsExport");
    expect(fieldNames(envelope)).toEqual(["rows", "total", "truncated"]);
  });
});

describe("admin-teacher-applicant EXPORT document — codegen binding + barrel parity", () => {
  test("top-level barrel re-exports the SAME export document instance (cache-key safety)", () => {
    expect(applicantsExportViaBarrel).toBe(adminTeacherApplicantsExportQueryDocument);
  });

  test("export document remains TypedDocumentNode-typed against the generated operation type", () => {
    // Compile-time proof by assignment — tsgo fails if the exported constant
    // loses its codegen typing or picks up an inline type literal.
    const typedExport: TypedDocumentNode<AdminTeacherApplicantsExportQuery> = adminTeacherApplicantsExportQueryDocument;
    expect(typedExport.loc).toBeDefined();
  });
});
