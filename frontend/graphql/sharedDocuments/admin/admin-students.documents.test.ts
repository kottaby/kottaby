/**
 * Structural lock over the admin-student shared GraphQL document.
 *
 * Mirrors the `admin-users.documents.test.ts` discipline for the read-only
 * admin student directory: the directory view depends on this SHARED
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
 *   4. `id` field requirement — the `AdminStudentListItemFields` fragment
 *      selects `id` FIRST so Apollo normalizes the cache entries.
 *   5. Fragment reuse — the directory rows spread the EXISTING
 *      `AdminStudentListItemFields` fragment (no bespoke inline selection).
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
import type { AdminStudentsExportQuery, AdminStudentsQuery } from "@/frontend/graphql/generated/gql/graphql";
import {
  adminStudentsExportQueryDocument as adminStudentsExportViaBarrel,
  adminStudentsQueryDocument as adminStudentsViaBarrel,
} from "@/frontend/graphql/sharedDocuments";
import {
  adminStudentsExportQueryDocument,
  adminStudentsQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin/admin-students.documents";
import {
  argumentVariableNames,
  fieldNames,
  fragmentDefinition,
  fragmentSpreads,
  operationOrThrow,
  selectionPath,
  variableNames,
} from "@/frontend/graphql/sharedDocuments/document-test-kit";

// ---------------------------------------------------------------------------
// Contract

const ADMIN_STUDENT_ITEM_FIELDS = [
  "id",
  "name",
  "email",
  "phone",
  "country",
  "balanceHifz",
  "balanceReviews",
  "balanceTajweed",
  "balanceTrial",
  "trialGrantedAt",
  "primaryLanguage",
  "anotherLanguage",
  "hasParent",
  "parentName",
  "parentEmail",
  "createdAt",
] as const;

// ---------------------------------------------------------------------------
// Contract tests

describe("admin-student document — named operation + channel + variables", () => {
  test("AdminStudents is a single named query with the sanctioned variable set", () => {
    const operation = operationOrThrow(adminStudentsQueryDocument);
    expect(operation.name?.value).toBe("AdminStudents");
    expect(operation.name?.value ?? "").not.toBe("");
    expect(operation.operation).toBe("query");
    // `page`/`pageSize` are ALWAYS provided by the directory hook — non-null.
    expect(variableNames(operation)).toEqual(["filters", "page", "pageSize"]);
  });

  test("every declared variable is wired into the root-field argument (no dead variables, no literal arguments)", () => {
    const operation = operationOrThrow(adminStudentsQueryDocument);
    const root = selectionPath(operation, "adminStudents");
    expect(argumentVariableNames(root)).toEqual(["filters", "page", "pageSize"]);
  });

  test("variable surface carries zero caller-identity arguments (actor derived server-side)", () => {
    const operation = operationOrThrow(adminStudentsQueryDocument);
    for (const name of variableNames(operation)) {
      expect(name.toLowerCase()).not.toContain("actor");
      expect(name.toLowerCase()).not.toContain("userid");
    }
  });
});

describe("admin-student document — id + fragment-reuse shapes", () => {
  test("AdminStudentListItemFields fragment selects id FIRST (directory row normalization)", () => {
    const fragment = fragmentDefinition(adminStudentsQueryDocument, "AdminStudentListItemFields");
    expect(fieldNames(fragment)[0]).toBe("id");
    // The full sanctioned item field set is pinned source-order — field drift
    // (added or dropped columns) fails here instead of silently starving the
    // directory table.
    expect(fieldNames(fragment)).toEqual([...ADMIN_STUDENT_ITEM_FIELDS]);
  });

  test("directory rows spread the EXISTING AdminStudentListItemFields fragment (no bespoke inline selection)", () => {
    const operation = operationOrThrow(adminStudentsQueryDocument);
    const selection = selectionPath(operation, "adminStudents.items");
    expect(fragmentSpreads(selection)).toContain("AdminStudentListItemFields");
  });

  test("the page envelope selects the honest total + server-computed pageCount", () => {
    const operation = operationOrThrow(adminStudentsQueryDocument);
    const page = selectionPath(operation, "adminStudents");
    expect(fieldNames(page)).toEqual(["items", "total", "page", "pageSize", "pageCount"]);
  });
});

describe("admin-student document — codegen binding + barrel parity", () => {
  test("top-level barrel re-exports the SAME document instance (cache-key safety)", () => {
    expect(adminStudentsViaBarrel).toBe(adminStudentsQueryDocument);
  });

  test("document remains TypedDocumentNode-typed against the generated operation type", () => {
    // Compile-time proof by assignment — tsgo fails if the exported constant
    // loses its codegen typing or picks up an inline type literal.
    const typedAdminStudents: TypedDocumentNode<AdminStudentsQuery> = adminStudentsQueryDocument;
    expect(typedAdminStudents.loc).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Export-all contract — the server-side CSV source (R5)

describe("admin-student EXPORT document — named operation + pagination-free variables", () => {
  test("AdminStudentsExport is a single named query whose ONLY variable is filters", () => {
    const operation = operationOrThrow(adminStudentsExportQueryDocument);
    expect(operation.name?.value).toBe("AdminStudentsExport");
    expect(operation.operation).toBe("query");
    // NO page/pageSize — the export is bounded server-side (EXPORT_MAX_ROWS).
    expect(variableNames(operation)).toEqual(["filters"]);
  });

  test("every declared variable is wired into the root-field argument (no dead variables, no literal arguments)", () => {
    const operation = operationOrThrow(adminStudentsExportQueryDocument);
    const root = selectionPath(operation, "adminStudentsExport");
    expect(argumentVariableNames(root)).toEqual(["filters"]);
  });

  test("variable surface carries zero caller-identity arguments (actor derived server-side)", () => {
    const operation = operationOrThrow(adminStudentsExportQueryDocument);
    for (const name of variableNames(operation)) {
      expect(name.toLowerCase()).not.toContain("actor");
      expect(name.toLowerCase()).not.toContain("userid");
    }
  });
});

describe("admin-student EXPORT document — fragment reuse + envelope shapes", () => {
  test("export rows spread the EXISTING AdminStudentListItemFields fragment (same row shape as the listing)", () => {
    const operation = operationOrThrow(adminStudentsExportQueryDocument);
    const rows = selectionPath(operation, "adminStudentsExport.rows");
    expect(fragmentSpreads(rows)).toContain("AdminStudentListItemFields");
  });

  test("the export envelope selects the honest total + truncated cap flag (no pagination fields)", () => {
    const operation = operationOrThrow(adminStudentsExportQueryDocument);
    const envelope = selectionPath(operation, "adminStudentsExport");
    expect(fieldNames(envelope)).toEqual(["rows", "total", "truncated"]);
  });
});

describe("admin-student EXPORT document — codegen binding + barrel parity", () => {
  test("top-level barrel re-exports the SAME export document instance (cache-key safety)", () => {
    expect(adminStudentsExportViaBarrel).toBe(adminStudentsExportQueryDocument);
  });

  test("export document remains TypedDocumentNode-typed against the generated operation type", () => {
    // Compile-time proof by assignment — tsgo fails if the exported constant
    // loses its codegen typing or picks up an inline type literal.
    const typedExport: TypedDocumentNode<AdminStudentsExportQuery> = adminStudentsExportQueryDocument;
    expect(typedExport.loc).toBeDefined();
  });
});
