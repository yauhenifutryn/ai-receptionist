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
 * The agent's persona name. Used in the opening message so the caller hears
 * a named entity rather than the abstract "asystent AI". Matches the
 * personality section of the system prompt where Michał is established.
 */
export const AGENT_PERSONA_NAME = "Michał";

/**
 * Opening turn the agent speaks the moment a call connects. Combines:
 *   1. AI disclosure (required by EU AI Act limited-risk transparency).
 *   2. Persona introduction (Michał, named to make the agent feel like a
 *      person rather than an interface — operator's "soul" requirement).
 *   3. Tenant identity (so the caller knows which clinic answered).
 *   4. Open prompt for the caller to state their need.
 *
 * 2026-05-22 (Option B consent pivot): the in-call consent question was
 * removed. Transcript retention now relies on Article 6(1)(f) legitimate
 * interest + a clinic-website notice next to the published phone number.
 * Original opener with consent question lives in git history if a partner
 * later demands the strict gate back.
 *
 * Polish only here because Polish is the default greeting language. The
 * language-mirror rule in the system prompt covers EN/RU switching after
 * the caller's first turn.
 */
export function buildOpeningMessage(tenantDisplayName: string): string {
  return `Dzień dobry, jestem ${AGENT_PERSONA_NAME}, asystent sztucznej inteligencji w ${tenantDisplayName}. W czym mogę pomóc?`;
}

/**
 * EN/RU openers used by `language_presets`: when the language_detection
 * system tool switches the conversation language, EL swaps the first_message
 * (and TTS language mode) to the preset. These mirror the trilingual greeting
 * lines already baked into the system prompt's Goal section.
 */
export function buildOpeningMessageEn(tenantDisplayName: string): string {
  return `Hello, this is ${AGENT_PERSONA_NAME}, the AI assistant at ${tenantDisplayName}. How can I help?`;
}

export function buildOpeningMessageRu(tenantDisplayName: string): string {
  return `Здравствуйте, я Михаил, AI-ассистент клиники ${tenantDisplayName}. Чем могу помочь?`;
}

/**
 * Default guardrails for every provisioned agent (EL Guardrails, Alpha):
 * focus + prompt-injection on; all content categories on EXCEPT
 * medical_and_legal_information (a dental receptionist legitimately discusses
 * medical-adjacent content — that category would false-positive on core
 * conversations); demo agents additionally get the custom "no-fake-bookings"
 * tripwire (streaming + end_call: retry-mode requires blocking execution,
 * which gates every spoken turn on the guardrail verdict — too slow for
 * voice).
 */
export function buildGuardrails(bookingEnabled: boolean): Record<string, unknown> {
  const contentCategory = { is_enabled: true, threshold: "medium" };
  return {
    version: "1",
    focus: { is_enabled: true },
    prompt_injection: { is_enabled: true },
    content: {
      execution_mode: "streaming",
      config: {
        sexual: contentCategory,
        violence: contentCategory,
        harassment: contentCategory,
        self_harm: contentCategory,
        profanity: contentCategory,
        religion_or_politics: contentCategory,
        medical_and_legal_information: { is_enabled: false, threshold: "medium" },
      },
      trigger_action: { type: "end_call" },
    },
    custom: {
      config: {
        configs: bookingEnabled
          ? []
          : [
              {
                is_enabled: true,
                name: "no-fake-bookings",
                prompt:
                  "Violation: the agent states or implies that an appointment has been successfully booked, rescheduled, or cancelled, or reads out a booking confirmation. The agent is a demo with no calendar access — when asked to book it must explain that limitation instead. Explaining the demo limitation is NOT a violation.",
                execution_mode: "streaming",
                trigger_action: { type: "end_call" },
              },
            ],
      },
    },
  };
}

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
// 2026-06-05 SEMANTIC re-bench (6 models × 20 sims, every transcript human-read
// — docs/engineering/llm-bakeoff-2026-06-05.md). This REVERSED the earlier
// regex-scored verdict: flash-lite (previous pick) never named the requested
// doctor, quoted the children's hygiene price to adults, and phrased answers
// mechanically (matched live-call complaints). gemini-2.5-flash was the ONLY
// model with zero fact errors and clean honest deflections; qwen397 fabricated
// a price bound once (disqualifying), haiku promised callbacks it can't make
// + costs 10x, gpt-5.4-mini mixes PL/RU inside sentences (unspeakable by TTS).
// Console: flash ~776ms / $0.0230/min. Re-run the bench before changing;
// EL test suite (EL_DEFAULT_TEST_IDS) is the gate.
export const DEFAULT_AGENT_LLM = "gemini-2.5-flash";
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

