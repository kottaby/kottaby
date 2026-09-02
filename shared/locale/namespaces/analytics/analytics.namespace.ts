import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { AnalyticsLabels } from "@/shared/locale/types/analytics";

export const Analytics = defineNamespace<AnalyticsLabels>(
  "analytics.analytics",
  translations => translations.analyticsTranslations
);
