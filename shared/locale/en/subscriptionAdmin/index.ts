import type { SubscriptionAdminLabels } from "@/shared/locale/types/subscriptionAdmin";

export const subscriptionAdminEn: SubscriptionAdminLabels = {
  title: "Subscriptions",
  emptyState: {
    title: "No subscriptions",
    message: "This student has no subscription records yet.",
  },
  fields: {
    plan: "Plan",
    status: "Status",
    start: "Start",
    end: "End",
  },
  status: {
    active: "Active",
    expired: "Expired",
    pending: "Pending",
    cancelled: "Cancelled",
    suspended: "Suspended",
  },
  actions: {
    extend: "Extend",
    renew: "Renew",
    cancel: "Cancel",
    changePlan: "Change plan",
  },
  extend: {
    title: "Extend subscription",
    daysLabel: "Days to add",
    daysHelper: "Added to the period's current end date.",
    daysInvalid: "Enter a whole number of days greater than zero.",
  },
  renew: {
    title: "Renew subscription",
    message:
      "Renewing opens a fresh active period on this subscription's plan and credits the student's session balance for the plan's full session count.",
  },
  cancel: {
    title: "Cancel subscription",
    message: "Cancelling ends this subscription while leaving the student's session balances untouched.",
    reasonLabel: "Reason (optional)",
    reasonHelper: "Up to 200 characters, recorded in the audit trail.",
  },
  changePlan: {
    title: "Change plan",
    message:
      "The current subscription is cancelled and a fresh period opens on the selected plan. Only active plans crediting the same balance lane are eligible.",
    planLabel: "New plan",
    noPlans: "No other active plan credits the same balance lane.",
    carried: carry => `Plan changed — ${carry} session(s) carried over onto the new plan.`,
    forfeited: forfeit => `Plan changed — ${forfeit} remaining session(s) on the old plan were forfeited.`,
  },
  success: {
    extend: days => `Subscription extended by ${days} day(s).`,
    renew: "Subscription renewed — a fresh period is now active.",
    cancel: "Subscription cancelled. Session balances were left unchanged.",
    planChangeCarried: carry => `Plan changed — ${carry} session(s) carried over.`,
    planChangeForfeited: forfeit => `Plan changed — ${forfeit} remaining session(s) forfeited.`,
  },
  errorState: {
    title: "Could not load subscriptions",
    message: "Something went wrong while loading this student's subscriptions.",
    retry: "Retry",
  },
  genericError: "Something went wrong. Please try again.",
};
