import type { ApplicantLabels } from "@/shared/locale/types/applicant";

export const applicantEn: ApplicantLabels = {
  statusPending: "Pending evaluation",
  statusInEvaluation: "In evaluation",
  statusFailed: "Failed",
  statusPassed: "Passed",
  statusCardTitle: "Application Status",
  pendingPrompt:
    "Your application is registered. Purchase your verification sessions whenever you are ready to begin the evaluation.",
  attemptCountLabel: "Verification attempts",
  cooldownExpiryLine: "You can re-apply after {cooldownUntil}.",
  eligibleToReapply: "Your waiting period has ended — you are now eligible to re-apply for teacher verification.",
  reapplyCta: "Re-apply",
  certifiedSummary: "Your teacher verification is complete. You are certified to teach Qur'an recitation.",
  certifiedSurfacesHint: "All teaching surfaces are now open for you in the dashboard menu.",
  inEvaluationHint: "Your evaluation covers five recitation sessions before a decision is made.",
  coldStartCertifiedTitle: "Your Teacher Certification Is Complete",
  coldStartCertifiedBody:
    "Congratulations — you are now a certified Qur'an teacher. All teaching surfaces are now open for you in the dashboard.",
  purchaseDialogTitle: "Purchase Verification Plan",
  purchaseDialogDescription:
    "Review the plan below. Your verification evaluation starts as soon as the purchase is confirmed.",
  purchasePlanLine: (title, price, currency, sessions, days) =>
    `${title}: ${price} ${currency} — ${sessions} sessions over ${days} days`,
  purchaseCta: "Purchase",
  purchaseConfirmCta: "Confirm Purchase",
  purchaseCancelCta: "Cancel",
  purchaseSuccess: "Purchase completed. Your application is now in evaluation.",
  purchaseGenericError: "The purchase could not be completed. Please try again.",
  purchaseDuplicateInfo: "This purchase request was already received.",
};
