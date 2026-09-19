import type { SubscriptionAdminLabels } from "@/shared/locale/types/subscriptionAdmin";

/** The plain plan-change success line — the suppressed zero-count form. */
const PLAN_CHANGE_PLAIN = "Plan changed.";

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
    reasonCounter: (count, max) => `${count}/${max} — Up to ${max} characters, recorded in the audit trail.`,
  },
  changePlan: {
    title: "Change plan",
    message:
      "The current subscription is cancelled and a fresh period opens on the selected plan. Only active plans crediting the same balance lane are eligible.",
    planLabel: "New plan",
    noPlans: "No other active plan credits the same balance lane.",
    carried: carry => {
      if (carry === 0) return PLAN_CHANGE_PLAIN;
      return carry === 1
        ? "Plan changed — 1 session carried over onto the new plan."
        : `Plan changed — ${carry} sessions carried over onto the new plan.`;
    },
    forfeited: forfeit => {
      if (forfeit === 0) return PLAN_CHANGE_PLAIN;
      return forfeit === 1
        ? "Plan changed — 1 remaining session on the old plan was forfeited."
        : `Plan changed — ${forfeit} remaining sessions on the old plan were forfeited.`;
    },
  },
  success: {
    extend: days => (days === 1 ? "Subscription extended by 1 day." : `Subscription extended by ${days} days.`),
    renew: "Subscription renewed — a fresh period is now active.",
    cancel: "Subscription cancelled. Session balances were left unchanged.",
    planChange: PLAN_CHANGE_PLAIN,
    planChangeCarried: carry => {
      if (carry === 0) return PLAN_CHANGE_PLAIN;
      return carry === 1 ? "Plan changed — 1 session carried over." : `Plan changed — ${carry} sessions carried over.`;
    },
    planChangeForfeited: forfeit => {
      if (forfeit === 0) return PLAN_CHANGE_PLAIN;
      return forfeit === 1
        ? "Plan changed — 1 remaining session forfeited."
        : `Plan changed — ${forfeit} remaining sessions forfeited.`;
    },
  },
  errorState: {
    title: "Could not load subscriptions",
    message: "Something went wrong while loading this student's subscriptions.",
    retry: "Retry",
  },
  genericError: "Something went wrong. Please try again.",
};
