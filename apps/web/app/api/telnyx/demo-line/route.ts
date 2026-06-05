import { type NextRequest } from "next/server";
import { gatherPinTexml, goodbyeTexml, MAX_PIN_ATTEMPTS } from "@/lib/texml";
import { verifyTelnyxSignature } from "@/lib/verify-telnyx-signature";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Telnyx TeXML voice webhook — first leg of the demo-line PIN IVR.
 * Telnyx POSTs application/x-www-form-urlencoded (CallSid, From, To, ...).
 * We answer with <Gather> wrapping an EL-voiced bilingual prompt.
 *
 * Replay scope (accepted): a captured signed request can be replayed for up
 * to the verifier's 300s skew window; the replayer only receives XML text and
 * cannot affect the live call (Telnyx acts only on responses it fetched
 * itself). At demo scale, with signature + rate limits, no CallSid dedup.
 *
 * No PII in logs: caller number is masked to last 3 digits.
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
  const from = params.get("From") ?? "unknown";
  // 15/hr shared with the resolve route — see the rationale comment there.
  const limited = checkRateLimit({
    key: `demo-line:${from}`,
    maxAttempts: 15,
    windowSec: 3600,
  });
  if (!limited.allowed) {
    console.warn(`demo-line: rate-limited caller ***${from.slice(-3)}`);
    return xml(goodbyeTexml(base));
  }

  const rawAttempt = Number(req.nextUrl.searchParams.get("attempt") ?? "1");
  const attempt =
    Number.isFinite(rawAttempt) && rawAttempt >= 1
      ? Math.min(Math.ceil(rawAttempt), MAX_PIN_ATTEMPTS + 1)
      : 1;
  if (attempt > MAX_PIN_ATTEMPTS) return xml(goodbyeTexml(base));
  return xml(gatherPinTexml({ baseUrl: base, attempt }));
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
