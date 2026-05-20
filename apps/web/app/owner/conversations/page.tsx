import { redirect } from "next/navigation";
import { getUserSupabase } from "@/lib/supabase-server";
import OwnerConversationsTable, {
  type OwnerConversationRow,
} from "./owner-conversations-table";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Owner conversations list.
 *
 * Reads the canonical `conversations` table directly via the user-scoped
 * Supabase client. RLS (`is_tenant_member`) gates rows to the signed-in
 * owner's tenant — no explicit tenant_id filter required. The /owner
 * layout has already verified the user has at least one tenant_members
 * row, but we still defend with a second-pass auth check here in case
 * a session expires between layout render and page render.
 *
 * Default filter: source ∈ {pstn, pin_demo}. The "Include internal QA
 * sessions" toggle on the client component flips ?includeBrowserTest=1
 * which dissolves the source filter (still RLS-gated).
 */
export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;
  const includeBrowserTest = sp.includeBrowserTest === "1";

  const supabase = await getUserSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/sign-in");

  let query = supabase
    .from("conversations")
    .select(
      "conversation_id, source, started_at, duration_seconds, caller_language, booked_booking_id",
    );

  if (!includeBrowserTest) {
    query = query.in("source", ["pstn", "pin_demo"]);
  }

  const { data, error } = await query
    .order("started_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as OwnerConversationRow[];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Conversations</h1>
        <p className="text-sm text-neutral-500">
          Calls handled by your AI receptionist. Includes real patient calls and demo sessions.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Failed to load conversations: {error.message}
        </div>
      ) : (
        <OwnerConversationsTable rows={rows} includeBrowserTest={includeBrowserTest} />
      )}
    </main>
  );
}
