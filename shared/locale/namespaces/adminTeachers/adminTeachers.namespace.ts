import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { AdminTeachersLabels } from "@/shared/locale/types/adminTeachers";

export const AdminTeachers = defineNamespace<AdminTeachersLabels>(
  "adminTeachers.adminTeachers",
  translations => translations.adminTeachersTranslations
);
