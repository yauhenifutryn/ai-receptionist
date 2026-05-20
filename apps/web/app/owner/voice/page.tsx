import { redirect } from "next/navigation";
import { getUserSupabase } from "@/lib/supabase-server";
import VoicePicker from "./voice-picker";

export const dynamic = "force-dynamic";

/**
 * Owner voice picker.
 *
 * Lists the curated set of ElevenLabs voices (premade + professional)
 * with the Polish-verified default at the top. Owners can change the
 * voice; nothing else about the agent is editable from this page.
 *
 * Non-Polish voices surface an amber warning card explaining accent
 * mismatch — same UX as the operator-side picker (Chat A 2026-05-20).
 */
export default async function Page() {
  const supabase = await getUserSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/sign-in");

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

  const hasAgent = Boolean(agent?.provider_agent_id);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Voice</h1>
        <p className="text-sm text-neutral-500">
          Pick the voice that callers hear when they reach your receptionist. The recommended
          default is hand-picked for Polish-native sound. Changes apply on the next call.
        </p>
      </header>

      {hasAgent ? (
        <VoicePicker />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Your receptionist isn&apos;t fully set up yet. The operator team needs to provision your
          agent first — once that&apos;s done you&apos;ll be able to pick a voice here.
        </div>
      )}
    </main>
  );
}
