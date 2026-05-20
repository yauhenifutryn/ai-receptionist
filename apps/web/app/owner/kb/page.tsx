import { redirect } from "next/navigation";
import { getUserSupabase } from "@/lib/supabase-server";
import KbEditor from "./kb-editor";

export const dynamic = "force-dynamic";

/**
 * Owner KB editor.
 *
 * Resolves the user's tenant → agent's provider_agent_id, then fetches the
 * current KB markdown from ElevenLabs server-side (so the initial render
 * has the content baked in and edits are immediate).
 *
 * The KB lives in ElevenLabs as a knowledge_base document, not in our DB.
 * The operator's initial import (Firecrawl-scraped + consolidated) populates
 * it; owner can then refine/correct/extend.
 */
export default async function Page() {
  const supabase = await getUserSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/sign-in");

  // The /owner layout has already enforced tenant_members membership.
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/auth/access-pending");

  const { data: agent } = await supabase
    .from("agents")
    .select("provider_agent_id")
    .eq("tenant_id", membership.tenant_id)
    .limit(1)
    .maybeSingle();

  // We never call EL server-side here — KbEditor fetches via /api/owner/kb
  // on mount. Keeps the page render fast and avoids a server-side EL hop
  // every navigation.
  const hasAgent = Boolean(agent?.provider_agent_id);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Knowledge base</h1>
        <p className="text-sm text-neutral-500">
          What the receptionist tells callers about your clinic — services, prices, doctors, hours,
          FAQs. Edited as markdown. Changes apply on the next call.
        </p>
      </header>

      {hasAgent ? (
        <KbEditor />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Your receptionist isn&apos;t fully set up yet. The operator team needs to provision your
          agent first — once that&apos;s done you&apos;ll be able to edit your knowledge base here.
        </div>
      )}
    </main>
  );
}
