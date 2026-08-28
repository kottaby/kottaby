/**
 * FR-2.6 (REQ-014): number of free trial sessions granted once to each newly
 * registered student.
 *
 * This is the single source of truth for the trial session count — never
 * duplicate this value as a literal elsewhere. Imported by the backend
 * provisioning service and (future) frontend dashboard badges.
 *
 * INV-B7: the grant happens at most once per student record, enforced by the
 * `trialGrantedAt` marker column + a guarded conditional UPDATE.
 */
export const FREE_TRIAL_SESSION_COUNT = 1 as const;

/**
 * The valid student balance lanes (INV-B1/B5). Trial is segregated from paid
 * intent lanes. Used by the eligibility + decrement contracts (REQ-020/021).
 */
export const BALANCE_LANES = [
  "balanceTrial",
  "balanceHifz",
  "balanceTajweed",
  "balanceReviews",
] as const;

export type BalanceLane = (typeof BALANCE_LANES)[number];

/**
 * The paid intent lanes (INV-B5). Trial is NOT in this list — it is a
 * segregated, non-subscription-bound lane (INV-B3 does not apply to trial).
 */
export const PAID_LANES: BalanceLane[] = [
  "balanceHifz",
  "balanceTajweed",
  "balanceReviews",
];
