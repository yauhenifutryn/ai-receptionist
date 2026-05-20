import { notFound } from "next/navigation";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import TestAgentClient from "../../test/[agentId]/test-client";

interface PageProps {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ pin?: string }>;
}

export const revalidate = 0;

/**
 * Public PIN-gated demo route. Sebastian emails prospects:
 *   https://<domain>/demo/agent_xxx?pin=4242
 *
 * Server-side PIN check against agents.pin_code. If the PIN is wrong,
 * we 404 (not 401 — never confirm the agent exists to an unauthorized caller).
 * No operator session required; the proxy.ts middleware whitelists /demo/*
 * (it's not in GATED_PREFIXES).
 */
export default async function PublicDemoPage({ params, searchParams }: PageProps) {
  const { agentId } = await params;
  const { pin } = await searchParams;

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    notFound();
  }
  if (!/^agent_[A-Za-z0-9]+$/.test(agentId)) {
    notFound();
  }

  const sb = getServiceRoleSupabase();
  const { data, error } = await sb
    .from("agents")
    .select("id, pin_code, tenants(display_name)")
    .eq("provider_agent_id", agentId)
    .maybeSingle();
  if (error || !data || data.pin_code !== pin) {
    notFound();
  }

  const tenants = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
  const clinicName: string = tenants?.display_name ?? "Twoja klinika";

  return (
    <main className="mx-auto max-w-md px-6 py-10 font-sans">
      <header className="mb-6 text-center">
        <p className="text-sm uppercase tracking-wider text-neutral-500">Demo</p>
        <h1 className="mt-2 text-2xl font-semibold">{clinicName}</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Kliknij niżej i porozmawiaj po polsku z asystentem AI. Spróbuj umówić wizytę.
        </p>
      </header>
      <div className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600">
        <p className="font-semibold text-neutral-800">Wskazówka:</p>
        <p className="mt-1">
          Asystent zapyta o Twój numer telefonu — podyktuj go, a po zakończeniu rozmowy wyślemy Ci
          prawdziwe SMS-owe potwierdzenie. Możesz też powiedzieć „bez SMS-a", żeby przetestować
          tylko głos.
        </p>
      </div>
      <TestAgentClient agentId={agentId} />
    </main>
  );
}
