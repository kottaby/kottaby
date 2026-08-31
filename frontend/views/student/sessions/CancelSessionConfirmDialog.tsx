"use client";

import { useApolloClient, useMutation } from "@apollo/client/react";
import { WarningOutlined as WarningIcon } from "@mui/icons-material";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { cancelSessionMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import {
  isNotFoundErrorFamily,
  mapGraphQLErrorByCode,
  normalizeGraphQLErrorCode,
} from "@/frontend/providers/apollo/error-link.map";
import { Common, Errors, Sessions, useAppTranslation } from "@/shared/locale";

/**
 * CancelSessionConfirmDialog — the confirm-and-reason seam for cancelling a
 * `Scheduled`/`Started` session (student or teacher side).
 *
 * Mutation behavior (plan §5 — cancel flow, NO refetch):
 *
 * | Outcome (extensions.code)                          | Behavior |
 * |----------------------------------------------------|----------|
 * | success                                            | cache NORMALIZE — `update` rewrites `status`/`feeHeld` on the normalized `Session:<id>` entity so the list row converges instantly (the returned `Session!` payload also auto-merges); `onCancelled` up to the container → the role container's cancelled-session snackbar |
 * | `SESSION_NOT_FOUND` (not-found family)             | evict the row — BOTH role list fields (`myStudentSessions` + `myTeacherSessions`) filtered by `__ref`/`id`, entity evicted, `gc()`; `onSessionMissing` up to the container → `errors.sessionNotFound` snackbar + row disappears |
 * | `SESSION_INVALID_TRANSITION` (no mapping row — local behavior per AGENTS "caller keeps pre-existing behavior") | `onInvalidTransition` up to the container → row-scoped inline alert with `errors.sessionInvalidTransition` |
 * | `DUPLICATE_REQUEST` (map row: success-equivalent)  | `onDuplicateReplay` → informational notice with `sessions.duplicateBookingInfo` (never an error treatment — docs/IDEMPOTENCY.md §3) |
 * | masked `INTERNAL_SERVER_ERROR` / `FORBIDDEN` / anything else | `onFailure(copy)` → error toast; `FORBIDDEN` carries `errors.forbidden`, everything else the sessions-generic `sessions.genericError` |
 *
 * The code → coarse behavior classification runs through the SINGLE
 * `mapGraphQLErrorByCode` table (`frontend/providers/apollo/error-link.map.ts`,
 * AGENTS "Error surfaces & Apollo error mapping") — the DEDICATED copy keys
 * (`sessionNotFound`, `sessionInvalidTransition`, `duplicateBookingInfo`,
 * `genericError`) come from the sessions/errors namespaces per the plan's
 * copy contract; the server `message` is NEVER echoed.
 *
 * Reason field: optional, ≤ {@link MAX_CANCEL_REASON_LENGTH} chars at the UI
 * seam (mirrors the backend cap), live helper-text counter, `aria-invalid`
 * raised when a submit carries an over-cap value, empty reason sends `null`
 * (the wire field is optional).
 *
 * Form discipline: `React.SubmitEvent` (NEVER `FormEvent` — React 19 rules),
 * submit button disabled while the mutation is in flight.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, `*Outlined`
 * icons only, ≥44px touch targets on the action buttons.
 */

/** UI-seam cap for the optional cancel reason (mirrors the backend contract). */
export const MAX_CANCEL_REASON_LENGTH = 500;

/** `__typename` of the normalized `Session` cache entity. */
const SESSION_TYPE_NAME = "Session";

/** Unmapped lifecycle-reject code (the mapping table defines NO row for it). */
const SESSION_INVALID_TRANSITION_CODE = "SESSION_INVALID_TRANSITION";

interface CancelSessionConfirmDialogProps {
  /** Id of the session being cancelled. */
  readonly sessionId: string;
  readonly open: boolean;
  /** Dismiss intent (cancel button / backdrop) — ignored by the container while pending. */
  readonly onClose: () => void;
  /** Success — the cache already carries the cancelled state. */
  readonly onCancelled: (sessionId: string) => void;
  /** `SESSION_NOT_FOUND` — the container should drop the row UI-side (cache is evicted here). */
  readonly onSessionMissing: (sessionId: string) => void;
  /** `SESSION_INVALID_TRANSITION` — the container raises the row-scoped inline alert. */
  readonly onInvalidTransition: (sessionId: string) => void;
  /** `DUPLICATE_REQUEST` replay — informational, success-equivalent. */
  readonly onDuplicateReplay: () => void;
  /** Everything else — error toast; the dialog stays open for a retry. */
  readonly onFailure: (message: string) => void;
}

/**
 * Filters one removed session reference out of a stored paginated list
 * payload (`items` array) — the shared arm behind BOTH role list fields
 * below (the dialog is role-neutral: `myStudentSessions` for the student
 * surface, `myTeacherSessions` for the teacher surface; absent fields are
 * skipped by `cache.modify` so the other role's cache is untouched).
 */
function filterSessionOutOfList(existing: unknown, removedEntityId: string | undefined, sessionId: string): unknown {
  if (typeof existing !== "object" || existing === null || !("items" in existing)) return existing;
  const items = existing.items;
  if (!Array.isArray(items)) return existing;
  return {
    ...existing,
    items: items.filter(item => {
      if (typeof item !== "object" || item === null) return true;
      // Normalized storage: dangling `Reference` entries carry `__ref`
      // (bracket access — the Apollo wire property is underscore-prefixed).
      if ("__ref" in item) return removedEntityId === undefined ? true : item.__ref !== removedEntityId;
      // Non-normalized storage (defensive): raw payloads carry `id`.
      if ("id" in item) return item.id !== sessionId;
      return true;
    }),
  };
}

/**
 * Removes the missing session from the cached role list fields
 * (`myStudentSessions` AND `myTeacherSessions` — every stored variant),
 * evicts the entity and garbage-collects — the list converges WITHOUT any
 * refetch.
 */
function evictSessionFromLists(cache: ReturnType<typeof useApolloClient>["cache"], sessionId: string): void {
  const removedEntityId = cache.identify({ __typename: SESSION_TYPE_NAME, id: sessionId });
  cache.modify({
    id: "ROOT_QUERY",
    fields: {
      // Applies to EVERY stored variant of each field (args-serialized
      // storeFieldNames match their bare field name in `modify`).
      myStudentSessions(existing: unknown) {
        return filterSessionOutOfList(existing, removedEntityId, sessionId);
      },
      myTeacherSessions(existing: unknown) {
        return filterSessionOutOfList(existing, removedEntityId, sessionId);
      },
    },
  });
  if (removedEntityId !== undefined) {
    cache.evict({ id: removedEntityId });
  }
  cache.gc();
}

/** Confirm-and-reason dialog owning the `cancelSession` mutation. */
export function CancelSessionConfirmDialog({
  sessionId,
  open,
  onClose,
  onCancelled,
  onSessionMissing,
  onInvalidTransition,
  onDuplicateReplay,
  onFailure,
}: Readonly<CancelSessionConfirmDialogProps>): ReactNode {
  const t = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);
  const tc = useAppTranslation(Common);
  const client = useApolloClient();

  const [reason, setReason] = useState("");
  const [reasonInvalid, setReasonInvalid] = useState(false);
  // Fresh-dialog discipline: the container mounts this dialog UNMOUNTED-KEYED
  // per session (`key={sessionId}` in `StudentSessionsContainer`), so every
  // open starts from the initial draft state — no reset effect needed.

  const [cancelSession, { loading }] = useMutation(cancelSessionMutationDocument, {
    // Cache NORMALIZE on success — rewrite the terminal lifecycle fields onto
    // the normalized `Session:<id>` entity (belt-and-braces over the automatic
    // normalized merge of the returned `Session!` payload). NO refetch.
    update(cache, { data }) {
      const cancelled = data?.cancelSession;
      if (!cancelled) return;
      cache.modify({
        id: cache.identify({ __typename: SESSION_TYPE_NAME, id: cancelled.id }),
        fields: {
          status: () => cancelled.status,
          feeHeld: () => cancelled.feeHeld,
        },
      });
    },
    onCompleted: data => {
      onCancelled(data.cancelSession.id);
    },
    onError: error => {
      const rawCode = extractErrorCode(error);
      const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);

      if (isNotFoundErrorFamily(code)) {
        evictSessionFromLists(client.cache, sessionId);
        onSessionMissing(sessionId);
        return;
      }

      // Single code → behavior classification (AGENTS error-surface contract).
      // SESSION_INVALID_TRANSITION has NO mapping row → the documented
      // "caller keeps pre-existing behavior" arm = the local inline alert.
      const action = mapGraphQLErrorByCode(code, { contextKind: "mutation", hasForm: false });

      if (action?.duplicateSuccessEquivalent === true) {
        onDuplicateReplay();
        return;
      }
      if (code === SESSION_INVALID_TRANSITION_CODE) {
        onInvalidTransition(sessionId);
        return;
      }
      if (action?.kind === "toast" && action.messageKey === "forbidden") {
        onFailure(te.forbidden);
        return;
      }
      onFailure(t.genericError);
    },
  });

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading) return;
    const trimmed = reason.trim();
    if (trimmed.length > MAX_CANCEL_REASON_LENGTH) {
      setReasonInvalid(true);
      return;
    }
    setReasonInvalid(false);
    void cancelSession({ variables: { id: sessionId, reason: trimmed.length === 0 ? null : trimmed } });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { component: "form", onSubmit: handleSubmit } }}
      aria-labelledby="cancel-session-dialog-title"
    >
      <DialogTitle id="cancel-session-dialog-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.cancelConfirmTitle}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <Stack
          sx={theme => ({
            gap: 1,
            flexDirection: "row",
            alignItems: "flex-start",
            p: 2,
            borderRadius: 2,
            bgcolor: theme.palette.warningContainer,
            color: theme.palette.onWarningContainer,
          })}
        >
          <WarningIcon fontSize="small" />
          <Typography variant="body2">{t.cancelConfirmBody}</Typography>
        </Stack>
        <TextField
          value={reason}
          onChange={event => setReason(event.target.value)}
          label={t.cancelReasonLabel}
          placeholder={t.cancelReasonPlaceholder}
          multiline
          minRows={3}
          error={reasonInvalid}
          aria-invalid={reasonInvalid}
          helperText={`${reason.length}/${MAX_CANCEL_REASON_LENGTH}`}
          slotProps={{ htmlInput: { maxLength: MAX_CANCEL_REASON_LENGTH } }}
          sx={theme => ({
            "& .MuiFormHelperText-root": { color: theme.palette.text.secondary },
          })}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={onClose} disabled={loading} sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}>
          {tc.cancel}
        </Button>
        <Button
          type="submit"
          variant="contained"
          color="error"
          disabled={loading}
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {t.cancelSession}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
