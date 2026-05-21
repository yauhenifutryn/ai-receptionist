import type {
  DeleteAgentInput,
  ProvisionAgentInput,
  ProvisionAgentResult,
  UpdateAgentKnowledgeInput,
  UploadKnowledgeDocumentInput,
  UploadKnowledgeDocumentResult,
  VoiceAgentProvider,
} from "@ai-receptionist/contracts";
import { buildSystemPrompt } from "../prompts/system-prompt.js";
import { ElevenLabsToolsCatalog } from "./elevenlabs-tools-catalog.js";

/**
 * ElevenLabs ConvAI implementation of the VoiceAgentProvider contract.
 *
 * - Voice ID defaults to mr1ubFaLs5xVrh1EqWtc (Polish-native multilingual,
 *   locked in CLAUDE.md + AI-SPEC).
 * - Privacy hardened at provisioning per RODO: audio recording OFF,
 *   call data retention 0 days. Workspace-level "use for training" toggle
 *   must be flipped OFF in the EL UI (cannot be done via API).
 * - Agent in-call LLM defaults to qwen36-35b-a3b (~223ms latency,
 *   ~$0.0023/min — ultra-low-latency tier on ElevenLabs). Fallback if Polish
 *   quality disappoints: claude-haiku-4-5
 *   (~676ms, ~$0.0075/min, Anthropic Polish quality known-good).
 */

export const DEFAULT_VOICE_ID = "mr1ubFaLs5xVrh1EqWtc";
export const DEFAULT_AGENT_LLM = "qwen36-35b-a3b";
export const DEFAULT_AGENT_TEMPERATURE = 0.3;
export const DEFAULT_BASE_URL = "https://api.elevenlabs.io";

// 2026-05-21: reverted from `eleven_v3_conversational` + expressive_mode +
// suggested_audio_tags. v3 expressive sounded "literary calm" in our demo
// (slower, over-modulated) compared to EL's native voice preview which uses
// flash_v2_5. v3 also adds ~200-400ms first-byte latency over flash. For a
// PSTN receptionist where latency drives interrupt-handling quality, flash
// is the right pick. Expressive mode + audio tags removed — they were the
// audible cause of the "calm in literature" register the user disliked.
export const DEFAULT_TTS_MODEL_ID = "eleven_flash_v2_5";

// Kept as an exported interface so older imports (backfill script, tests)
// don't break. We no longer ship any tags by default — the empty array is
// passed through to EL so the agent uses the voice's natural register.
export interface SuggestedAudioTag {
  tag: string;
  description?: string;
}
export const DEFAULT_AUDIO_TAGS: readonly SuggestedAudioTag[] = [];

// Post-call analysis LLM. Gemini 2.5 Flash is EL's current default per their
// changelog (2026-04-20). When Gemini 3 Flash Preview / 3.1 Flash Lite become
// stable, swap this constant.
export const DEFAULT_ANALYSIS_LLM = "gemini-2.5-flash";

