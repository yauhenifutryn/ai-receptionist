import Link from "next/link";
import type { Route } from "next";
import { headers } from "next/headers";
import { requireOperator } from "@/lib/supabase-server";
import AgentSettingsPanel from "./agent-settings-panel";
import AgentManagementPanel from "./agent-management-panel";
import ConversationStatsStrip from "./conversation-stats-strip";
import ELAnalysisStatusCard from "./el-analysis-status-card";
import DemoAccessPanel from "./demo-access-panel";
import OwnerInvitePanel from "./owner-invite-panel";
import PhoneNumberPanel from "./phone-number-panel";
import PhoneLinePanel from "./phone-line-panel";
import TestAgentClient from "./test-client";

interface PageProps {
  params: Promise<{ agentId: string }>;
}

export default async function TestAgentPage({ params }: PageProps) {
  const { agentId } = await params;

  const { supabase } = await requireOperator({
    redirectPath: `/test/${agentId}`,
  });
  const { data: agentRow } = await supabase
    .from("agents")
    .select("phone_number, pin_code, tenant:tenants(display_name, source_url)")
    .eq("provider_agent_id", agentId)
    .maybeSingle();

  const tenants = Array.isArray(agentRow?.tenant) ? agentRow?.tenant[0] : agentRow?.tenant;
  const tenantDisplayName: string = tenants?.display_name ?? "—";
  const tenantSourceUrl: string | null = tenants?.source_url ?? null;

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-2">
        <Link
          href={"/dashboard" as Route}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 transition hover:text-neutral-900"
        >
          <span aria-hidden>←</span> All agents
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {tenantDisplayName}
          </h1>
          <span className="font-mono text-xs text-neutral-400">{agentId}</span>
        </div>
        {tenantSourceUrl ? (
          <a
            href={tenantSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1.5 font-mono text-xs text-neutral-500 transition hover:text-neutral-900"
          >
            <span aria-hidden>↗</span> {tenantSourceUrl}
          </a>
        ) : (
          <span className="font-mono text-xs text-neutral-300">no source url</span>
        )}
      </header>
      <ConversationStatsStrip agentId={agentId} />
      <ELAnalysisStatusCard providerAgentId={agentId} />
      <AgentSettingsPanel providerAgentId={agentId} />
      <DemoAccessPanel
        providerAgentId={agentId}
        initialPin={agentRow?.pin_code ?? null}
        origin={origin}
      />
      <PhoneNumberPanel
        providerAgentId={agentId}
        existingPhoneNumber={agentRow?.phone_number ?? null}
      />
      <PhoneLinePanel providerAgentId={agentId} pinCode={agentRow?.pin_code ?? null} />
      <OwnerInvitePanel agentId={agentId} />
      <AgentManagementPanel providerAgentId={agentId} tenantDisplayName={tenantDisplayName} />
      <TestAgentClient agentId={agentId} />
    </div>
  );
}
