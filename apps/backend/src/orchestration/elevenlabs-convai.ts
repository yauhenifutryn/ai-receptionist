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

/**
 * ElevenLabs ConvAI implementation of the VoiceAgentProvider contract.
 *
 * - Voice ID defaults to mr1ubFaLs5xVrh1EqWtc (Polish-native multilingual,
 *   locked in CLAUDE.md + AI-SPEC).
 * - Privacy hardened at provisioning per RODO: audio recording OFF,
 *   call data retention 0 days. Workspace-level "use for training" toggle
 *   must be flipped OFF in the EL UI (cannot be done via API).
 * - Agent in-call LLM defaults to qwen36-35b-a3b (~223ms latency,
 *   ~$0.0023/min — ultra-low-latency tier on ElevenLabs). Two-tool surface
 *   (check_availability + create_booking) is well within its agentic
 *   capability. Fallback if Polish quality disappoints: claude-haiku-4-5
 *   (~676ms, ~$0.0075/min, Anthropic Polish quality known-good).
 */

export const DEFAULT_VOICE_ID = "mr1ubFaLs5xVrh1EqWtc";
export const DEFAULT_AGENT_LLM = "qwen36-35b-a3b";
export const DEFAULT_AGENT_TEMPERATURE = 0.3;
export const DEFAULT_BASE_URL = "https://api.elevenlabs.io";

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
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.doFetch = opts.fetcher ?? fetch;
    this.agentLlm = opts.agentLlm ?? DEFAULT_AGENT_LLM;
    this.defaultVoiceId = opts.defaultVoiceId ?? DEFAULT_VOICE_ID;
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

  async provisionAgent(
    input: ProvisionAgentInput,
  ): Promise<ProvisionAgentResult> {
    const voiceId = input.voiceId ?? this.defaultVoiceId;
    const language = input.defaultLanguage ?? "pl";
    const systemPrompt =
      input.systemPromptOverride ??
      buildSystemPrompt({
        tenantDisplayName: input.tenantDisplayName,
      });

    const body = await this.request<{ agent_id?: string; id?: string }>(
      "POST",
      "/v1/convai/agents/create",
      {
        name: `${input.tenantDisplayName} - receptionist`,
        conversation_config: {
          agent: {
            prompt: {
              prompt: systemPrompt,
              llm: this.agentLlm,
              temperature: DEFAULT_AGENT_TEMPERATURE,
              tools: [
                {
                  type: "webhook",
                  name: "check_availability",
                  description:
                    "List up to 5 appointment slots for a service category.",
                  url: `${input.serverToolBaseUrl}/tools/check-availability`,
                  method: "POST",
                },
                {
                  type: "webhook",
                  name: "create_booking",
                  description:
                    "Create a booking after the caller confirms a slot.",
                  url: `${input.serverToolBaseUrl}/tools/create-booking`,
                  method: "POST",
                },
              ],
              knowledge_base: input.knowledgeBaseDocumentIds.map((documentId) => ({
                document_id: documentId,
                usage_mode: "auto",
              })),
            },
            language,
          },
          tts: {
            voice_id: voiceId,
            stability: 0.45,
            similarity_boost: 0.75,
          },
          asr: {
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
        },
      },
    );

    const agentId = body.agent_id ?? body.id;
    if (!agentId) {
      throw new Error("ElevenLabs provisionAgent returned no agent id");
    }
    return {
      agentId,
      browserTestUrl: `https://elevenlabs.io/app/conversational-ai/agents/${agentId}`,
    };
  }

  async updateAgentKnowledge(input: UpdateAgentKnowledgeInput): Promise<void> {
    await this.request("PATCH", `/v1/convai/agents/${input.agentId}`, {
      conversation_config: {
        agent: {
          prompt: {
            knowledge_base: input.knowledgeBaseDocumentIds.map((documentId) => ({
              document_id: documentId,
              usage_mode: "auto",
            })),
          },
        },
      },
    });
  }

  async deleteAgent(input: DeleteAgentInput): Promise<void> {
    await this.request("DELETE", `/v1/convai/agents/${input.agentId}`);
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
