"use client";

import EventOutlined from "@mui/icons-material/EventOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import { Button, Card, CardActions, CardContent, Chip, Stack, Typography } from "@mui/material";
import type { PlanCatalogQuery_planCatalog } from "@/frontend/graphql/generated/gql/graphql";
import { formatPlanAmount } from "@/frontend/views/student/plans/planPresentation";
import { PLAN_CARD_BUY_SUFFIX, PLAN_CARD_TEST_ID_PREFIX } from "@/frontend/views/student/plans/plansViewIds";
import { resolveLaneLabel } from "@/frontend/views/student/plans/plansViewLabels";
import { useAppTranslation } from "@/shared/locale/client";
import { Checkout } from "@/shared/locale/namespaces/checkout";

export interface PlanPurchaseCardProps {
  readonly plan: PlanCatalogQuery_planCatalog;
  readonly onBuy: (plan: PlanCatalogQuery_planCatalog) => void;
  readonly buying: boolean;
}

/**
 * Derives the comparison-aid per-session amount from the bundle price —
 * the honest floor: a zero/absent session count yields `null` (no line) so
 * the card never shows "≈ 0.00 per session" on malformed catalog data.
 * Two-decimal fixed-point over the wire string (the same decimal grammar
 * the server prices use).
 */
function perSessionAmount(price: string, sessionCount: number): string | null {
  if (!Number.isFinite(sessionCount) || sessionCount <= 0) return null;
  const perSession = Number(price) / sessionCount;
  if (!Number.isFinite(perSession)) return null;
  return perSession.toFixed(2);
}

/**
 * PlanPurchaseCard — one plan-tier presentation card per prototype (the
 * `student-plan-catalog-default-*` screens): title, prominent price with a
 * derived per-session comparison line, the sessions + validity chips, and
 * the Buy CTA.
 */
export function PlanPurchaseCard({ plan, onBuy, buying }: Readonly<PlanPurchaseCardProps>): React.ReactElement {
  const t = useAppTranslation(Checkout);
  const laneLabel = plan.balanceLane === null ? t.laneGeneralLabel : resolveLaneLabel(plan.balanceLane, t);
  const currencyLabel = plan.currency === "EGP" ? t.currencyEgp : undefined;
  const perSession = perSessionAmount(plan.price, plan.sessionCount);

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
          <Typography variant="h4" sx={theme => ({ fontWeight: 700, color: theme.palette.primary.light })}>
            <span dir="ltr">{formatPlanAmount(plan.price, plan.currency, currencyLabel)}</span>
          </Typography>
          {perSession !== null ? (
            <Typography
              data-testid={`plan-per-session-${plan.id}`}
              variant="caption"
              sx={theme => ({
                color: theme.palette.onSurfaceVariant,
                fontVariantNumeric: "tabular-nums",
                mt: -1,
              })}
            >
              <span dir="ltr">{t.perSessionLine(formatPlanAmount(perSession, plan.currency, currencyLabel))}</span>
            </Typography>
          ) : null}
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <Chip
              icon={<EventOutlined />}
              label={t.sessionsIncludedLine(plan.sessionCount)}
              size="small"
              sx={theme => ({
                backgroundColor: theme.palette.surfaceContainer,
                color: theme.palette.onSurfaceVariant,
              })}
            />
            <Chip
              icon={<ScheduleOutlined />}
              label={t.validityLine(plan.intervalDays)}
              size="small"
              sx={theme => ({
                backgroundColor: theme.palette.surfaceContainer,
                color: theme.palette.onSurfaceVariant,
              })}
            />
          </Stack>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.onSurfaceVariant })}>
            {t.laneCreditLine(laneLabel)}
          </Typography>
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
