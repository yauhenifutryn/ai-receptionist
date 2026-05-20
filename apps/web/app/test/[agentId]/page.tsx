import { headers } from "next/headers";
import { requireOperator } from "@/lib/supabase-server";
import AgentSettingsPanel from "./agent-settings-panel";
import AgentManagementPanel from "./agent-management-panel";
import ConversationStatsStrip from "./conversation-stats-strip";
import DemoAccessPanel from "./demo-access-panel";
import OwnerInvitePanel from "./owner-invite-panel";
import PhoneNumberPanel from "./phone-number-panel";
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
    .select("phone_number, pin_code, tenant:tenants(display_name)")
    .eq("provider_agent_id", agentId)
    .maybeSingle();

  const tenants = Array.isArray(agentRow?.tenant)
    ? agentRow?.tenant[0]
    : agentRow?.tenant;
  const tenantDisplayName: string = tenants?.display_name ?? "—";

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  return (
    <div className="flex flex-col gap-8">
      <ConversationStatsStrip agentId={agentId} />
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
      <OwnerInvitePanel agentId={agentId} />
      <AgentManagementPanel
        providerAgentId={agentId}
        tenantDisplayName={tenantDisplayName}
      />
      <TestAgentClient agentId={agentId} />
    </div>
  );
}
