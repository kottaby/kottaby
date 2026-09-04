"use client";

/**
 * GovernanceActionsSection — inline suspend / unsuspend / block / unblock
 * affordance row on the admin user DETAIL page (sits under the read-only
 * GovernanceCard). The component is presentational ONLY; all state +
 * mutation orchestration + conflict-code routing lives in
 * `useGovernanceActions` (`frontend/views/admin/users/hooks`).
 *
 * Behavior: each action opens a confirm dialog; the Suspend dialog
 * additionally captures a REQUIRED integer `periodDays` (1..3650) — the
 * client mirrors the server-side VALIDATION gate so an invalid value never
 * crosses the wire. Apollo merges the post-write detail fragment into the
 * SAME `AdminUserDetail:<id>` normalized entity (id-first) so the detail
 * query re-renders WITHOUT a refetch. Success → localized snackbar via the
 * caller-supplied `onToast` callback. Conflict routing (FORBIDDEN → toast
 * path; VALIDATION → field helperText; others → in-dialog Alert) lives in
 * the hook. i18n: `useAppTranslation(AdminUsers)` + property access
 * (t.governanceActions.*) ONLY.
 */

import {
  BlockOutlined as BlockIcon,
  ShieldOutlined as SuspendIcon,
  LockOpenOutlined as UnblockIcon,
  CheckCircleOutlined as UnsuspendIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import type { AdminUserDetailQuery_adminUserDetail } from "@/frontend/graphql/generated/gql/graphql";
import { useGovernanceActions } from "@/frontend/views/admin/users/hooks/useGovernanceActions";
import { AdminUsers, useAppTranslation } from "@/shared/locale";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type ActionKind = "suspend" | "unsuspend" | "block" | "unblock";
type Copy = AdminUsersLabels["governanceActions"];

interface GovernanceActionsSectionProps {
  readonly user: AdminUserDetailQuery_adminUserDetail;
  readonly onToast: (message: string) => void;
}

interface ActionButton {
  readonly kind: ActionKind;
  readonly label: string;
  readonly color: "warning" | "success" | "error" | "primary";
  readonly icon: ReactNode;
  readonly disabled: boolean;
}

const TOUCH = 44;
const SPINNER = 20;

interface GovernanceState {
  readonly deleted: boolean;
  readonly suspended: boolean;
  readonly blocked: boolean;
  readonly inFlight: boolean;
}

/** Builds the 4 state-gated affordance buttons (visibility mirrors REQ-063). */
function buildButtons(copy: Copy, state: GovernanceState): ReadonlyArray<ActionButton> {
  const { deleted, suspended, blocked, inFlight } = state;
  return [
    {
      kind: "suspend",
      label: copy.suspendAction,
      color: "warning",
      icon: <SuspendIcon />,
      disabled: deleted || suspended || inFlight,
    },
    {
      kind: "unsuspend",
      label: copy.unsuspendAction,
      color: "success",
      icon: <UnsuspendIcon />,
      disabled: deleted || !suspended || inFlight,
    },
    {
      kind: "block",
      label: copy.blockAction,
      color: "error",
      icon: <BlockIcon />,
      disabled: deleted || blocked || inFlight,
    },
    {
      kind: "unblock",
      label: copy.unblockAction,
      color: "primary",
      icon: <UnblockIcon />,
      disabled: deleted || !blocked || inFlight,
    },
  ];
}

export function GovernanceActionsSection({ user, onToast }: GovernanceActionsSectionProps): ReactNode {
  const copy = useAppTranslation(AdminUsers).governanceActions;
  const api = useGovernanceActions({ user, copy, onToast });
  const buttons = buildButtons(copy, {
    deleted: user.isDeleted ?? false,
    suspended: user.suspended ?? false,
    blocked: user.isBlocked ?? false,
    inFlight: api.inFlight,
  });

  return (
    <Box sx={{ pb: 2 }}>
      <Box
        sx={{
          display: "grid",
          // 2 columns on mobile+tablet, 4 columns on desktop (≥900px).
          // Equal-width cells eliminate the "ragged grid" defect where shorter
          // labels shrink — every button is the same width within its row.
          gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        {buttons.map(btn => (
          <Button
            key={btn.kind}
            variant="outlined"
            color={btn.color}
            startIcon={btn.icon}
            disabled={btn.disabled}
            onClick={() => api.openDialog(btn.kind)}
            aria-label={btn.label}
            sx={{
              ...focusVisibleRingSx,
              // Enforce ≥44px touch target + consistent internal padding.
              // width:100% so the button fills its grid cell (no ragged edges).
              minHeight: TOUCH,
              minWidth: TOUCH,
              px: 1.5,
              py: 1.25,
              width: "100%",
              justifyContent: "center",
            }}
          >
            {btn.label}
          </Button>
        ))}
      </Box>
      <Dialog
        open={api.openAction !== null}
        onClose={api.closeDialog}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: { borderRadius: "16px", overflow: "hidden" } } }}
      >
        <form onSubmit={api.handleSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>{api.meta?.title ?? ""}</DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: api.openAction === "suspend" ? 2 : 0 }}>{api.meta?.message ?? ""}</Typography>
            {api.openAction === "suspend" && (
              <TextField
                label={copy.suspendPeriodLabel}
                helperText={api.daysErr ?? copy.suspendPeriodHelper}
                value={api.days}
                onChange={e => api.onDaysChange(e.target.value)}
                error={api.daysErr !== null}
                aria-invalid={api.daysErr !== null}
                fullWidth
                slotProps={{
                  htmlInput: { inputMode: "numeric", pattern: "[0-9]*", "aria-label": copy.suspendPeriodLabel },
                }}
                sx={{ mt: 1 }}
              />
            )}
            {api.alert && (
              <Alert severity={api.alert.severity} sx={{ mt: 2, alignItems: "center" }} onClose={api.clearAlert}>
                {api.alert.message}
              </Alert>
            )}
          </DialogContent>
          <DialogActions
            sx={theme => ({
              px: 3,
              pb: 2.5,
              pt: 1,
              gap: 1.5,
              justifyContent: "flex-end",
              alignItems: "center",
              borderTop: `1px solid ${theme.palette.divider}`,
            })}
          >
            <Button
              onClick={api.closeDialog}
              disabled={api.inFlight}
              sx={{ ...focusVisibleRingSx, minHeight: TOUCH, minWidth: TOUCH }}
            >
              {copy.cancel}
            </Button>
            <Button
              type="submit"
              color={api.meta?.confirmColor ?? "primary"}
              variant="contained"
              disabled={api.confirmDisabled}
              aria-busy={api.inFlight || undefined}
              sx={{ ...focusVisibleRingSx, minHeight: TOUCH, minWidth: TOUCH }}
            >
              {api.inFlight ? <CircularProgress size={SPINNER} sx={{ color: "inherit" }} /> : copy.confirm}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