// Default evaluation criteria seeded on every newly provisioned agent. The
// EL Analysis UI calls these "Evaluation criteria"; they run after every call
// and surface in the conversation history. Tuned for a Polish dental
// receptionist's job. Operators can edit/remove these in the EL UI later if
// they want a different rubric — these are sane defaults that we'd otherwise
// have to manually create for every agent.
interface EvaluationCriterion {
  id: string;
  name: string;
  type: "prompt";
  conversation_goal_prompt: string;
  use_knowledge_base: boolean;
}
export const DEFAULT_EVALUATION_CRITERIA: readonly EvaluationCriterion[] = [
  {
    id: "appointment_booked",
    name: "Appointment booked",
    type: "prompt",
    conversation_goal_prompt:
      "Did the agent successfully book an appointment with a specific date, time, and provider? Mark 'success' only if a booking was confirmed with a concrete slot. Mark 'failure' if the call ended without a confirmed slot when the patient was trying to book.",
    use_knowledge_base: false,
  },
  {
    id: "urgency_classified_correctly",
    name: "Urgency tier classified correctly",
    type: "prompt",
    conversation_goal_prompt:
      "Did the agent correctly classify the call's urgency as NAGŁY (emergency), PILNY (urgent), or PLANOWY (routine) based on the patient's symptoms? Mark 'success' if the tier matches the criteria in the triage ontology document. Mark 'failure' on dangerous misclassifications (e.g. emergency classified as routine).",
    use_knowledge_base: true,
  },
  {
    id: "stayed_in_scope",
    name: "Stayed in scope (no medical advice)",
    type: "prompt",
    conversation_goal_prompt:
      "Did the agent stay within scope and refuse to give medical advice, diagnoses, or prescription recommendations? Mark 'success' if the agent escalated medical questions to a human dentist. Mark 'failure' if the agent offered medical opinions, dosing instructions, or diagnostic conclusions.",
    use_knowledge_base: false,
  },
  {
    id: "patient_phone_captured",
    name: "Patient phone captured for SMS confirmation",
    type: "prompt",
    conversation_goal_prompt:
      "If a booking was made, did the agent capture or confirm a phone number for the SMS confirmation? Mark 'success' if the agent confirmed a number. Mark 'unknown' if no booking was attempted.",
    use_knowledge_base: false,
  },
  {
    id: "no_hallucinated_facts",
    name: "No invented clinic-specific facts",
    type: "prompt",
    conversation_goal_prompt:
      "Did the agent answer clinic-specific questions (prices, hours, doctors, NFZ status) using only information from the per-clinic knowledge base, OR explicitly say 'I don't know' when the KB lacked the answer? Mark 'failure' if the agent invented prices, doctor names, or specific clinic facts.",
    use_knowledge_base: true,
  },
];

// Default data-collection points pulled from every call. Same UX path as
// evaluation criteria in the EL Analysis UI. Tuned for the dental receptionist
// flow: what did the patient want, did booking happen, what was the urgency.
interface DataCollectionItem {
  type: "string" | "boolean" | "number" | "integer";
  description: string;
  rationale?: string;
}
export const DEFAULT_DATA_COLLECTION: Record<string, DataCollectionItem> = {
  reason_for_call: {
    type: "string",
    description:
      "The patient's stated reason for calling, in their own words (a short Polish phrase). Examples: 'umówienie konsultacji', 'silny ból zęba', 'odwołanie wizyty', 'pytanie o cenę implantu'.",
  },
  language_used: {
    type: "string",
    description:
      "The dominant language of the conversation: 'pl', 'en', or 'ru'. If the language switched mid-call, return the language the booking was confirmed in.",
  },
  urgency_tier: {
    type: "string",
    description:
      "Triage classification: 'NAGLY' (emergency), 'PILNY' (urgent), 'PLANOWY' (routine), or 'NIEOKREŚLONY' if the call did not involve triage. Match the criteria in the triage ontology.",
  },
  booking_outcome: {
    type: "string",
    description:
      "What happened with the booking: 'confirmed' (slot booked with date/time), 'failed' (patient wanted to book but no slot was confirmed), 'not_attempted' (patient was calling for something else), 'cancelled' (existing appointment cancelled), 'rescheduled' (existing appointment moved).",
  },
  service_requested: {
    type: "string",
    description:
      "The dental service the patient asked about, mapped to the closest H2 section in the services ontology (e.g. 'Implant zębowy', 'Higienizacja', 'Plomba / wypełnienie'). Use 'unknown' if not clear from the transcript.",
  },
  escalated_to_human: {
    type: "boolean",
    description:
      "Did the agent escalate the call or message to a human staff member? True if the agent said it would transfer or have someone call back; false otherwise.",
  },
};

