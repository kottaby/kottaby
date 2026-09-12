"use client";

import { Box } from "@mui/material";
import type { PlanCatalogQuery_planCatalog } from "@/frontend/graphql/generated/gql/graphql";
import { PlanPurchaseCard } from "@/frontend/views/student/plans/PlanPurchaseCard";

export interface PlanPurchaseCardListProps {
  readonly plans: readonly PlanCatalogQuery_planCatalog[];
  readonly onBuy: (plan: PlanCatalogQuery_planCatalog) => void;
  readonly buying: boolean;
}

/**
 * PlanPurchaseCardList — the plan-tier card stack: one column mobile,
 * two tablet, three desktop (per-prototype grid; the prototype's desktop
 * three-up layout and mobile stacked cards share this one grid).
 */
export function PlanPurchaseCardList({
  plans,
  onBuy,
  buying,
}: Readonly<PlanPurchaseCardListProps>): React.ReactElement {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" },
        gap: { xs: 2, md: 3 },
      }}
    >
      {plans.map(plan => (
        <PlanPurchaseCard key={plan.id} plan={plan} onBuy={onBuy} buying={buying} />
      ))}
    </Box>
  );
}
