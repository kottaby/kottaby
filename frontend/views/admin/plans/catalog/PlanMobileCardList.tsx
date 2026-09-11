/**
 * PlanMobileCardList — Mobile card-stack view (visible below sm) for the admin plan catalog.
 *
 * Composes individual PlanMobileCard items.
 */

"use client";

import { Box } from "@mui/material";
import type { AdminPlansQuery } from "@/frontend/graphql/generated/gql/graphql";
import { PlanMobileCard } from "@/frontend/views/admin/plans/catalog/PlanMobileCard";

type PlanItem = AdminPlansQuery["adminPlans"][number];

export interface PlanMobileCardListProps {
  readonly plans: readonly PlanItem[];
  readonly actionLoadingId?: string | null;
  readonly onEdit: (plan: PlanItem) => void;
  readonly onToggleStatus: (plan: PlanItem, targetActive: boolean) => void;
}

export function PlanMobileCardList({
  plans,
  actionLoadingId,
  onEdit,
  onToggleStatus,
}: PlanMobileCardListProps): React.ReactElement {
  return (
    <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 2 }}>
      {plans.map(plan => (
        <PlanMobileCard
          key={plan.id}
          plan={plan}
          actionLoadingId={actionLoadingId}
          onEdit={onEdit}
          onToggleStatus={onToggleStatus}
        />
      ))}
    </Box>
  );
}