/**
 * Read the ontology shared-KB document IDs from env. Set by running
 * `apps/backend/scripts/upload-ontology.ts` once and pasting the resulting
 * CSV into `ELEVENLABS_ONTOLOGY_KB_DOC_IDS`. Empty array means no ontology
 * (e.g. local dev without the env var); provisioning still works but the
 * agent loses the universal dental layer.
 */
export function readOntologyDocIds(): string[] {
  const csv = process.env.ELEVENLABS_ONTOLOGY_KB_DOC_IDS;
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const ONTOLOGY_DOC_NAMES = [
  "ontology/services.md",
  "ontology/triage.md",
  "ontology/scripts.md",
  "ontology/emergency-keywords.md",
  "ontology/consent.md",
];

// Tool definitions moved to `./elevenlabs-tools-catalog.ts` (TOOL_SPECS,
// buildToolSpecs). Background: EL deprecated inline `prompt.tools: [...]` in
// favor of a workspace catalog referenced by `prompt.tool_ids`. PATCHes with
// inline tools succeed (HTTP 200) but the field is silently dropped — agents
// then have no tool bindings. ElevenLabsToolsCatalog registers tools in the
// workspace once and returns ids for binding to agents.

export interface ElevenLabsConvAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  /** Override the agent's in-call LLM (default claude-sonnet-4-6). */
  agentLlm?: string;
  /** Override the default voice id. */
  defaultVoiceId?: string;
}

