import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { AdminUserDetailContainer } from "@/frontend/views/admin/users/detail";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * `/admin/users/[id]` — the admin user detail page.
 *
 * Server Component:
 *  1. `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/users" })`.
 *  2. Renders the client container label-free — the container resolves its
 *     own `AdminUsers` namespace client-side because the namespace carries
 *     interpolation closures that cannot cross the server→client props
 *     boundary (the server render of a client component may call them
 *     locally, serialized props may not carry them).
 *
 * The container uses `useQuery(adminUserDetailQueryDocument)` for the live
 * detail row; a `USER_NOT_FOUND` response renders a localized not-found
 * section with a back-to-directory CTA.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).adminUsersTranslations;
  return { title: t.detailTitle };
}

interface AdminUserDetailPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps): Promise<React.ReactElement> {
  await withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/users" });
  const { id } = await params;
  return <AdminUserDetailContainer userId={Number(id)} />;
}
