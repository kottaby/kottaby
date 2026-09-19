"use client";

/**
 * WithdrawalQueueBanners — the non-table banners of the withdrawal payout
 * queue status body (`/admin/finances`, withdrawals tab), extracted from
 * `WithdrawalQueueStatusBody` to keep both modules under the function-size
 * tier: the FORBIDDEN denied-notice alert and the single-page pending-total
 * summary strip.
 *
 * All copy comes from the `AdminFinance` namespace; MUI v9 `sx`-only
 * discipline, theme-palette colors.
 */

import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import { Alert, AlertTitle, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useAppTranslation } from "@/shared/locale/client";
import { AdminFinance } from "@/shared/locale/namespaces/adminFinance";

/** The FORBIDDEN denied-notice alert of the withdrawal queue. */
export function WithdrawalDeniedAlert({ title, body }: Readonly<{ title: string; body: string }>): ReactNode {
  return (
    <Alert
      severity="error"
      variant="outlined"
      sx={{ borderRadius: "12px" }}
      data-testid="admin-finances-withdrawals-denied"
    >
      <AlertTitle sx={{ fontWeight: 700 }}>{title}</AlertTitle>
      <Typography variant="body2" component="p">
        {body}
      </Typography>
    </Alert>
  );
}

/**
 * The single-page EGP total of the pending payout amounts. Rendered ONLY
 * when the whole queue fits on the current page (totalCount <= pageSize):
 * a multi-page queue would make the sum a partial figure masquerading as
 * the queue total — the financial-copy honesty rule hides it instead.
 */
export function WithdrawalPendingTotalStrip({ total }: Readonly<{ total: string }>): ReactNode {
  const t = useAppTranslation(AdminFinance);
  return (
    <Stack
      direction="row"
      spacing={1}
      data-testid="admin-finances-withdrawals-pending-total"
      sx={theme => ({
        alignItems: "center",
        justifyContent: "flex-end",
        px: 1.5,
        py: 1,
        borderRadius: 2,
        bgcolor: theme.palette.surfaceContainerLow,
      })}
    >
      <PendingActionsOutlinedIcon
        fontSize="small"
        sx={theme => ({ color: theme.palette.onSurfaceVariant })}
        aria-hidden
      />
      <Typography variant="caption" sx={theme => ({ color: theme.palette.onSurfaceVariant, fontWeight: 600 })}>
        {t.withdrawalsPendingTotal(total)}
      </Typography>
    </Stack>
  );
}
