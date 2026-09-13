"use client";

/**
 * WithdrawalQueueRows — the desktop queue row + the shared settle-button
 * pair of the withdrawal payout queue (`/admin/finances`, withdrawals tab),
 * extracted from the original monolithic panel as focused sibling
 * components.
 *
 * One queue row of the desktop table: teacher, amount (the requester's
 * reserved wallet balance at read time), requested-at timestamp, the row's
 * status chip, and the approve/reject settle-button pair. The pair is
 * shared by the desktop rows and the mobile cards (the mobile stack
 * right-aligns it) — the buttons key their testids on the transaction id.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors.
 */

import { Box, Stack, TableCell, TableRow, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import type { AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { formatMoneyAmount } from "@/frontend/views/admin/analytics/platform-analytics-display";
import { withdrawalStatusLabel, withdrawalStatusTone } from "@/frontend/views/admin/finances/withdrawalStatusDisplay";
import { TonalChip } from "@/frontend/views/admin/users/ui";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";

/** The shared settle action button skin — theme-palette colors only. */
function settleButtonSx(hoverLane: "approve" | "reject"): SxProps<Theme> {
  return theme => ({
    minHeight: 44,
    px: 2,
    borderRadius: 2,
    border: "1px solid",
    borderColor: theme.palette.outline,
    bgcolor: "transparent",
    color: theme.palette.text.primary,
    cursor: "pointer",
    "&:hover": { borderColor: hoverLane === "reject" ? theme.palette.error.main : theme.palette.primary.main },
  });
}

interface QueueSettleButtonsProps {
  /** The transaction id (both testids key on it). */
  readonly transactionId: string;
  /** Approve intent — opens the approve confirm dialog. */
  readonly onApprove: () => void;
  /** Reject intent — opens the reject dialog (mandatory reason). */
  readonly onReject: () => void;
  /** Localized approve CTA copy. */
  readonly approveLabel: string;
  /** Localized reject CTA copy. */
  readonly rejectLabel: string;
  /** Extra row alignment (the mobile cards right-align the pair). */
  readonly justifyContent?: "flex-end";
}

/** The approve/reject settle-button pair (shared by the desktop rows and the mobile cards). */
export function QueueSettleButtons({
  transactionId,
  onApprove,
  onReject,
  approveLabel,
  rejectLabel,
  justifyContent,
}: Readonly<QueueSettleButtonsProps>): ReactNode {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent }}>
      <Box
        component="button"
        type="button"
        onClick={onApprove}
        data-testid={`admin-finances-approve-${transactionId}`}
        sx={settleButtonSx("approve")}
      >
        {approveLabel}
      </Box>
      <Box
        component="button"
        type="button"
        onClick={onReject}
        data-testid={`admin-finances-reject-${transactionId}`}
        sx={settleButtonSx("reject")}
      >
        {rejectLabel}
      </Box>
    </Stack>
  );
}

/** One queue row of the desktop table. */
export function WithdrawalRow({
  item,
  locale,
  striped,
  onApprove,
  onReject,
}: Readonly<{
  item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items;
  locale: string;
  striped: boolean;
  onApprove: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
  onReject: (item: AdminPendingWithdrawalsQuery_adminPendingWithdrawals_items) => void;
}>): ReactNode {
  const t = useAppTranslation(AdminFinance);
  return (
    <TableRow
      sx={theme => ({
        ...(striped && { backgroundColor: theme.palette.action.hover }),
        "&:hover": { backgroundColor: theme.palette.action.selected },
      })}
    >
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {item.teacherName}
        </Typography>
      </TableCell>
      <TableCell
        sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}`, fontVariantNumeric: "tabular-nums" })}
      >
        <Typography variant="body2">{formatMoneyAmount(item.transaction.amount)}</Typography>
      </TableCell>
      <TableCell
        sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}`, fontVariantNumeric: "tabular-nums" })}
      >
        <Typography variant="body2">{formatMoneyAmount(item.walletBalance)}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <Typography variant="body2">{formatApplicantDate(item.transaction.createdAt, locale)}</Typography>
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <TonalChip
          tone={withdrawalStatusTone(item.transaction.status)}
          label={withdrawalStatusLabel(item.transaction.status, t)}
        />
      </TableCell>
      <TableCell sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}>
        <QueueSettleButtons
          transactionId={item.transaction.id}
          onApprove={() => {
            onApprove(item);
          }}
          onReject={() => {
            onReject(item);
          }}
          approveLabel={t.approveAction}
          rejectLabel={t.rejectAction}
        />
      </TableCell>
    </TableRow>
  );
}
