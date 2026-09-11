"use client";

/**
 * PlanCatalogContainer — Root client container for admin plan catalog management.
 *
 * Integrates:
 *  - Apollo useQuery hook with cache normalization
 *  - Create & Edit plan dialogs (PlanFormDialog via usePlanFormDialog)
 *  - Status change confirmation dialog (PlanStatusConfirmDialog via usePlanStatusDialog)
 *  - Success snackbar notifications
 *  - Page header & catalog views
 */

import { useQuery } from "@apollo/client/react";
import { Alert, Container, Snackbar } from "@mui/material";
import { useState } from "react";
import { adminPlansQueryDocument } from "@/frontend/graphql/sharedDocuments/billing";
import { PlanCatalogHeader, PlanCatalogTable } from "@/frontend/views/admin/plans/catalog";
import { PlanStatusConfirmDialog } from "@/frontend/views/admin/plans/dialogs/PlanStatusConfirmDialog";
import { PlanFormDialog } from "@/frontend/views/admin/plans/forms/PlanFormDialog";
import { usePlanFormDialog } from "@/frontend/views/admin/plans/hooks/usePlanFormDialog";
import { usePlanStatusDialog } from "@/frontend/views/admin/plans/hooks/usePlanStatusDialog";

export function PlanCatalogContainer(): React.ReactElement {
  // Queries
  const {
    data,
    loading,
    error: queryError,
    refetch,
  } = useQuery(adminPlansQueryDocument, {
    variables: { includeInactive: true },
    fetchPolicy: "cache-and-network",
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dialog orchestration
  const formDialog = usePlanFormDialog({ refetch, onSuccess: setToastMessage });
  const statusDialog = usePlanStatusDialog({ onSuccess: setToastMessage });

  const plans = data?.adminPlans ?? [];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Page Header */}
      <PlanCatalogHeader onCreateNew={formDialog.handleOpenCreate} />

      {/* Query Error Alert */}
      {queryError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {queryError.message}
        </Alert>
      )}

      {/* Catalog Table */}
      <PlanCatalogTable
        plans={plans}
        loading={loading}
        actionLoadingId={statusDialog.actionLoadingId}
        onEdit={formDialog.handleOpenEdit}
        onToggleStatus={statusDialog.handleOpenStatus}
        onCreateNew={formDialog.handleOpenCreate}
      />

      {/* Create / Edit Form Dialog */}
      <PlanFormDialog
        open={formDialog.formOpen}
        plan={formDialog.selectedPlanForEdit}
        loading={formDialog.formLoading}
        globalError={formDialog.formGlobalError}
        onClose={formDialog.handleCloseForm}
        onSubmit={formDialog.handleFormSubmit}
      />

      {/* Status Confirmation Dialog */}
      <PlanStatusConfirmDialog
        open={statusDialog.statusOpen}
        plan={statusDialog.selectedPlanForStatus}
        targetActive={statusDialog.targetActive}
        loading={statusDialog.statusLoading}
        error={statusDialog.statusError}
        onClose={statusDialog.handleCloseStatus}
        onConfirm={statusDialog.handleStatusConfirm}
      />

      {/* Feedback Toast */}
      <Snackbar
        open={Boolean(toastMessage)}
        autoHideDuration={4000}
        onClose={() => setToastMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setToastMessage(null)} sx={{ width: "100%" }}>
          {toastMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
}
