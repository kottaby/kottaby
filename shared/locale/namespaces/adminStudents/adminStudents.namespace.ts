import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { AdminStudentsLabels } from "@/shared/locale/types/adminStudents";

export const AdminStudents = defineNamespace<AdminStudentsLabels>(
  "adminStudents.adminStudents",
  translations => translations.adminStudentsTranslations
);
