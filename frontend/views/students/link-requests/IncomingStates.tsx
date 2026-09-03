"use client";

import { InboxOutlined, LinkOutlined } from "@mui/icons-material";
import { Alert, Box, Button, Chip, Skeleton, Snackbar, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { LinkStatus } from "@/frontend/graphql/generated/gql/graphql";
import { parentLinkStatusChipSpec } from "@/frontend/lib/parent-link-request-status";
import type { ErrorsLabels } from "@/shared/locale/types/errors";
import type { ParentLinkLabels } from "@/shared/locale/types/parentLink";

/** Success-toast auto-hide cadence (host toast posture, mark-all precedent). */
const SUCCESS_TOAST_AUTOHIDE_MS = 6000;

/**
 * Stable identities for the skeleton rows — decorative placeholders that
 * never reorder; module-level keys keep React keys OFF the bare array index
 * (biome `noArrayIndexKey`).
 */
const SKELETON_ROW_KEYS: readonly string[] = ["skeleton-row-1", "skeleton-row-2", "skeleton-row-3"];

/**
 * IncomingHeader — the static page shell: `studentPageTitle` (h1) +
 * `studentPageSubtitle`, copy resolved client-side through the
 * `ParentLink` namespace handle (property access only).
 */
export function IncomingHeader({ labels }: Readonly<{ readonly labels: ParentLinkLabels }>): ReactNode {
  return (
    <Stack spacing={0.5}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {labels.studentPageTitle}
      </Typography>
      <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
        {labels.studentPageSubtitle}
      </Typography>
    </Stack>
  );
}

/**
 * IncomingSkeletonList — the cold-load branch: skeleton rows matching the
 * final card geometry. The region announces itself politely through
 * `Box component="output"` + `aria-busy` (the MUI v9 aria-live pattern from
 * `frontend/AGENTS.md`).
 */
export function IncomingSkeletonList(): ReactNode {
  return (
    <Box
      component="output"
      data-testid="student-link-requests-skeleton"
      aria-busy="true"
      sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 2 }}
    >
      {SKELETON_ROW_KEYS.map(key => (
        <Stack
          key={key}
          spacing={1.5}
          sx={theme => ({ p: { xs: 2, sm: 2.5 }, borderRadius: 2, border: 1, borderColor: theme.palette.border.main })}
        >
          <Skeleton variant="text" sx={{ fontSize: "0.75rem", width: 64 }} />
          <Skeleton variant="text" sx={{ fontSize: "1.25rem", maxWidth: 280 }} />
          <Skeleton variant="text" sx={{ fontSize: "0.875rem", maxWidth: 320 }} />
          <Skeleton variant="rounded" sx={{ height: 28, width: 180, borderRadius: 999 }} />
        </Stack>
      ))}
    </Box>
  );
}

/**
 * IncomingLoadErrorAlert — the generic (non-retryable, non-denial) query
 * failure: localized `errors.internalServerError` copy with a retry
 * affordance; the page around it stays interactive.
 */
export function IncomingLoadErrorAlert({
  errorLabels,
  retryLabel,
  onRetry,
  retryPending,
}: Readonly<{
  readonly errorLabels: ErrorsLabels;
  readonly retryLabel: string;
  readonly onRetry: () => void;
  readonly retryPending: boolean;
}>): ReactNode {
  return (
    <Alert
      severity="error"
      variant="outlined"
      sx={{ borderRadius: 2 }}
      action={
        <Button
          color="error"
          size="small"
          disabled={retryPending}
          onClick={onRetry}
          sx={{ ...focusVisibleRingSx, flexShrink: 0, minHeight: { xs: 44 } }}
        >
          {retryLabel}
        </Button>
      }
    >
      {errorLabels.internalServerError}
    </Alert>
  );
}

/**
 * IncomingEmptyState — the zero-rows branch: a centered, generously-spaced
 * composition (link icon in a tinted circle + `incomingEmptyTitle` /
 * `incomingEmptyBody`). No action buttons render here.
 */