// 2026-06-05 latency audit: with rag.enabled=false EL stuffs ALL attached KB
// docs (~88k chars for Dynasty) into the prompt EVERY turn — ~30k tokens of
// prefill, measured +1s LLM TTFB on every model tested. RAG retrieval costs
// ~0.15s and cuts the per-turn prompt to the retrieved chunks. Multilingual
// embedder: Russian/English callers query Polish KB text (a RU hygiene-price
// retrieval miss reproduced until this embedder + a KB-structure fix landed).
// Chunk count 12: at 6 the doctor-name fact lost its retrieval slot; 20 (EL
// default) showed no measured TTFB gain over 12.
export const RAG_EMBEDDING_MODEL = "multilingual_e5_large_instruct";
export const RAG_MAX_CHUNKS = 12;

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

// 2026-05-22: ontology reduced to reference-only RAG documents (terminology +
// classification rules). scripts.md and consent.md were demoted out of the
// RAG attachment set — both lived as behaviour scripts that overlapped with
// the system prompt and risked drifting the agent off-policy at retrieval
// time. Order must match the env CSV ELEVENLABS_ONTOLOGY_KB_DOC_IDS produced
// by `upload-ontology.ts`.
const ONTOLOGY_DOC_NAMES = [
  "ontology/services.md",
  "ontology/triage.md",
  "ontology/emergency-keywords.md",
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
    // Build the RAG index immediately so agents provisioned with this doc can
    // retrieve from it (rag.enabled=true is the provisioning default since the
    // 2026-06-05 latency audit). Non-fatal: the index computes asynchronously
    // server-side; we poll briefly and warn instead of failing the upload.
    try {
      await this.request("POST", `/v1/convai/knowledge-base/${documentId}/rag-index`, {
        model: RAG_EMBEDDING_MODEL,
      });
      for (let i = 0; i < 12; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const status = await this.request<{
          indexes?: Array<{ model?: string; status?: string }>;
        }>("GET", `/v1/convai/knowledge-base/${documentId}/rag-index`);
        const idx = (status.indexes ?? []).find((x) => x.model === RAG_EMBEDDING_MODEL);
        if (idx?.status === "succeeded") break;
        if (idx?.status === "failed") {
          console.warn(`[elevenlabs] RAG index failed for ${documentId}`);
          break;
        }
      }
    } catch (e) {
      console.warn(`[elevenlabs] RAG indexing skipped for ${documentId}: ${(e as Error).message}`);
    }
    return { documentId };
  }

  async provisionAgent(input: ProvisionAgentInput): Promise<ProvisionAgentResult> {
    const voiceId = input.voiceId ?? this.defaultVoiceId;
    const language = input.defaultLanguage ?? "pl";
    const bookingEnabled = input.bookingEnabled ?? false;
    // Workspace-level EL test ids (comma-separated) attached to every new
    // agent. Created 2026-06-05: no-booking-claim, EN mirror, no-invented-
    // price, emergency-escalation.
    const defaultTestIds = (process.env.EL_DEFAULT_TEST_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const systemPrompt =
      input.systemPromptOverride ??
      buildSystemPrompt({
        tenantDisplayName: input.tenantDisplayName,
        bookingEnabled,
      });

    // Workspace tool catalog: ensure the two booking tools exist (create if
    // missing) and grab their ids. EL ignores inline `prompt.tools` now, so
    // ids are the only attachment mechanism that actually binds tools.
    // Demo deployments (bookingEnabled false) get NO tools: a tool call
    // against a dead webhook killed a live call (2026-06-05 incident), and
    // the demo prompt explains the limitation instead.
    let toolIds: string[] = [];
    if (bookingEnabled) {
      const catalog = new ElevenLabsToolsCatalog({
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        fetcher: this.doFetch,
      });
      const { checkAvailabilityId, createBookingId } = await catalog.ensureBookingTools(
        input.serverToolBaseUrl,
      );
      toolIds = [checkAvailabilityId, createBookingId];
    }

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
            // Opening turn: greeting + AI disclosure + Michał identity +
            // tenant + open "W czym mogę pomóc?". The AI disclosure must
            // arrive before any caller turn (EU AI Act). 2026-05-22 (Option
            // B consent pivot): consent question removed from the opener;
            // see buildOpeningMessage above.
            first_message: buildOpeningMessage(input.tenantDisplayName),
            // 2026-05-22: caller MUST be able to interrupt the opener.
            // The earlier `true` guard was paired with the consent-gate
            // architecture (caller had to hear the full question before
            // replying). With the gate dropped, blocking interrupts only
            // adds friction. EL field documented under
            // conversation_config.agent.disable_first_message_interruptions.
            disable_first_message_interruptions: false,
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
              // Empty in demo mode (bookingEnabled false).
              tool_ids: toolIds,
              // language_detection system tool: switches the conversation
              // language (TTS/ASR mode) when the caller changes language,
              // instead of relying purely on prompt-level mirroring. Added
              // 2026-06-05 after a live call drifted into Russian unprompted.
              built_in_tools: {
                language_detection: { name: "language_detection", description: "" },
              },
              // RAG ON (2026-06-05 latency audit) — see RAG_EMBEDDING_MODEL
              // comment. rag.enabled=false silently prompt-stuffs every
              // attached doc, costing ~1s of LLM TTFB per turn.
              rag: {
                enabled: true,
                embedding_model: RAG_EMBEDDING_MODEL,
                max_retrieved_rag_chunks_count: RAG_MAX_CHUNKS,
              },
            },
            language,
          },
          // Per-language openers consumed by language_detection switches.
          language_presets: {
            en: {
              overrides: {
                agent: { first_message: buildOpeningMessageEn(input.tenantDisplayName) },
                tts: null,
              },
            },
            ru: {
              overrides: {
                agent: { first_message: buildOpeningMessageRu(input.tenantDisplayName) },
                tts: null,
              },
            },
          },
          tts: {
            // flash_v2_5 — same model EL's voice preview uses for Polish
            // multilingual. Lowest first-byte latency in the multilingual
            // family. expressive_mode false + no audio tags = the voice's
            // natural register.
            //
            // 2026-05-22 calibration locked stability 0.7 / similarity 0.8.
            // 2026-06-05 latency audit: speed 0.9 → 1.0 — the "unhurried"
            // register read as sluggish on real phone calls once response
            // latency was fixed; founder ear-test preferred 1.0. Streaming
            // latency optimization maxed (4) for the same reason.
            model_id: DEFAULT_TTS_MODEL_ID,
            voice_id: voiceId,
            expressive_mode: false,
            suggested_audio_tags: [],
            stability: 0.7,
            similarity_boost: 0.8,
            speed: 1.0,
            optimize_streaming_latency: 4,
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
          // 2026-06-05 latency audit: turn_v2 intermittently fails to detect
          // end-of-speech on the SIP path and falls back to turn_timeout —
          // measured 8s dead-air gaps that matched the founder's "5-7s"
          // complaint exactly (LLM+TTS were <1s in the same turns). 3s caps
          // the worst case; eager fires detection sooner. Pilot note: 3s may
          // talk over very slow elderly speakers — consider 4-5s per-clinic.
          turn: { turn_timeout: 3, mode: "turn", turn_eagerness: "eager" },
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
          // Guardrails (Alpha) — see buildGuardrails for the rationale on
          // category choices and execution modes.
          guardrails: buildGuardrails(bookingEnabled),
          // Regression tests (EL agent testing). Workspace test ids come from
          // env so code stays workspace-agnostic; empty/unset = none attached.
          ...(defaultTestIds.length > 0
            ? { testing: { attached_tests: defaultTestIds.map((id) => ({ test_id: id })) } }
            : {}),
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
  async updateAgentTools(input: { agentId: string; serverToolBaseUrl: string }): Promise<void> {
    const catalog = new ElevenLabsToolsCatalog({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      fetcher: this.doFetch,
    });
    const { checkAvailabilityId, createBookingId } = await catalog.ensureBookingTools(
      input.serverToolBaseUrl,
    );
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
