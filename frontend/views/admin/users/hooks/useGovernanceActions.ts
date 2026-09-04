"use client";

/**
 * useGovernanceActions — state + mutation orchestration for the
 * GovernanceActionsSection (suspend / unsuspend / block / unblock).
 *
 * Owns the dialog open-target, the suspend `periodDays` field state, the
 * inline conflict `Alert`, and the two `useMutation` calls against the
 * Phase 4.1 documents. Apollo merges each post-write detail fragment into
 * the SAME `AdminUserDetail:<id>` normalized entity (id-first) — the detail
 * query re-renders WITHOUT a refetch.
 *
 * Conflict routing (REQ-065):
 *  - `FORBIDDEN` → suppressed inline (rides the existing
 *    `GraphQLErrorSurfaceHost` toast path globally);
 *  - `VALIDATION` carrying a `periodDays` field error → field-level
 *    `helperText` projection via `extractFieldErrors`;
 *  - any other code → in-dialog `Alert` carrying the SERVER-localized
 *    message (`severity="info"` for state conflicts, `severity="warning"`
 *    for `USER_ALREADY_DELETED`).
 *
 * i18n: `useAppTranslation(AdminUsers).governanceActions` is consumed by the
 * CALLER (the component) — this hook accepts the resolved `Copy` object so it
 * stays pure-logic and trivially unit-testable.
 */

import { useMutation } from "@apollo/client/react";
import { type SubmitEventHandler, useState } from "react";
import type { AdminUserDetailQuery_adminUserDetail } from "@/frontend/graphql/generated/gql/graphql";
import {
  adminSetUserBlockedMutationDocument,
  adminSetUserSuspendedMutationDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode, extractErrorMessage, extractFieldErrors } from "@/frontend/lib/graphql-error-utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type ActionKind = "suspend" | "unsuspend" | "block" | "unblock";
type Copy = AdminUsersLabels["governanceActions"];
type InlineAlert = { readonly severity: "info" | "warning"; readonly message: string };

export interface DialogMeta {
  readonly title: string;
  readonly message: string;
  readonly confirmColor: "warning" | "error" | "primary";
}

export interface GovernanceActionsApi {
  readonly openAction: ActionKind | null;
  readonly meta: DialogMeta | null;
  readonly days: string;
  readonly daysErr: string | null;
  readonly alert: InlineAlert | null;
  readonly inFlight: boolean;
  readonly confirmDisabled: boolean;
  readonly openDialog: (action: ActionKind) => void;
  readonly closeDialog: () => void;
  readonly onDaysChange: (value: string) => void;
  readonly clearAlert: () => void;
  readonly handleSubmit: SubmitEventHandler<HTMLFormElement>;
}

const PERIOD_MIN = 1;
const PERIOD_MAX = 3650;

function isValidPeriodDays(raw: string): boolean {
  if (raw.trim() === "") return false;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= PERIOD_MIN && parsed <= PERIOD_MAX;
}

/** Conflict code → inline Alert severity (REQ-065 matrix). */
function alertSeverity(code: string | null): "info" | "warning" {
  return code === "USER_ALREADY_DELETED" ? "warning" : "info";
}

function metaFor(copy: Copy, action: ActionKind): DialogMeta {
  switch (action) {
    case "suspend":
      return { title: copy.suspendDialogTitle, message: copy.suspendDialogMessage, confirmColor: "warning" };
    case "unsuspend":
      return { title: copy.unsuspendDialogTitle, message: copy.unsuspendDialogMessage, confirmColor: "primary" };
    case "block":
      return { title: copy.blockDialogTitle, message: copy.blockDialogMessage, confirmColor: "error" };
    default:
      return { title: copy.unblockDialogTitle, message: copy.unblockDialogMessage, confirmColor: "primary" };
  }
}

export interface UseGovernanceActionsArgs {
  readonly user: AdminUserDetailQuery_adminUserDetail;
  readonly copy: Copy;
  readonly onToast: (message: string) => void;
}

/**
 * Submit-handler factory — branches per `openAction` kind, invoking the
 * supplied mutation runners + clearing dialog state on completion. Extracted
 * to module scope so the hook function stays under the function-line cap.
 */
