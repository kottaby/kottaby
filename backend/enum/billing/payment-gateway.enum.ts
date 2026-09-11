/**
 * PaymentGateway enum — mirrors the `payment_gateway` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 * NOTE: order matters — stripe, paypal, paymob, fawry, offline_cash,
 * bank_transfer, scholarship, other, mock.
 * `mock` records payments processed by the built-in mock gateway so dev
 * purchases stay distinguishable from real `other` payments in the
 * ledger.
 */
export enum PaymentGateway {
  Stripe = "stripe",
  Paypal = "paypal",
  Paymob = "paymob",
  Fawry = "fawry",
  OfflineCash = "offline_cash",
  BankTransfer = "bank_transfer",
  Scholarship = "scholarship",
  Other = "other",
  Mock = "mock",
}
