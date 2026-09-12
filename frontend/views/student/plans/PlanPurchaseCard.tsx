"use client";

import EventOutlined from "@mui/icons-material/EventOutlined";
import { Button, Card, CardActions, CardContent, Chip, Stack, Typography } from "@mui/material";
import type { PlanCatalogQuery_planCatalog } from "@/frontend/graphql/generated/gql/graphql";
import { formatPlanAmount } from "@/frontend/views/student/plans/planPresentation";
import { PLAN_CARD_BUY_SUFFIX, PLAN_CARD_TEST_ID_PREFIX } from "@/frontend/views/student/plans/plansViewIds";
import { useAppTranslation } from "@/shared/locale/client";
import { Checkout } from "@/shared/locale/namespaces/checkout";

export interface PlanPurchaseCardProps {
  readonly plan: PlanCatalogQuery_planCatalog;
  readonly onBuy: (plan: PlanCatalogQuery_planCatalog) => void;
  readonly buying: boolean;
}

/**
 * PlanPurchaseCard — one plan-tier presentation card per prototype (the
 * `student-plan-catalog-default-*` screens): title, prominent price, the
 * sessions + validity chips, and the Buy CTA.
 */
export function PlanPurchaseCard({ plan, onBuy, buying }: Readonly<PlanPurchaseCardProps>): React.ReactElement {
  const t = useAppTranslation(Checkout);

  return (
    <Card
      data-testid={`${PLAN_CARD_TEST_ID_PREFIX}-${plan.id}`}
      elevation={0}
      sx={theme => ({
        border: 1,
        borderColor: theme.palette.divider,
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      })}
    >
      <CardContent sx={{ pb: 1, flexGrow: 1 }}>
        <Stack sx={{ gap: 1.5 }}>
          <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
            {plan.title}
          </Typography>
          <Typography variant="h4" sx={theme => ({ fontWeight: 700, color: theme.palette.primary.main })}>
            <span dir="ltr">{formatPlanAmount(plan.price, plan.currency)}</span>
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <Chip
              icon={<EventOutlined />}
              label={t.sessionsIncludedLine(plan.sessionCount)}
              size="small"
              sx={theme => ({
                backgroundColor: theme.palette.surfaceContainerLow,
                color: theme.palette.onSurfaceVariant,
              })}
            />
            <Chip
              label={t.validityLine(plan.intervalDays)}
              size="small"
              sx={theme => ({
                backgroundColor: theme.palette.surfaceContainerLow,
                color: theme.palette.onSurfaceVariant,
              })}
            />
          </Stack>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
        <Button
          data-testid={`${PLAN_CARD_TEST_ID_PREFIX}-${plan.id}${PLAN_CARD_BUY_SUFFIX}`}
          variant="contained"
          fullWidth
          onClick={() => onBuy(plan)}
          disabled={buying}
          sx={{ minHeight: 44 }}
        >
          {t.buyButton}
        </Button>
      </CardActions>
    </Card>
  );
}
