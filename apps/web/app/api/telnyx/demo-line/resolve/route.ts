import { type NextRequest } from "next/server";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import { gatherPinTexml, dialSipTexml, goodbyeTexml, MAX_PIN_ATTEMPTS } from "@/lib/texml";
import { verifyTelnyxSignature } from "@/lib/verify-telnyx-signature";
import { pickAgentByPin, type LineAssignment } from "@/lib/resolve-demo-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Second leg of the PIN IVR: Telnyx posts the gathered Digits here.
 * Hit  → <Dial><Sip> to the clinic agent's virtual EL identifier.
 * Miss → re-<Gather> up to MAX_PIN_ATTEMPTS, then goodbye + hangup.
 * Same replay scope note as the sibling route.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const base = baseUrl(req);
  const sig = verifyTelnyxSignature(
    rawBody,
    req.headers.get("telnyx-signature-ed25519"),
    req.headers.get("telnyx-timestamp"),
  );
  if (!sig.ok) return xml(goodbyeTexml(base), 403);

  const params = new URLSearchParams(rawBody);
  const digits = params.get("Digits") ?? "";
  const to = params.get("To") ?? "";
  const attempt = Number(req.nextUrl.searchParams.get("attempt") ?? "1") || 1;

  const supabase = getServiceRoleSupabase();
  const { data: line } = await supabase
    .from("phone_lines")
    .select("id, mode")
    .eq("e164", to)
    .eq("status", "active")
    .maybeSingle();
  if (!line) {
    console.log("demo-line: no active line for dialed number");
    return xml(goodbyeTexml(base));
  }

  const { data: rows } = await supabase
    .from("phone_line_agents")
    .select("agent_id, el_virtual_e164, agents(provider_agent_id, pin_code)")
    .eq("phone_line_id", line.id);

  const assignments: LineAssignment[] = (rows ?? []).map((r) => {
    const agent = Array.isArray(r.agents) ? r.agents[0] : r.agents;
    return {
      agentId: r.agent_id as string,
      providerAgentId: (agent?.provider_agent_id as string) ?? "",
      pinCode: (agent?.pin_code as string | null) ?? null,
      elVirtualE164: (r.el_virtual_e164 as string | null) ?? null,
    };
  });

  const match = pickAgentByPin(assignments, digits);
  if (match) {
    console.log(`demo-line: PIN hit → agent ${match.providerAgentId}`);
    return xml(dialSipTexml({ virtualE164: match.elVirtualE164!, pin: digits }));
  }
  if (attempt >= MAX_PIN_ATTEMPTS) return xml(goodbyeTexml(base));
  return xml(gatherPinTexml({ baseUrl: base, attempt: attempt + 1 }));
}

function baseUrl(req: NextRequest): string {
  return process.env.DEMO_LINE_BASE_URL ?? new URL(req.url).origin;
}

function xml(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}
