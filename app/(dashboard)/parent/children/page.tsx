import type { Metadata } from "next";
import { generateComingSoonMetadata } from "@/app/(dashboard)/shared";
import { ComingSoonView } from "@/frontend/views/dashboard";

/**
 * `/parent/children` — role-scoped alias of the `/children` "coming soon"
 * stub (the parent sidebar nav points at `/children`, which the
 * `(dashboard)/[feature]` catch-all already serves).
 *
 * Deep links / bookmarks pointing at the role-scoped path previously fell
 * through to a bare 404 because the single-segment catch-all cannot match
 * two-segment URLs. Rendering the same `ComingSoonView` here keeps the
 * dashboard shell (sidebar + footer) around the placeholder, exactly like
 * `/children`.
 */
export async function generateMetadata(): Promise<Metadata> {
  return generateComingSoonMetadata();
}

export default function ParentChildrenComingSoonPage() {
  return <ComingSoonView feature="children" />;
}
