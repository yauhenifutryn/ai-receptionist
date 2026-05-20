import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOperatorOrJsonError, getServiceRoleSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTREACH_STATUSES = ["created", "audited", "contacted", "positive", "negative"] as const;

const BodySchema = z.object({
  status: z.enum(OUTREACH_STATUSES),
  notes: z.string().max(2000).optional(),
});

interface RouteParams {
  params: Promise<{ providerAgentId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return NextResponse.json(operator.body, { status: operator.status });
  }
  const { providerAgentId } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const sb = getServiceRoleSupabase();
  const update: Record<string, unknown> = {
    outreach_status: parsed.data.status,
    outreach_status_updated_at: new Date().toISOString(),
  };
  if (parsed.data.notes !== undefined) {
    update.outreach_notes = parsed.data.notes;
  }
  const { data, error } = await sb
    .from("agents")
    .update(update)
    .eq("provider_agent_id", providerAgentId)
    .select("provider_agent_id, outreach_status, outreach_status_updated_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    status: data.outreach_status,
    updatedAt: data.outreach_status_updated_at,
  });
}
