import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { createRoleDashboardPage, roleDashboardMetadata } from "@/frontend/views/dashboard/home/server";

export async function generateMetadata(): Promise<Metadata> {
  return roleDashboardMetadata();
}

export default function TeacherDashboardPage() {
  return createRoleDashboardPage(UserRole.Teacher, "/teacher/dashboard");
}
