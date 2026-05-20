import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getUserSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Owner shell. Async server component — gates the entire /owner subtree to
 * authenticated users who have at least one row in tenant_members. RLS scopes
 * the membership query to the current user, so tenant_id resolution is safe
 * without an explicit .eq("user_id", uid).
 *
 * Three-way redirect ladder:
 *   - No session → /auth/sign-in
 *   - Signed in but no tenant_members row → /auth/access-pending
 *   - Signed in with membership → render the owner UI
 *
 * The sign-out control is a POST <form>, not a <Link>. A GET <Link> here
 * prefetches and silently kills the session on every render — same bug we
 * already squashed on the operator dashboard.
 */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getUserSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/sign-in");

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, tenants(display_name)")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/auth/access-pending");

  const tenants = (membership as { tenants?: { display_name?: string | null } | { display_name?: string | null }[] | null })
    .tenants;
  const tenantRow = Array.isArray(tenants) ? tenants[0] : tenants;
  const clinic = tenantRow?.display_name ?? "Your clinic";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-500">Owner</p>
            <h1 className="text-lg font-semibold">{clinic}</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href={"/owner/conversations" as Route}
              className="text-neutral-700 hover:text-neutral-900"
            >
              Conversations
            </Link>
            <Link
              href={"/owner/bookings" as Route}
              className="text-neutral-700 hover:text-neutral-900"
            >
              Bookings
            </Link>
            <Link href={"/owner/kb" as Route} className="text-neutral-700 hover:text-neutral-900">
              KB
            </Link>
            <Link
              href={"/owner/voice" as Route}
              className="text-neutral-700 hover:text-neutral-900"
            >
              Voice
            </Link>
            <Link
              href={"/owner/settings" as Route}
              className="text-neutral-700 hover:text-neutral-900"
            >
              Settings
            </Link>
            <form method="post" action="/auth/sign-out">
              <button
                type="submit"
                className="text-neutral-500 hover:text-neutral-800"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="flex-1 bg-neutral-50">{children}</div>
    </div>
  );
}
