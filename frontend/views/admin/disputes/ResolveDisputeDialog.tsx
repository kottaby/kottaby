"use client";

import { useMutation } from "@apollo/client/react";
import { BalanceOutlined as BalanceIcon } from "@mui/icons-material";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { type ReactNode, useState } from "react";
import { DisputeResolution } from "@/frontend/graphql/generated/gql/graphql";
import { resolveSessionDisputeMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { isNotFoundErrorFamily, normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import { Common, Errors, Sessions, useAppTranslation } from "@/shared/locale";

/**
 * ResolveDisputeDialog — the ADMIN arbitration seam for one disputed session
 * (`/disputes`, DEV3-005 R-111 / backend R-104). Structural sibling of the
 * participant `CancelSessionConfirmDialog` family: same portal/dialog/form
 * discipline, but the decision space is EXACTLY ONE terminal outcome.
 *
 * Resolution radios (R-104 semantics, localized helper texts):
 *
 * | Radio          | Server behavior on submit |
 * |----------------|---------------------------|
 * | `Cancel`       | the session is cancelled and any held fee is refunded to its original balance lane (the SAME same-lane primitive `cancelSession` uses, inside the arbitration transaction) |
 * | `Complete`     | the session is completed and its fee hold is consumed — only sessions that actually started can be completed (server `VALIDATION` otherwise) |
 *
 * Note field: OPTIONAL, ≤ {@link MAX_RESOLVE_NOTE_LENGTH} chars at the UI
 * seam (mirrors the backend contract), live raw-character counter. The
 * submit stays disabled until a resolution is chosen — an arbitration
 * outcome is never implied by a default.
 *
 * Mutation behavior (plan §3.2 — arbitration flow, NO refetch):
 *
 * | Outcome (extensions.code)                     | Behavior |
 * |-----------------------------------------------|----------|
 * | success                                       | `update` FILTERS the resolved row out of EVERY stored `adminDisputedSessions` variant and DECREMENTS its honest `totalCount` — the row leaves the queue WITHOUT a refetch; the returned `Session!` payload auto-merges the terminal status onto the entity. `onResolved` up to the container → success snackbar. |
 * | `SESSION_NOT_FOUND` (not-found family)        | `onSessionMissing` up to the container → error snackbar; the row STAYS (a raced concurrent arbitration is the honest explanation — no eviction arm on an admin surface) |
 * | `SESSION_INVALID_TRANSITION`                  | `onInvalidTransition` up to the container → error snackbar (another admin resolved it first); the row stays |
 * | `VALIDATION` (e.g. Complete on never-started) | `onFailure(errors.validation)` → error snackbar; the dialog stays open for a corrected choice |
 * | `FORBIDDEN`                                   | `onFailure(errors.forbidden)` → error snackbar; the dialog stays open |
 * | masked `INTERNAL_SERVER_ERROR` / anything else| `onFailure(sessions.genericError)` → error snackbar; the dialog stays open |
 *
 * The code classification runs through `extractErrorCode` +
 * `normalizeGraphQLErrorCode` (the single transport contract); the server
 * `message` is NEVER echoed.
 *
 * Form discipline: `React.SubmitEvent` (NEVER `FormEvent` — React 19 rules),
 * submit disabled while the mutation is in flight or no resolution chosen.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, `*Outlined`
 * icons only, ≥44px touch targets on the action buttons.
 */

/** UI-seam cap for the optional arbitration note (mirrors the backend contract). */
export const MAX_RESOLVE_NOTE_LENGTH = 500;

/** Unmapped lifecycle-reject code (the mapping table defines NO row for it). */
const SESSION_INVALID_TRANSITION_CODE = "SESSION_INVALID_TRANSITION";

/** `__typename` of the normalized `Session` cache entity. */
const SESSION_TYPE_NAME = "Session";

/** The admin queue field whose stored variants converge on arbitration. */
const ADMIN_DISPUTED_FIELD = "adminDisputedSessions";

interface ResolveDisputeDialogProps {
  /** Id of the disputed session being arbitrated. */
  readonly sessionId: string;
  readonly open: boolean;
  /**
   * Dismiss intent (cancel Button / backdrop click / Escape) — ignored
   * while the resolve mutation is pending: the Dialog's `onClose` is gated
   * on the `loading` flag below and the cancel Button is separately
   * `disabled={loading}`.
   */
  readonly onClose: () => void;
  /** Success — the queue cache already dropped the row. */
  readonly onResolved: (sessionId: string) => void;
  /** `SESSION_NOT_FOUND` — error snackbar; the row stays (see the docblock). */
  readonly onSessionMissing: (sessionId: string) => void;
  /** `SESSION_INVALID_TRANSITION` — error snackbar; the row stays. */
  readonly onInvalidTransition: (sessionId: string) => void;
  /** Everything else — error toast; the dialog stays open for a retry. */
  readonly onFailure: (message: string) => void;
}

/**
 * Filters one resolved session out of a stored `adminDisputedSessions`
 * payload and decrements its honest `totalCount` — the queue converges
 * WITHOUT any refetch and the count stays honest (the resolved row is no
 * longer awaiting arbitration).
 */
function removeSessionFromAdminQueue(
  existing: unknown,
  removedEntityId: string | undefined,
  sessionId: string
): unknown {
  if (typeof existing !== "object" || existing === null || !("items" in existing)) return existing;
  const items = existing.items;
  if (!Array.isArray(items)) return existing;
  const filteredItems = items.filter(item => {
    if (typeof item !== "object" || item === null) return true;
    // Normalized storage: dangling `Reference` entries carry `__ref`
    // (bracket access — the Apollo wire property is underscore-prefixed).
    if ("__ref" in item) return removedEntityId === undefined ? true : item.__ref !== removedEntityId;
    // Non-normalized storage (defensive): raw payloads carry `id`.
    if ("id" in item) return item.id !== sessionId;
    return true;
  });
  // IDEMPOTENCE GUARD — `cache.modify` may re-invoke this modifier after
  // its own write's broadcast; returning a fresh object EVERY invocation
  // would re-write (≠ by reference) → re-broadcast → re-invoke → an
  // unbounded write loop. When nothing matched, hand back the SAME
  // reference so the write layer sees no change and the cycle terminates.
  if (filteredItems.length === items.length) return existing;
  const next: Record<string, unknown> = { ...existing, items: filteredItems };
  if ("totalCount" in existing && typeof existing.totalCount === "number") {
    // The honest total shrinks WITH the row — a resolved dispute is no
    // longer awaiting arbitration (the count stays honest without a
    // refetch; clamped at zero defensively).
    next.totalCount = Math.max(0, existing.totalCount - 1);
  }
  return next;
}

/** Confirm-and-resolve arbitration dialog owning the `resolveSessionDispute` mutation. */
export function ResolveDisputeDialog({
  sessionId,
  open,
  onClose,
  onResolved,
  onSessionMissing,
  onInvalidTransition,
  onFailure,
}: Readonly<ResolveDisputeDialogProps>): ReactNode {
  const t = useAppTranslation(Sessions);
  const te = useAppTranslation(Errors);
  const tc = useAppTranslation(Common);

  // No default resolution — arbitration requires an EXPLICIT outcome choice.
  const [resolution, setResolution] = useState<DisputeResolution | null>(null);
  const [note, setNote] = useState("");

  const [resolveDispute, { loading }] = useMutation(resolveSessionDisputeMutationDocument, {
    // Cache CONVERGENCE on success — the resolved row leaves EVERY stored
    // variant of the admin queue (items filtered + honest totalCount
    // decremented) and the returned `Session!` payload auto-merges the
    // terminal status onto the entity. NO refetch, NO evict/gc (the entity
    // stays cached — only the queue membership changes).
    update(cache, { data }) {
      const resolved = data?.resolveSessionDispute;
      if (!resolved) return;
      const removedEntityId = cache.identify({ __typename: SESSION_TYPE_NAME, id: resolved.id });
      cache.modify({
        id: "ROOT_QUERY",
        fields: {
          [ADMIN_DISPUTED_FIELD]: (existing: unknown) =>
            removeSessionFromAdminQueue(existing, removedEntityId, resolved.id),
        },
      });
    },
    onCompleted: data => {
      onResolved(data.resolveSessionDispute.id);
    },
    onError: error => {
      const rawCode = extractErrorCode(error);
      const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);

      if (isNotFoundErrorFamily(code)) {
        onSessionMissing(sessionId);
        return;
      }
      if (code === SESSION_INVALID_TRANSITION_CODE) {
        onInvalidTransition(sessionId);
        return;
      }
      if (code === "VALIDATION") {
        onFailure(te.validation);
        return;
      }
      if (code === "FORBIDDEN") {
        onFailure(te.forbidden);
        return;
      }
      onFailure(t.genericError);
    },
  });

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading || resolution === null) return;
    const trimmed = note.trim();
    void resolveDispute({
      variables: {
        id: sessionId,
        resolution,
        note: trimmed.length === 0 ? null : trimmed,
      },
    });
  };

  // Dismissal gate — enforces the `onClose` prop contract at the dialog
  // itself: backdrop click and Escape are IGNORED while the mutation is
  // pending (the cancel Button is separately disabled while loading).
  const handleDialogClose = (): void => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { component: "form", onSubmit: handleSubmit } }}
      aria-labelledby="resolve-dispute-dialog-title"
    >
      <DialogTitle id="resolve-dispute-dialog-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.resolveDisputeTitle}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <Stack
          sx={theme => ({
            gap: 1,
            flexDirection: "row",
            alignItems: "flex-start",
            p: 2,
            borderRadius: 2,
            bgcolor: theme.palette.primaryContainer,
            color: theme.palette.onPrimaryContainer,
          })}
        >
          <BalanceIcon fontSize="small" />
          <Typography variant="body2">{t.resolveDisputeBody}</Typography>
        </Stack>
        <FormControl component="fieldset">
          {/* The fieldset's accessible name is the dialog's own decision
              vocabulary — the banner above already explains the semantics. */}
          <RadioGroup
            aria-label={t.resolveDisputeTitle}
            value={resolution ?? ""}
            onChange={event => {
              const value = event.target.value;
              // MUI radios hand back a plain wire string — compare against
              // the enum member's string VALUE (string-vs-string), keeping
              // the whitelist shape: anything unknown falls back to Cancel.
              setResolution(
                value === DisputeResolution.Complete.toString() ? DisputeResolution.Complete : DisputeResolution.Cancel
              );
            }}
            sx={{ gap: 1 }}
          >
            <Stack
              sx={theme => ({
                gap: 0.25,
                p: 2,
                borderRadius: 2,
                border: "1px solid",
                borderColor: theme.palette.outlineVariant,
              })}
            >
              <FormControlLabel
                value={DisputeResolution.Cancel}
                control={<Radio data-testid="resolve-dispute-radio-cancel" />}
                label={t.resolutionCancelLabel}
                sx={{ "& .MuiFormControlLabel-label": { fontWeight: 600 } }}
              />
              <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
                {t.resolutionCancelHelper}
              </Typography>
            </Stack>
            <Stack
              sx={theme => ({
                gap: 0.25,
                p: 2,
                borderRadius: 2,
                border: "1px solid",
                borderColor: theme.palette.outlineVariant,
              })}
            >
              <FormControlLabel
                value={DisputeResolution.Complete}
                control={<Radio data-testid="resolve-dispute-radio-complete" />}
                label={t.resolutionCompleteLabel}
                sx={{ "& .MuiFormControlLabel-label": { fontWeight: 600 } }}
              />
              <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
                {t.resolutionCompleteHelper}
              </Typography>
            </Stack>
          </RadioGroup>
        </FormControl>
        <TextField
          value={note}
          onChange={event => {
            setNote(event.target.value);
          }}
          label={t.resolutionNoteLabel}
          placeholder={t.resolutionNotePlaceholder}
          multiline
          minRows={2}
          helperText={`${note.length}/${MAX_RESOLVE_NOTE_LENGTH}`}
          slotProps={{ htmlInput: { maxLength: MAX_RESOLVE_NOTE_LENGTH } }}
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
          color="primary"
          disabled={loading || resolution === null}
          data-testid="resolve-dispute-submit"
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {t.resolveDisputeSubmit}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
