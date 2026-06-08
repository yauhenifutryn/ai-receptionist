import { type NextRequest } from "next/server";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import {
  gatherPinTexml,
  dialSipTexml,
  goodbyeTexml,
  limitReachedTexml,
  MAX_PIN_ATTEMPTS,
} from "@/lib/texml";
import { verifyTelnyxSignature } from "@/lib/verify-telnyx-signature";
import { pickAgentByPin, type LineAssignment } from "@/lib/resolve-demo-pin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDemoBudgetStatus, createSupabaseDemoBudgetReader } from "@/lib/demo-budget";

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
  const rawAttempt = Number(req.nextUrl.searchParams.get("attempt") ?? "1");
  const attempt =
    Number.isFinite(rawAttempt) && rawAttempt >= 1
      ? Math.min(Math.ceil(rawAttempt), MAX_PIN_ATTEMPTS + 1)
      : 1;

  // Rate-limit: both the initial route (route.ts) and this resolve route share the
  // same "demo-line:${from}" bucket intentionally — one funnel. A normal successful
  // call costs 2 hourly tokens (1 initial POST + 1 resolve POST). 15/hr ≈ 7 full
  // demo calls per hour: enough for a prospect re-dialing and retrying PINs
  // (2026-06-05: the original 5/hr locked out the founder mid-test), while PIN
  // brute force stays bounded at ~21 guesses/hr against a 1M namespace.
  const from = params.get("From") ?? "unknown";
  const limited = checkRateLimit({
    key: `demo-line:${from}`,
    maxAttempts: 15,
    windowSec: 3600,
  });
  if (!limited.allowed) {
    console.warn(`demo-line: rate-limited caller ***${from.slice(-3)}`);
    return xml(goodbyeTexml(base));
  }

  const supabase = getServiceRoleSupabase();
  const { data: line, error: lineErr } = await supabase
    .from("phone_lines")
    .select("id, mode")
    .eq("e164", to)
    .eq("status", "active")
    .maybeSingle();
  if (lineErr) {
    // DB outage must not masquerade as "unknown number" — log code only (no PII).
    console.error("demo-line: phone_lines query error", lineErr.code);
    return xml(goodbyeTexml(base));
  }
  if (!line) {
    console.log("demo-line: no active line for dialed number");
    return xml(goodbyeTexml(base));
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("phone_line_agents")
    .select("agent_id, el_virtual_e164, agents(provider_agent_id, pin_code)")
    .eq("phone_line_id", line.id);
  if (rowsErr) {
    console.error("demo-line: phone_line_agents query error", rowsErr.code);
    return xml(goodbyeTexml(base));
  }

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
    // Per-clinic demo minute budget: a correct PIN still refuses to <Dial>
    // once this agent has used its 30 min, so one clinic cannot drain the
    // shared EL credit pool. Fail-open: any error allows the call through.
    let overBudget = false;
    try {
      const status = await getDemoBudgetStatus(
        createSupabaseDemoBudgetReader(supabase),
        match.providerAgentId,
      );
      overBudget = status.overBudget;
      if (overBudget) {
        console.warn(
          `demo-line: minute budget exhausted → agent ${match.providerAgentId} ` +
            `(${status.usedSeconds}/${status.budgetSeconds}s)`,
        );
      }
    } catch (e) {
      console.error("demo-line: budget check failed (allowing call)", (e as Error).message);
    }
    if (overBudget) return xml(limitReachedTexml(base));
    console.log(`demo-line: PIN hit → agent ${match.providerAgentId}`);
    return xml(dialSipTexml({ virtualE164: match.elVirtualE164!, pin: digits }));
  }
  if (attempt >= MAX_PIN_ATTEMPTS) return xml(goodbyeTexml(base));
  return xml(gatherPinTexml({ baseUrl: base, attempt: attempt + 1 }));
}

function baseUrl(req: NextRequest): string {
  const envBase = process.env.DEMO_LINE_BASE_URL;
  if (envBase) return envBase;
  const origin = new URL(req.url).origin;
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    // Behind Vercel's proxy the request origin is not the public hostname;
    // TeXML audio/callback URLs built from it will be unreachable by Telnyx.
    console.error("demo-line: DEMO_LINE_BASE_URL unset in production; TeXML URLs likely broken");
  }
  return origin;
}

function xml(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}
