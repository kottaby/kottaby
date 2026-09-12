"use client";

import InventoryOutlined from "@mui/icons-material/InventoryOutlined";
import { Paper, Stack, Typography } from "@mui/material";
import { PLANS_EMPTY_TEST_ID } from "@/frontend/views/student/plans/plansViewIds";
import { useAppTranslation } from "@/shared/locale/client";
import { Checkout } from "@/shared/locale/namespaces/checkout";

/**
 * PlansEmptyState — the accessible empty-catalog state: a decorative icon
 * in a tinted circle atop the localized empty title + body copy (the
 * shared `IconCircleEmptyState` rhythm, scoped to the catalog view).
 */
export function PlansEmptyState(): React.ReactElement {
  const t = useAppTranslation(Checkout);

  return (
    <Paper
      data-testid={PLANS_EMPTY_TEST_ID}
      elevation={0}
      sx={theme => ({
        border: 1,
        borderColor: theme.palette.divider,
        borderRadius: 2,
        p: 6,
        textAlign: "center",
        backgroundColor: theme.palette.background.paper,
      })}
    >
      <Stack sx={{ alignItems: "center", gap: 2 }}>
        <Typography
          aria-hidden
          component="span"
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
          <InventoryOutlined sx={{ fontSize: 36 }} />
        </Typography>
        <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
          {t.emptyTitle}
        </Typography>
        <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 420 })}>
          {t.emptyBody}
        </Typography>
      </Stack>
    </Paper>
  );
}