function buildSubmitHandler(
  openAction: ActionKind | null,
  copy: Copy,
  userId: number,
  days: string,
  setDaysErr: (msg: string | null) => void,
  setAlert: (a: InlineAlert | null) => void,
  complete: (toast: string) => void,
  routeError: (err: unknown) => void,
  suspendMut: (opts: {
    variables: { id: number; suspended: boolean; periodDays: number | null };
    onCompleted: () => void;
    onError: (e: unknown) => void;
  }) => Promise<unknown>,
  blockMut: (opts: {
    variables: { id: number; blocked: boolean };
    onCompleted: () => void;
    onError: (e: unknown) => void;
  }) => Promise<unknown>
): SubmitEventHandler<HTMLFormElement> {
  return event => {
    event.preventDefault();
    if (openAction === null) return undefined;
    setAlert(null);
    const id = userId;
    if (openAction === "suspend") {
      if (!isValidPeriodDays(days)) {
        setDaysErr(copy.suspendPeriodHelper);
        return undefined;
      }
      setDaysErr(null);
      void suspendMut({
        variables: { id, suspended: true, periodDays: Number(days) },
        onCompleted: () => complete(copy.suspendSuccessToast),
        onError: routeError,
      });
    } else if (openAction === "unsuspend") {
      void suspendMut({
        variables: { id, suspended: false, periodDays: null },
        onCompleted: () => complete(copy.unsuspendSuccessToast),
        onError: routeError,
      });
    } else if (openAction === "block") {
      void blockMut({
        variables: { id, blocked: true },
        onCompleted: () => complete(copy.blockSuccessToast),
        onError: routeError,
      });
    } else {
      void blockMut({
        variables: { id, blocked: false },
        onCompleted: () => complete(copy.unblockSuccessToast),
        onError: routeError,
      });
    }
    return undefined;
  };
}

/** Server-error → inline state mutation. Encapsulates the conflict-code routing matrix. */
function buildRouteError(
  setDaysErr: (msg: string | null) => void,
  setAlert: (a: InlineAlert | null) => void
): (err: unknown) => void {
  return err => {
    const code = extractErrorCode(err);
    if (code === "FORBIDDEN") return undefined;
    if (code === "VALIDATION") {
      const periodMsg = extractFieldErrors(err).periodDays;
      if (periodMsg !== undefined) {
        setDaysErr(periodMsg);
        return undefined;
      }
    }
    setAlert({ severity: alertSeverity(code), message: extractErrorMessage(err) ?? "" });
    return undefined;
  };
}

export function useGovernanceActions({ user, copy, onToast }: UseGovernanceActionsArgs): GovernanceActionsApi {
  const [openAction, setOpenAction] = useState<ActionKind | null>(null);
  const [days, setDays] = useState("");
  const [daysErr, setDaysErr] = useState<string | null>(null);
  const [alert, setAlert] = useState<InlineAlert | null>(null);
  const [suspendMut, { loading: suspendLoading }] = useMutation(adminSetUserSuspendedMutationDocument);
  const [blockMut, { loading: blockLoading }] = useMutation(adminSetUserBlockedMutationDocument);
  const inFlight = suspendLoading || blockLoading;
  const meta = openAction === null ? null : metaFor(copy, openAction);
  const confirmDisabled = inFlight || (openAction === "suspend" && !isValidPeriodDays(days));

  const closeDialog = (): void => {
    if (inFlight) return;
    setOpenAction(null);
    setAlert(null);
    setDaysErr(null);
    setDays("");
  };
  const openDialog = (action: ActionKind): void => {
    setAlert(null);
    setDaysErr(null);
    setDays("");
    setOpenAction(action);
  };
  const onDaysChange = (value: string): void => {
    setDays(value);
    if (daysErr !== null) setDaysErr(null);
  };
  const clearAlert = (): void => setAlert(null);
  const routeError = buildRouteError(setDaysErr, setAlert);
  const complete = (toast: string): void => {
    setOpenAction(null);
    setDays("");
    onToast(toast);
  };
  const handleSubmit = buildSubmitHandler(
    openAction,
    copy,
    user.id,
    days,
    setDaysErr,
    setAlert,
    complete,
    routeError,
    suspendMut,
    blockMut
  );

  return {
    openAction,
    meta,
    days,
    daysErr,
    alert,
    inFlight,
    confirmDisabled,
    openDialog,
    closeDialog,
    onDaysChange,
    clearAlert,
    handleSubmit,
  };
}
