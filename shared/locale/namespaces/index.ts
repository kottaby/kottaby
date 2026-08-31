import { Applicant } from "@/shared/locale/namespaces/applicant";
import { Auth } from "@/shared/locale/namespaces/auth";
import { Common } from "@/shared/locale/namespaces/common";
import { Dashboard } from "@/shared/locale/namespaces/dashboard";
import { Errors } from "@/shared/locale/namespaces/errors";
import { Landing } from "@/shared/locale/namespaces/landing";
import { Recitation } from "@/shared/locale/namespaces/recitation";
import { Sessions } from "@/shared/locale/namespaces/sessions";
import { Wallet } from "@/shared/locale/namespaces/wallet";

export * from "./applicant";
export * from "./auth";
export * from "./common";
export * from "./dashboard";
export * from "./define-namespace";
export * from "./errors";
export * from "./landing";
export * from "./recitation";
export * from "./sessions";
export * from "./translation";
export * from "./wallet";

export const namespaces = {
  Applicant,
  Auth,
  Common,
  Dashboard,
  Errors,
  Landing,
  Recitation,
  Sessions,
  Wallet,
} as const;
