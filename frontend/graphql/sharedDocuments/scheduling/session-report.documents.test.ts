/**
 * Structural lock over the DEV3-006 session report/homework shared GraphQL
 * documents.
 *
 * Mirrors the `sharedDocuments/documents.contract.test.ts` + notifications
 * discipline for the report/homework domain: the DEV2-014 submit form and
 * the report/homework readers (deferred — no UI ships in DEV3-006) consume
 * these SHARED `TypedDocumentNode` documents, so drift fails at this pure
 * logic tier instead of surfacing as confusing wire mismatches later:
 *
 *   1. NAMED operations — every report document is a single named operation
 *      whose GraphQL operation name matches its `{entityName}…Document`
 *      export convention, on the right channel (query vs mutation), with
 *      the exact sanctioned variable set.
 *   2. Argument wiring — each declared variable is actually threaded into
 *      its root-field argument (no dead variables, no literal arguments
 *      that would bypass the variable contract).
 *   3. CLOSED selection contract (plan §3.1/§5) — every operation selects
 *      exactly its one root field; the `SessionReport` payload selects the
 *      EXACT 6-field row and `SessionHomeWork` the EXACT 12-field row with
 *      `id` FIRST on every object selection (Apollo normalization) — so no
 *      field outside the server contract is ever requested (no quiet
 *      over-fetch).
 *   4. Enum legs are leaves — the homework `SurahJuzRef` legs select as
 *      codegen enum members (plain enum leaves, no sub-selection);
 *      `createdAt`/`updatedAt` ride the registered `DateTime` scalar
 *      (codegen `string`); the nullable homework legs ride as-is.
 *   5. Codegen binding + barrel parity — the constants stay
 *      `TypedDocumentNode`-typed against the generated operation types
 *      (compile-time proof by assignment), and the root barrel, the
 *      scheduling barrel, the `session.documents` hub and the deep import
 *      all resolve to the SAME document instances (consumer import
 *      conventions table).
 *
 * Zero server boot, zero DB, zero network: inspects only already-compiled
 * ASTs through graphql kind-guard narrowing — no unsafe assertions anywhere
 * (oxlint `no-unsafe-type-assertion`). NO useLazyQuery exists anywhere in
 * the documents layer; consumers import hooks from "@apollo/client/react".
 */

import { describe, expect, test } from "bun:test";
import type { TypedDocumentNode } from "@apollo/client";
import type { DocumentNode, FieldNode, OperationDefinitionNode } from "graphql";
import type {
  SessionHomeWorkQuery,
  SessionHomeWorkQueryVariables,
  SessionReportQuery,
  SessionReportQueryVariables,
  SubmitSessionReportMutation,
  SubmitSessionReportMutationVariables,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  sessionHomeworkQueryDocument as sessionHomeworkViaRootBarrel,
  sessionReportQueryDocument as sessionReportViaRootBarrel,
  submitSessionReportMutationDocument as submitSessionReportViaRootBarrel,
} from "@/frontend/graphql/sharedDocuments";
import {
  sessionHomeworkQueryDocument as sessionHomeworkViaSchedulingBarrel,
  sessionReportQueryDocument as sessionReportViaSchedulingBarrel,
  submitSessionReportMutationDocument as submitSessionReportViaSchedulingBarrel,
} from "@/frontend/graphql/sharedDocuments/scheduling";
import {
  sessionHomeworkQueryDocument as sessionHomeworkViaHub,
  sessionReportQueryDocument as sessionReportViaHub,
  submitSessionReportMutationDocument as submitSessionReportViaHub,
} from "@/frontend/graphql/sharedDocuments/scheduling/session.documents";
import {
  sessionHomeworkQueryDocument,
  sessionReportQueryDocument,
  submitSessionReportMutationDocument,
} from "@/frontend/graphql/sharedDocuments/scheduling/session-report.documents";

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

/** Resolves a dotted selection path ("sessionHomework") or throws. */
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

/** Variable names threaded as root-field arguments (`$x` → `x`), source order. */
function argumentVariableNames(field: FieldNode): string[] {
  return (field.arguments ?? []).flatMap(argument =>
    argument.value.kind === "Variable" ? [argument.value.name.value] : []
  );
}

// ---------------------------------------------------------------------------
// Contract tables

/** The plan §3.1 `SessionReport` contract — EXACT 6-field row, `id` first. */
const SESSION_REPORT_ROW: readonly string[] = [
  "id",
  "sessionId",
  "teacherNotes",
  "studentRatingByTeacher",
  "createdAt",
  "updatedAt",
];

/** The plan §3.1 `SessionHomeWork` contract — EXACT 12-field row, `id` first. */
const SESSION_HOMEWORK_ROW: readonly string[] = [
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
];

interface SessionReportDocumentRow {
  readonly document: DocumentNode;
  readonly operationName: string;
  readonly channel: "mutation" | "query";
  /** Expected `($var, …)` declarations, in the SAME order the document
   * declares them (wire/source order). */
  readonly variables: readonly string[];
  /** Root field the operation targets. */
  readonly rootField: string;
  /** The EXACT payload row the root field must select (plan §3.1). */
  readonly payloadRow: readonly string[];
}

const SESSION_REPORT_DOCUMENT_TABLE: readonly SessionReportDocumentRow[] = [
  {
    document: submitSessionReportMutationDocument,
    operationName: "SubmitSessionReport",
    channel: "mutation",
    variables: ["id", "input"],
    rootField: "submitSessionReport",
    payloadRow: SESSION_REPORT_ROW,
  },
  {
    document: sessionReportQueryDocument,
    operationName: "SessionReport",
    channel: "query",
    variables: ["sessionId"],
    rootField: "sessionReport",
    payloadRow: SESSION_REPORT_ROW,
  },
  {
    document: sessionHomeworkQueryDocument,
    operationName: "SessionHomeWork",
    channel: "query",
    variables: ["sessionId"],
    rootField: "sessionHomework",
    payloadRow: SESSION_HOMEWORK_ROW,
  },
];

