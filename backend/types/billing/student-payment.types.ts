import type { studentPayments } from "@/backend/db/schema/billing/student-payments";
import type { PaymentGateway } from "@/backend/enum/billing/payment-gateway.enum";
import type { PaymentStatus } from "@/backend/enum/billing/payment-status.enum";

export type StudentPaymentSelectType = typeof studentPayments.$inferSelect;
export type StudentPaymentInsertType = typeof studentPayments.$inferInsert;

/**
 * Canonical GraphQL/API read shape for a student payment row.
 *
 * Derived from the table's select row with the lifecycle columns re-typed
 * to their canonical TypeScript enums (the raw `$inferSelect` projection
 * carries the pgEnum string-literal unions). `amount` stays the Drizzle
 * decimal projection — a decimal string; money is never a number here.
 */
export type StudentPaymentReturnType = Omit<StudentPaymentSelectType, "status" | "paymentGateway"> & {
  status: PaymentStatus;
  paymentGateway: PaymentGateway;
};
