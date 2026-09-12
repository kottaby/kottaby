"use client";

import { useQuery } from "@apollo/client/react";
import { Alert, Container, Snackbar, Stack, Typography } from "@mui/material";
import { type ReactNode, useCallback, useState } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import type { PlanCatalogQuery_planCatalog } from "@/frontend/graphql/generated/gql/graphql";
import { planCatalogQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { mapGraphQLErrorByCode, normalizeGraphQLErrorCode } from "@/frontend/providers/apollo/error-link.map";
import { PlanPurchaseCardList } from "@/frontend/views/student/plans/PlanPurchaseCardList";
import { PlanPurchaseConfirmDialog } from "@/frontend/views/student/plans/PlanPurchaseConfirmDialog";
import { PlansEmptyState } from "@/frontend/views/student/plans/PlansEmptyState";
import { PlansLoadingSkeleton } from "@/frontend/views/student/plans/PlansLoadingSkeleton";
import { PLANS_CATALOG_TEST_ID, PLANS_ERROR_TEST_ID } from "@/frontend/views/student/plans/plansViewIds";
import { PLAN_CATALOG_SNACKBAR_AUTOHIDE_MS } from "@/frontend/views/student/plans/purchaseHelpers";
import { usePurchaseSubscription } from "@/frontend/views/student/plans/usePurchaseSubscription";
import { Checkout, useAppTranslation } from "@/shared/locale";

/**
 * PlansCatalogContainer — the client orchestrator behind
 * `/student/plans` (the student plan catalog + checkout initiation).
 *
 * Page-level authorization is owned by the server guard (`withPageAuth`) —
 * this container performs no role logic (the `planCatalog` read is
 * authenticated server-side and carries no identity input).
 *
 * Render branches (visual state matrix) — the chrome (page title +
 * subtitle) renders in EVERY branch; only the body below it swaps:
 *
 * | # | Condition | Body (below the always-on chrome) |
 * |---|-----------|-----------------------------------|
 * | 1 | query in flight (no settled payload yet) | skeleton cards (`aria-busy`) |
 * | 2 | query error, denial family (`permission-fallback` / `auth-recovery`) | shared `PermissionDeniedFallback` |
 * | 3 | any other query error (masked 500 …) | inline `Alert` with `checkout.genericError` |
 * | 4 | zero active plans | empty state (`emptyTitle` / `emptyBody`) |
 * | 5 | plans present | `PlanPurchaseCard` grid |
 *
 * Checkout wiring — the Buy CTA opens the confirm dialog for that plan;
 * confirming fires the `purchaseSubscription` mutation through
 * `usePurchaseSubscription` (idempotency key minted into a ref, rotated
 * only on success; the plan id is the ONLY client-owned field — amount,
 * currency, and billing data derive server-side). Outcomes:
 *
 * | Outcome | Container behavior |
 * |---------|--------------------|
 * | `redirected` (hosted `checkoutUrl`) | the hook navigates the browser to the gateway — no further UI work |
 * | `completed` (`checkoutUrl: null` — instant-activation providers) | `purchaseCompletedNotice` success snackbar; dialog closed; catalog refetches |
 * | `failed` | `checkout.genericError` inside the dialog; it stays open for a retry (same key) |
 *
 * Query-context errors classify through the SINGLE `mapGraphQLErrorByCode`
 * table (`frontend/providers/apollo/error-link.map.ts`) — never the server
 * `message`. All copy resolves through the compile-time `Checkout` handle
 * (property access only).
 */
export function PlansCatalogContainer(): ReactNode {
  const t = useAppTranslation(Checkout);
  const [dialogPlan, setDialogPlan] = useState<PlanCatalogQuery_planCatalog | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [completedNotice, setCompletedNotice] = useState<string | null>(null);

  const { data, loading, error: queryError, refetch } = useCatalogQuery();

  const { purchasing, handleConfirmPurchase } = usePurchaseSubscription();

  const openDialog = useCallback((plan: PlanCatalogQuery_planCatalog) => {
    setPurchaseError(null);
    setDialogPlan(plan);
  }, []);

  const closeDialog = useCallback(() => {
    // Cancel keeps the purchase attempt's idempotency key alive (the hook
    // rotates only on success) — the dialog state is the only thing reset.
    setPurchaseError(null);
    setDialogPlan(null);
  }, []);

  const confirmPurchase = useCallback(async () => {
    if (dialogPlan === null) {
      return;
    }
    const outcome = await handleConfirmPurchase(dialogPlan.id);
    if (outcome === "redirected") {
      // The hook has navigated the browser to the hosted checkout — the
      // dialog stays mounted for the (brief) external navigation window.
      return;
    }
    if (outcome === "completed") {
      setDialogPlan(null);
      setCompletedNotice(t.purchaseCompletedNotice);
      void refetch();
      return;
    }
    setPurchaseError(t.genericError);
  }, [dialogPlan, handleConfirmPurchase, refetch, t]);

  const plans = data?.planCatalog ?? [];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack data-testid={PLANS_CATALOG_TEST_ID} sx={{ gap: 3 }}>
        <Stack sx={{ gap: 1 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {t.pageTitle}
          </Typography>
          <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.pageSubtitle}
          </Typography>
        </Stack>
        <PlansCatalogBody
          loading={loading}
          queryError={queryError}
          plans={plans}
          onBuy={openDialog}
          buying={purchasing}
          genericErrorMessage={t.genericError}
        />
      </Stack>
      <PlanPurchaseConfirmDialog
        open={dialogPlan !== null}
        plan={dialogPlan}
        purchasing={purchasing}
        error={purchaseError}
        onClose={closeDialog}
        onConfirm={() => {
          void confirmPurchase();
        }}
      />
      <Snackbar
        open={completedNotice !== null}
        autoHideDuration={PLAN_CATALOG_SNACKBAR_AUTOHIDE_MS}
        onClose={() => setCompletedNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setCompletedNotice(null)} sx={{ width: "100%" }}>
          {completedNotice}
        </Alert>
      </Snackbar>
    </Container>
  );
}

/** Stateful catalog read (cache-and-network — refetches on mount; `useLazyQuery` is banned). */
function useCatalogQuery() {
  return useQuery(planCatalogQueryDocument, { fetchPolicy: "cache-and-network" });
}

interface PlansCatalogBodyProps {
  readonly loading: boolean;
  readonly queryError: unknown;
  readonly plans: readonly PlanCatalogQuery_planCatalog[];
  readonly onBuy: (plan: PlanCatalogQuery_planCatalog) => void;
  readonly buying: boolean;
  readonly genericErrorMessage: string;
}

/**
 * The swapping body below the always-on chrome — skeleton / denial
 * fallback / error alert / empty state / plan grid.
 */
function PlansCatalogBody({
  loading,
  queryError,
  plans,
  onBuy,
  buying,
  genericErrorMessage,
}: Readonly<PlansCatalogBodyProps>): ReactNode {
  if (loading && plans.length === 0) {
    return <PlansLoadingSkeleton />;
  }
  // Apollo settles queries with data-or-error; the truthy gate keeps the
  // compiler informed without unsafe assertions.
  if (queryError) {
    const rawCode = extractErrorCode(queryError);
    const code = rawCode === null ? "" : normalizeGraphQLErrorCode(rawCode);
    const action = mapGraphQLErrorByCode(code, { contextKind: "query", hasForm: false });
    if (action?.kind === "permission-fallback" || action?.kind === "auth-recovery") {
      return <PermissionDeniedFallback />;
    }
    return (
      <Stack data-testid={PLANS_ERROR_TEST_ID} sx={{ py: { xs: 4, sm: 6 } }}>
        <Alert severity="error" variant="outlined">
          {genericErrorMessage}
        </Alert>
      </Stack>
    );
  }
  if (!loading && plans.length === 0) {
    return <PlansEmptyState />;
  }
  return <PlanPurchaseCardList plans={plans} onBuy={onBuy} buying={buying} />;
}