describe("session-report documents — named operations + channel + variables", () => {
  for (const row of SESSION_REPORT_DOCUMENT_TABLE) {
    test(`${row.operationName} is a single named ${row.channel} operation`, () => {
      const operation = operationOrThrow(row.document);
      expect(operation.name?.value).toBe(row.operationName);
      expect(operation.name?.value ?? "").not.toBe("");
      expect(operation.operation).toBe(row.channel);
      expect(variableNames(operation)).toEqual([...row.variables]);
    });
  }

  test("every declared variable is wired into its root-field argument (no dead variables, no literal arguments)", () => {
    for (const row of SESSION_REPORT_DOCUMENT_TABLE) {
      const operation = operationOrThrow(row.document);
      const root = selectionPath(operation, row.rootField);
      expect(argumentVariableNames(root)).toEqual([...row.variables]);
    }
  });

  test("variable surface is exactly the server contract signatures (id+input / sessionId)", () => {
    // The mutation carries the session id + the closed SubmitSessionReportInput
    // (DEV3-006 plan §3.1); both reads carry ONLY the session id — identity is
    // otherwise derived server-side from the authenticated caller.
    expect(variableNames(operationOrThrow(submitSessionReportMutationDocument))).toEqual(["id", "input"]);
    expect(variableNames(operationOrThrow(sessionReportQueryDocument))).toEqual(["sessionId"]);
    expect(variableNames(operationOrThrow(sessionHomeworkQueryDocument))).toEqual(["sessionId"]);
  });
});

describe("session-report documents — closed selection contract (plan §3.1)", () => {
  test("every operation selects exactly its one root field (no sibling surface)", () => {
    for (const row of SESSION_REPORT_DOCUMENT_TABLE) {
      const operation = operationOrThrow(row.document);
      expect(fieldNames(operation)).toEqual([row.rootField]);
    }
  });

  test("every payload selects the EXACT contract row with id FIRST (no over-fetch)", () => {
    for (const row of SESSION_REPORT_DOCUMENT_TABLE) {
      const operation = operationOrThrow(row.document);
      const payload = selectionPath(operation, row.rootField);
      expect(fieldNames(payload)).toEqual([...row.payloadRow]);
      expect(fieldNames(payload)[0]).toBe("id");
    }
  });

  test("homework enum legs are plain SurahJuzRef enum leaves (no sub-selection)", () => {
    const operation = operationOrThrow(sessionHomeworkQueryDocument);
    const payload = selectionPath(operation, "sessionHomework");
    for (const name of ["currentSurahJuz", "revisionSurahJuz"]) {
      const leg = subField(payload, name);
      if (leg === undefined) {
        throw new Error(`expected ${name} selection`);
      }
      // Plain enum leaf: no sub-selection ⇒ nothing to normalize in cache.
      expect(leg.selectionSet).toBeUndefined();
    }
  });

  test("both homework tracks ride as-is in the exact nullable-leg order", () => {
    const operation = operationOrThrow(sessionHomeworkQueryDocument);
    const payload = selectionPath(operation, "sessionHomework");
    // Current track legs then revision track legs, exactly as plan §3.1 pins
    // them (assignment order); grades/enum legs nullable, rides as-is.
    expect(fieldNames(payload).slice(0, 10)).toEqual([
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
    ]);
    expect(fieldNames(payload).slice(10)).toEqual(["createdAt", "updatedAt"]);
  });
});

describe("session-report documents — codegen binding + barrel parity", () => {
  test("documents remain TypedDocumentNode-typed against generated operation types", () => {
    // Compile-time proof by assignment — tsgo fails if any exported constant
    // loses its codegen typing or picks up an inline type literal.
    const typedSubmit: TypedDocumentNode<SubmitSessionReportMutation, SubmitSessionReportMutationVariables> =
      submitSessionReportMutationDocument;
    const typedReport: TypedDocumentNode<SessionReportQuery, SessionReportQueryVariables> = sessionReportQueryDocument;
    const typedHomework: TypedDocumentNode<SessionHomeWorkQuery, SessionHomeWorkQueryVariables> =
      sessionHomeworkQueryDocument;

    // Runtime uses keep the bindings from being flagged as unused.
    expect(typedSubmit.loc).toBeDefined();
    expect(typedReport.loc).toBeDefined();
    expect(typedHomework.loc).toBeDefined();
  });

  test("root barrel + scheduling barrel + hub re-export the SAME document instances (cache-key safety)", () => {
    expect(submitSessionReportViaRootBarrel).toBe(submitSessionReportMutationDocument);
    expect(sessionReportViaRootBarrel).toBe(sessionReportQueryDocument);
    expect(sessionHomeworkViaRootBarrel).toBe(sessionHomeworkQueryDocument);
    expect(submitSessionReportViaSchedulingBarrel).toBe(submitSessionReportMutationDocument);
    expect(sessionReportViaSchedulingBarrel).toBe(sessionReportQueryDocument);
    expect(sessionHomeworkViaSchedulingBarrel).toBe(sessionHomeworkQueryDocument);
    expect(submitSessionReportViaHub).toBe(submitSessionReportMutationDocument);
    expect(sessionReportViaHub).toBe(sessionReportQueryDocument);
    expect(sessionHomeworkViaHub).toBe(sessionHomeworkQueryDocument);
  });
});
