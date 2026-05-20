import { ELAnalysisHelp } from "./el-analysis-help";

/**
 * Operator-side hint card showing whether the ElevenLabs agent has
 * evaluation criteria configured. Surfaces the gap between "we plumbed
 * the analysis pipeline" and "the EL dashboard has criteria authored",
 * because criteria are configured in EL's UI (no API) and silently
 * default to none.
 *
 * Path probed in EL agent JSON: `platform_settings.evaluation.criteria`
 * (verified 2026-05-20 against agent_3101krxkms8eepdr8ycf626krdss).
 * Empty array = not configured. Length > 0 = configured.
 *
 * Server component: reads ELEVENLABS_API_KEY server-side, never ships
 * the key to the client.
 */
export default async function ELAnalysisStatusCard({
  providerAgentId,
}: {
  providerAgentId: string;
}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <CardHeader />
        <p className="mt-3 text-sm text-neutral-600">
          ELEVENLABS_API_KEY not configured. Cannot probe analysis state.
        </p>
      </section>
    );
  }

  let criteriaCount: number | null = null;
  let fetchError: string | null = null;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(providerAgentId)}`,
      {
        method: "GET",
        headers: { "xi-api-key": apiKey },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      fetchError = `EL ${res.status}`;
    } else {
      const json = (await res.json()) as {
        platform_settings?: {
          evaluation?: {
            criteria?: unknown[];
          };
        };
      };
      const criteria = json.platform_settings?.evaluation?.criteria;
      criteriaCount = Array.isArray(criteria) ? criteria.length : 0;
    }
  } catch (e) {
    fetchError = (e as Error).message;
  }

  const configured = criteriaCount !== null && criteriaCount > 0;
  const elDashUrl = `https://elevenlabs.io/app/conversational-ai/agents/${providerAgentId}`;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <CardHeader />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {fetchError ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
            EL Analysis: probe failed ({fetchError})
          </span>
        ) : configured ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            EL Analysis: ✓ configured ({criteriaCount}{" "}
            {criteriaCount === 1 ? "criterion" : "criteria"})
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
            EL Analysis: not configured
          </span>
        )}
        <a
          href={elDashUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-neutral-700 underline decoration-dotted underline-offset-4 hover:text-neutral-900"
        >
          Configure in ElevenLabs →
        </a>
      </div>
      <ELAnalysisHelp />
    </section>
  );
}

function CardHeader() {
  return (
    <div>
      <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
        Evaluation criteria
      </div>
      <div className="mt-1 text-sm text-neutral-600">
        Auto-scoring of every call. Configured in ElevenLabs&apos; dashboard; results flow into{" "}
        <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px]">
          conversations.raw_jsonb.analysis
        </code>{" "}
        with no schema change on our side.
      </div>
    </div>
  );
}
