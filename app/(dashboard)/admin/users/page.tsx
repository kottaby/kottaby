import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { AdminUsersDirectoryContainer } from "@/frontend/views/admin/users/directory";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * `/admin/users` — the admin user directory.
 *
 * Server Component:
 *  1. `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/users" })`
 *     — verifies the caller is an admin. Anonymous → redirect to login;
 *     role mismatch → redirect to the caller's role dashboard.
 *  2. Renders the client container label-free — the container resolves its
 *     own `AdminUsers` namespace client-side because the namespace carries
 *     interpolation closures that cannot cross the server→client props
 *     boundary (the server render of a client component may call them
 *     locally, serialized props may not carry them).
 *
 * The container is a client component because the directory uses Apollo
 * `useQuery`/`useMutation` hooks for live data + optimistic updates.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).adminUsersTranslations;
  return { title: t.title };
}

export default async function AdminUsersPage(): Promise<React.ReactElement> {
  await withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/users" });
  return <AdminUsersDirectoryContainer />;
}
