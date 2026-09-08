"use client";

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { type ReactNode, useState } from "react";
import type { AdminSessionsQuery_adminSessions_items } from "@/frontend/graphql/generated/gql/graphql";
import { SessionDialogWarningCallout } from "@/frontend/views/student/sessions/SessionDialogWarningCallout";
import { AdminSessionGovernance, Common, Errors, useAppTranslation } from "@/shared/locale";

/**
 * RescheduleSessionDialog — the admin reschedule seam for one governance
 * session (`/admin/session-governance`, DEV3-021). Structural
 * sibling of the arbitration dialog: portal/dialog/form discipline,
 * `React.SubmitEvent`, dismissal gated while the mutation is in flight.
 *
 * Date inputs — native `datetime-local` TextFields (NO `@mui/x-date-pickers`
 * dependency exists in the tree, and the `AppDatePicker`/`AppTimePicker`
 * components referenced by `COMPONENT_PATTERNS.md` do not exist — plain
 * date fields are the established zero-dependency seam). Tokens convert to
 * ISO-8601 UTC instants at the submit seam (`DateTime` scalar wire shape).
 *
 * Client validation mirrors the service rules: the pair must be
 * ordered (`startedAt < endedAt`) and the start may not sit further than
 * the 5-minute grace window in the past — the SAME envelope the backend
 * enforces (`RESCHEDULE_START_PAST_GRACE_MS`), surfacing the localized
 * errors copy on the start field BEFORE the mutation fires. The mutation
 * itself and its error classification live in the container; this dialog
 * stays open on every failure arm for a corrected submit.
 *
 * MUI v9 discipline: `sx`-only styling, theme-palette colors, ≥44px touch
 * targets, keyboard-focusable dialog (`aria-labelledby` + focusable fields).
 */

/** Reschedule grace mirror — the replacement start may sit ≤5 min in the past. */
const RESCHEDULE_PAST_GRACE_MS = 5 * 60 * 1000;

/** ISO wire instant → local `datetime-local` token (prefill). */
export function isoToDatetimeLocalToken(iso: string | null): string {
  if (iso === null) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(
    instant.getHours()
  )}:${pad(instant.getMinutes())}`;
}

/**
 * Client mirror of the reschedule validation envelope (service rules): the
 * pair must be ordered AND the start may not sit further than the grace
 * window in the past. Returns the localized message, or null when valid.
 */
export function validateReschedulePair(
  startedAtIso: string,
  endedAtIso: string,
  tErrors: {
    readonly sessionRescheduleWindowInvalid: string;
    readonly sessionRescheduleStartInPast: string;
  }
): string | null {
  const startedMs = new Date(startedAtIso).getTime();
  const endedMs = new Date(endedAtIso).getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || startedMs >= endedMs) {
    return tErrors.sessionRescheduleWindowInvalid;
  }
  if (startedMs < Date.now() - RESCHEDULE_PAST_GRACE_MS) {
    return tErrors.sessionRescheduleStartInPast;
  }
  return null;
}

/** The submit payload the container forwards to `adminRescheduleSession`. */
export interface ReschedulePair {
  readonly startedAt: string;
  readonly endedAt: string;
}

interface RescheduleSessionDialogProps {
  /** The session being rescheduled (prefills the current timing pair). */
  readonly session: AdminSessionsQuery_adminSessions_items;
  readonly open: boolean;
  /**
   * Dismiss intent (cancel Button / backdrop click / Escape) — ignored
   * while the reschedule mutation is pending.
   */
  readonly onClose: () => void;
  /** True while the container's reschedule mutation is in flight. */
  readonly loading: boolean;
  /** Validated submit intent — receives ISO-8601 UTC instants. */
  readonly onSubmit: (pair: ReschedulePair) => void;
}

/** Confirm-and-reschedule dialog (timing pair + service-rule mirror). */
export function RescheduleSessionDialog({
  session,
  open,
  onClose,
  loading,
  onSubmit,
}: Readonly<RescheduleSessionDialogProps>): ReactNode {
  const t = useAppTranslation(AdminSessionGovernance);
  const tc = useAppTranslation(Common);
  const te = useAppTranslation(Errors);

  const [startedAtToken, setStartedAtToken] = useState<string>(() => isoToDatetimeLocalToken(session.startedAt));
  const [endedAtToken, setEndedAtToken] = useState<string>(() => isoToDatetimeLocalToken(session.endedAt));
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (loading || startedAtToken === "" || endedAtToken === "") return;
    const startedAtIso = new Date(startedAtToken).toISOString();
    const endedAtIso = new Date(endedAtToken).toISOString();
    const invalidMessage = validateReschedulePair(startedAtIso, endedAtIso, te);
    if (invalidMessage !== null) {
      setValidationMessage(invalidMessage);
      return;
    }
    setValidationMessage(null);
    onSubmit({ startedAt: startedAtIso, endedAt: endedAtIso });
  };

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
      aria-labelledby="reschedule-session-dialog-title"
    >
      <DialogTitle id="reschedule-session-dialog-title" sx={theme => ({ color: theme.palette.onSurface })}>
        {t.rescheduleTitle}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <SessionDialogWarningCallout message={t.rescheduleBody} />
        <TextField
          label={t.rescheduleStartLabel}
          type="datetime-local"
          value={startedAtToken}
          onChange={event => {
            setStartedAtToken(event.target.value);
            setValidationMessage(null);
          }}
          required
          error={validationMessage !== null}
          helperText={validationMessage ?? undefined}
          aria-invalid={validationMessage !== null}
          data-testid="reschedule-session-start"
          slotProps={{ htmlInput: { autoComplete: "off" } }}
        />
        <TextField
          label={t.rescheduleEndLabel}
          type="datetime-local"
          value={endedAtToken}
          onChange={event => {
            setEndedAtToken(event.target.value);
            setValidationMessage(null);
          }}
          required
          data-testid="reschedule-session-end"
          slotProps={{ htmlInput: { autoComplete: "off" } }}
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
          disabled={loading || startedAtToken === "" || endedAtToken === ""}
          data-testid="reschedule-session-submit"
          sx={{ minHeight: { xs: 44, sm: 40 }, px: 3 }}
        >
          {t.rescheduleSubmit}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
