"use client";

import { SendOutlined as SendIcon } from "@mui/icons-material";
import { Alert, Box, Snackbar } from "@mui/material";
import type { ReactNode } from "react";
import { IconCircleEmptyState } from "@/frontend/components/ui/IconCircleEmptyState";
import { resolveParentLinkDenialCopy } from "@/frontend/lib/parent-link-denials";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { ParentLinkLabels } from "@/shared/locale/types/parentLink";

/**
 * Presentational states of the parent outgoing link-requests section
 * — extracted from the stateful orchestrator so the
 * hooks-bearing component stays inside the view size budgets. Every label
 * arrives as an already-resolved namespace handle (property access only).
 *
 * The unsettled branch chain (retryable → generic failure → skeleton) lives
 * in the sibling `OutgoingSectionStates.parts.tsx`; this module keeps the
 * settled/result surfaces (empty, denial, list, toast).
 */

/** Success-toast auto-hide cadence for the cancel confirmation. */
const CANCEL_TOAST_AUTOHIDE_MS = 6000;

/**
 * Zero-rows branch — delegates to the shared `IconCircleEmptyState` so the
 * parent page keeps the exact 72/36 tinted-circle rhythm of the student
 * side (`IncomingEmptyState`). The send affordance on the discovery card is
 * still the action surface, so this state intentionally renders no buttons.
 */
export function OutgoingEmptyState({ labels }: Readonly<{ readonly labels: ParentLinkLabels }>): ReactNode {
  return (
    <IconCircleEmptyState
      testId="parent-outgoing-empty"
      icon={<SendIcon sx={{ fontSize: 36 }} />}
      title={labels.outgoingEmptyTitle}
      body={labels.outgoingEmptyBody}
    />
  );
}

/**
 * Mutation-denial surface — the shared parent-link denial copy keyed by the
 * raw `extensions.code` (constant-shape discipline: the same wire code maps
 * to the SAME localized copy on every surface).
 */
export function OutgoingDenialAlert({
  denialCode,
  errorLabels,
}: Readonly<{ readonly denialCode: string; readonly errorLabels: ErrorsLabels }>): ReactNode {
  return (
    <Alert severity="error" variant="outlined" data-testid="parent-outgoing-denial-alert" sx={{ borderRadius: 2 }}>
      {resolveParentLinkDenialCopy(denialCode, errorLabels)}
    </Alert>
  );
}

/** The settled list region — keyed row nodes composed by the section. */
export function OutgoingSettledList({
  rowNodes,
  listLabel,
  busy,
}: Readonly<{ readonly rowNodes: ReactNode[]; readonly listLabel: string; readonly busy: boolean }>): ReactNode {
  return (
    <Box
      component="output"
      data-testid="parent-outgoing-list"
      aria-label={listLabel}
      aria-busy={busy}
      sx={{ display: "grid", gap: 2 }}
    >
      {rowNodes}
    </Box>
  );
}

/** Transient localized success snackbar after the cancel resolves. */
export function OutgoingSuccessToast({
  copy,
  onClose,
}: Readonly<{ readonly copy: string | null; readonly onClose: () => void }>): ReactNode {
  return (
    <Snackbar
      open={copy !== null}
      autoHideDuration={CANCEL_TOAST_AUTOHIDE_MS}
      onClose={(_, reason) => {
        if (reason !== "clickaway") {
          onClose();
        }
      }}
    >
      <Alert severity="success" variant="filled" data-testid="parent-outgoing-success-toast" sx={{ borderRadius: 2 }}>
        {copy}
      </Alert>
    </Snackbar>
  );
}
