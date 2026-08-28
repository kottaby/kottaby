/**
 * Plans namespace labels — subscription plan catalog management.
 *
 * Used by:
 *  - Admin plans catalog page (`/admin/plans`)
 *  - Create/edit plan dialogs
 *  - Status confirmation dialogs
 *  - Admin sidebar navigation
 */
export interface PlansLabels {
  readonly pageTitle: string;
  readonly pageSubtitle: string;
  readonly createPlanButton: string;
  readonly editPlanButton: string;
  readonly activatePlanButton: string;
  readonly deactivatePlanButton: string;
  readonly activeStatus: string;
  readonly inactiveStatus: string;
  readonly titleColumn: string;
  readonly sessionCountColumn: string;
  readonly priceColumn: string;
  readonly currencyColumn: string;
  readonly intervalDaysColumn: string;
  readonly statusColumn: string;
  readonly createdAtColumn: string;
  readonly deactivatedAtColumn: string;
  readonly actionsColumn: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly createPlanDialogTitle: string;
  readonly editPlanDialogTitle: string;
  readonly titleFieldLabel: string;
  readonly titleFieldPlaceholder: string;
  readonly sessionCountFieldLabel: string;
  readonly priceFieldLabel: string;
  readonly currencyFieldLabel: string;
  readonly intervalDaysFieldLabel: string;
  readonly cancelButton: string;
  readonly saveButton: string;
  readonly savingButton: string;
  readonly confirmDeactivateTitle: string;
  readonly confirmDeactivateMessage: string;
  readonly confirmReactivateTitle: string;
  readonly confirmReactivateMessage: string;
  readonly confirmButton: string;
  readonly createSuccessToast: string;
  readonly updateSuccessToast: string;
  readonly statusChangeSuccessToast: string;
  readonly navPlans: string;
}