export function IncomingEmptyState({ labels }: Readonly<{ readonly labels: ParentLinkLabels }>): ReactNode {
  return (
    <Stack
      spacing={2}
      data-testid="student-link-requests-empty"
      sx={{ alignItems: "center", justifyContent: "center", py: { xs: 6, sm: 10 }, px: 2, textAlign: "center" }}
    >
      <Box
        aria-hidden
        sx={theme => ({
          width: 72,
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          bgcolor: theme.palette.secondaryContainer,
          color: theme.palette.onSecondaryContainer,
        })}
      >
        <LinkOutlined sx={{ fontSize: 36 }} />
      </Box>
      <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
        {labels.incomingEmptyTitle}
      </Typography>
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 420 })}>
        {labels.incomingEmptyBody}
      </Typography>
    </Stack>
  );
}

/**
 * Chip order of the status summary strip — pending/confirmed/rejected always
 * render (a zero still reads as a deliberate stat); the computed `expired`
 * chip only joins when at least one row displays it.
 */
const SUMMARY_CHIP_ORDER: readonly LinkStatus[] = [
  LinkStatus.Pending,
  LinkStatus.Confirmed,
  LinkStatus.Rejected,
  LinkStatus.Expired,
];

/**
 * IncomingStatusSummary — the compact per-status count strip above a SHORT
 * request list (≤2 rows, ≥`sm` viewports only — the sparse-inbox composition):
 * outlined chips tallying pending / confirmed / rejected rows. A zero count
 * renders a neutral chip (the strip reads as an intentional stats bar, not a
 * lone badge), and the `expired` chip only appears when a row displays that
 * computed verdict. Counts arrive pre-derived by the caller from the SAME
 * `displayLinkRequestStatus` verdict the row cards render, so the strip can
 * never disagree with the list below it.
 */
export function IncomingStatusSummary({
  counts,
  labels,
}: Readonly<{
  readonly counts: Readonly<Record<LinkStatus, number>>;
  readonly labels: ParentLinkLabels;
}>): ReactNode {
  const chipSpec = parentLinkStatusChipSpec(labels);
  return (
    <Box
      component="section"
      aria-label={labels.listSummaryLabel}
      data-testid="student-link-requests-summary"
      sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center", flexWrap: "wrap", gap: 1 }}
    >
      {SUMMARY_CHIP_ORDER.filter(status => status !== LinkStatus.Expired || counts[status] > 0).map(status => (
        <Chip
          key={status}
          size="small"
          variant="outlined"
          color={counts[status] > 0 ? chipSpec[status].color : "default"}
          label={labels.summaryCountChip(chipSpec[status].label, counts[status])}
        />
      ))}
    </Box>
  );
}

/**
 * IncomingShortListHint — the friendly one-line hint under a SHORT request
 * list (≤2 rows, ≥`sm` viewports only): a muted inbox glyph beside
 * `incomingHintBody` inside a dashed-border card — the dashed outline marks
 * the region as "future content lands here" so the sparse inbox reads as
 * intentional composition rather than dead space.
 */
export function IncomingShortListHint({ labels }: Readonly<{ readonly labels: ParentLinkLabels }>): ReactNode {
  return (
    <Box
      data-testid="student-link-requests-hint"
      sx={theme => ({
        display: { xs: "none", sm: "flex" },
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        px: 2,
        py: 1.5,
        borderRadius: 2,
        border: "1px dashed",
        borderColor: theme.palette.border.main,
      })}
    >
      <InboxOutlined
        aria-hidden
        sx={theme => ({ fontSize: 20, flexShrink: 0, color: theme.palette.text.secondary })}
      />
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        {labels.incomingHintBody}
      </Typography>
    </Box>
  );
}

/**
 * SuccessToast — the transient localized success snackbar after a Confirm /
 * Reject resolves (`confirmSuccessToast` / `rejectSuccessToast`). The copy
 * arrives preassembled; `null` keeps the snackbar closed.
 */
export function SuccessToast({
  copy,
  onClose,
}: Readonly<{ readonly copy: string | null; readonly onClose: () => void }>): ReactNode {
  return (
    <Snackbar
      open={copy !== null}
      autoHideDuration={SUCCESS_TOAST_AUTOHIDE_MS}
      onClose={(_, reason) => {
        if (reason !== "clickaway") {
          onClose();
        }
      }}
    >
      <Alert
        severity="success"
        variant="filled"
        data-testid="student-link-requests-success-toast"
        sx={{ borderRadius: 2 }}
      >
        {copy}
      </Alert>
    </Snackbar>
  );
}