export class ElevenLabsConvAIProvider implements VoiceAgentProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private readonly agentLlm: string;
  private readonly defaultVoiceId: string;

  constructor(opts: ElevenLabsConvAIProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ElevenLabsConvAIProvider: ELEVENLABS_API_KEY missing");
    }
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.doFetch = opts.fetcher ?? fetch;
    this.agentLlm = opts.agentLlm ?? DEFAULT_AGENT_LLM;
    this.defaultVoiceId =
      opts.defaultVoiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  }

  async uploadKnowledgeDocument(
    input: UploadKnowledgeDocumentInput,
  ): Promise<UploadKnowledgeDocumentResult> {
    const body = await this.request<{ id?: string; document_id?: string }>(
      "POST",
      "/v1/convai/knowledge-base/text",
      {
        name: input.name,
        text: input.markdown,
      },
    );
    const documentId = body.id ?? body.document_id;
    if (!documentId) {
      throw new Error("ElevenLabs upload returned no document id");
    }
    return { documentId };
  }

  async provisionAgent(input: ProvisionAgentInput): Promise<ProvisionAgentResult> {
    const voiceId = input.voiceId ?? this.defaultVoiceId;
    const language = input.defaultLanguage ?? "pl";
    const systemPrompt =
      input.systemPromptOverride ??
      buildSystemPrompt({
        tenantDisplayName: input.tenantDisplayName,
      });

    // Workspace tool catalog: ensure the two booking tools exist (create if
    // missing) and grab their ids. EL ignores inline `prompt.tools` now, so
    // ids are the only attachment mechanism that actually binds tools.
    const catalog = new ElevenLabsToolsCatalog({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      fetcher: this.doFetch,
    });
    const { checkAvailabilityId, createBookingId } =
      await catalog.ensureBookingTools(input.serverToolBaseUrl);

    // Knowledge base wiring:
    //   - The ontology (5 files: services, triage, scripts, emergency-keywords,
    //     consent) lives at the WORKSPACE level, uploaded once via the
    //     `upload-ontology.ts` script. Doc IDs are in env. We attach the same
    //     IDs to every agent so callers benefit from the universal dental
    //     vertical layer without per-tenant duplication.
    //   - The per-tenant scraped knowledge is in `input.knowledgeBaseDocumentIds`.
    //   - Both layers go into `knowledge_base` array. The agent RAG-retrieves
    //     from all of them at query time; the system prompt instructs it to
    //     prefer per-tenant data when the two layers disagree on facts.
    const ontologyIds = readOntologyDocIds();
    const tenantKnowledgeEntries = input.knowledgeBaseDocumentIds.map((documentId) => ({
      type: "text" as const,
      id: documentId,
      name: `${input.tenantDisplayName} - knowledge`,
      usage_mode: "auto" as const,
    }));
    const ontologyEntries = ontologyIds.map((documentId, i) => ({
      type: "text" as const,
      id: documentId,
      name: ONTOLOGY_DOC_NAMES[i] ?? `ontology-${i}`,
      usage_mode: "auto" as const,
    }));

    const body = await this.request<{ agent_id?: string; id?: string }>(
      "POST",
      "/v1/convai/agents/create",
      {
        name: `${input.tenantDisplayName} - receptionist`,
        conversation_config: {
          agent: {
            // The agent speaks first when the call connects (otherwise it
            // waits silently for the caller to say something, which broke
            // user expectations in testing). Polish opener with AI
            // disclosure baked in so it's correct on the very first turn.
            first_message: `Dzień dobry, mówi asystent sztucznej inteligencji w ${input.tenantDisplayName}. W czym mogę pomóc?`,
            prompt: {
              prompt: systemPrompt,
              llm: this.agentLlm,
              temperature: DEFAULT_AGENT_TEMPERATURE,
              knowledge_base: [...tenantKnowledgeEntries, ...ontologyEntries],
              // Chat C (2026-05-20): booking tools attached via workspace
              // catalog tool_ids (NOT inline tools). EL deprecated the inline
              // form — PATCH returns 200 but the field is silently dropped.
              // Backend handlers at apps/backend/src/tools/{check-availability,
              // create-booking}.ts run against SimulatedCalendarProvider.
              tool_ids: [checkAvailabilityId, createBookingId],
            },
            language,
          },
          tts: {
            // flash_v2_5 — same model EL's voice preview uses for Polish
            // multilingual. Lowest first-byte latency in the multilingual
            // family. expressive_mode false + no audio tags = the voice's
            // natural register.
            //
            // 2026-05-22 calibration: stability 0.6 (slightly more consistent
            // than EL default 0.5 — reduces emotional variance call-to-call),
            // speed 0.95 (a touch slower than natural so older Polish callers
            // can follow without strain). EL's dashboard hides these sliders
            // for flash_v2_5 ("Using default", greyed out) but the API still
            // honours them — confirmed by PATCH + GET round-trip on Dynasty.
            model_id: DEFAULT_TTS_MODEL_ID,
            voice_id: voiceId,
            expressive_mode: false,
            suggested_audio_tags: [],
            stability: 0.6,
            similarity_boost: 0.75,
            speed: 0.95,
          },
          asr: {
            // `scribe_realtime` is ElevenLabs' streaming ASR (their newest):
            // lower perceived latency, better interrupt handling, stronger
            // Polish accuracy than the default turn-based engine. For a
            // phone receptionist where the caller's speech is the bottleneck
            // on response time, this is the right pick.
            provider: "scribe_realtime",
            quality: "high",
            user_input_audio_format: "pcm_16000",
          },
          turn: { turn_timeout: 7, mode: "turn" },
        },
        platform_settings: {
          privacy: {
            record_voice: false,
            store_call_audio: false,
            retain_call_data_days: 0,
          },
          webhook: {
            post_call_url: input.postCallWebhookUrl,
          },
          tenant_metadata: { tenant_id: input.tenantId },
          // Post-call analysis. analysis_llm picks the LLM that grades each
          // call against the evaluation criteria below. Default Gemini 2.5
          // Flash per EL changelog 2026-04-20; swap to Gemini 3 Flash Preview
          // when stable. evaluation.criteria seeds 5 dental-receptionist
          // rubrics; data_collection extracts structured fields from every
          // transcript. Operators can edit these in EL UI later.
          analysis_llm: DEFAULT_ANALYSIS_LLM,
          evaluation: {
            criteria: [...DEFAULT_EVALUATION_CRITERIA],
          },
          data_collection: DEFAULT_DATA_COLLECTION,
        },
      },
    );

    const agentId = body.agent_id ?? body.id;
    if (!agentId) {
      throw new Error("ElevenLabs provisionAgent returned no agent id");
    }

    // Coaching is enabled in a separate PATCH because coaching_settings.
    // memory_base_id must point to a real agent id, which we only know after
    // the create call. Coaching = the EL virtual coach reviews each call and
    // surfaces improvement suggestions (closed-loop refinement). type
    // "coached" enables it; memory_base_id pointing to the agent itself
    // means coaching memories accumulate per-agent rather than shared.
    try {
      await this.request("PATCH", `/v1/convai/agents/${agentId}`, {
        coaching_settings: {
          type: "coached",
          memory_base_id: agentId,
        },
      });
    } catch (e) {
      // Coaching is Alpha — if the API rejects, log but don't fail
      // provisioning. The agent works without coaching; we can retry via
      // backfill once the field is GA.
      console.warn(
        `[elevenlabs] coaching_settings PATCH failed for ${agentId}: ${(e as Error).message}`,
      );
    }

    return {
      agentId,
      browserTestUrl: `https://elevenlabs.io/app/conversational-ai/agents/${agentId}`,
    };
  }

  async updateAgentKnowledge(input: UpdateAgentKnowledgeInput): Promise<void> {
    // PATCH replaces knowledge_base entirely, so the ontology shared docs
    // MUST be re-attached on every update — otherwise editing per-tenant KB
    // would inadvertently strip the universal dental layer. Mirrors the
    // provisionAgent wiring exactly.
    const ontologyIds = readOntologyDocIds();
    const tenantEntries = input.knowledgeBaseDocumentIds.map((documentId) => ({
      type: "text" as const,
      id: documentId,
      name: documentId,
      usage_mode: "auto" as const,
    }));
    const ontologyEntries = ontologyIds.map((documentId, i) => ({
      type: "text" as const,
      id: documentId,
      name: ONTOLOGY_DOC_NAMES[i] ?? `ontology-${i}`,
      usage_mode: "auto" as const,
    }));

    await this.request("PATCH", `/v1/convai/agents/${input.agentId}`, {
      conversation_config: {
        agent: {
          prompt: {
            knowledge_base: [...tenantEntries, ...ontologyEntries],
          },
        },
      },
    });
  }

  async deleteAgent(input: DeleteAgentInput): Promise<void> {
    await this.request("DELETE", `/v1/convai/agents/${input.agentId}`);
  }

  /**
   * Refresh the tool bindings on an existing agent without re-provisioning.
   *
   * Chat C (2026-05-20): rewritten to use the workspace tool catalog. The old
   * implementation PATCHed `prompt.tools: [...]` inline — EL accepted (HTTP
   * 200) but silently dropped the field, leaving agents with no tool
   * bindings. Now: ensureBookingTools creates the tools in the workspace if
   * missing and returns their ids; PATCH attaches via `prompt.tool_ids`.
   *
   * Idempotent: repeated calls are safe — re-running against the same agent
   * with the same workspace state produces no creates and the same PATCH.
   */
  async updateAgentTools(input: {
    agentId: string;
    serverToolBaseUrl: string;
  }): Promise<void> {
    const catalog = new ElevenLabsToolsCatalog({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      fetcher: this.doFetch,
    });
    const { checkAvailabilityId, createBookingId } =
      await catalog.ensureBookingTools(input.serverToolBaseUrl);
    await this.request("PATCH", `/v1/convai/agents/${input.agentId}`, {
      conversation_config: {
        agent: {
          prompt: {
            tool_ids: [checkAvailabilityId, createBookingId],
          },
        },
      },
    });
  }

  private async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        "xi-api-key": this.apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    const res = await this.doFetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return (await res.json()) as T;
    }
    return undefined as T;
  }
}
