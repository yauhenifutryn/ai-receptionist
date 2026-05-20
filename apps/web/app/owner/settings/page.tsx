import { redirect } from "next/navigation";
import { getUserSupabase } from "@/lib/supabase-server";
import SmsToggleCard from "./sms-toggle-card";

export const dynamic = "force-dynamic";

/**
 * Owner settings page. Currently a single panel: SMS confirmations toggle.
 *
 * Sprint scope keeps this page narrow on purpose — anything that would make
 * the agent itself misbehave (LLM, prompts, KB shape) does not live here.
 * That stuff stays on the operator surface. Settings page is patient-facing
 * preferences only.
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-neutral-500">
          Patient-facing preferences for your receptionist. Changes apply immediately to new
          bookings.
        </p>
      </header>
      <SmsToggleCard />
    </main>
  );
}
