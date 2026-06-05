/**
 * VoiceAgentProvider — abstraction over the voice runtime so we can swap
 * ElevenLabs ConvAI for Vapi / Synthflow / Retell / our own stack later.
 *
 * Per `CLAUDE.md`: voice runtime is abstracted behind THIS interface in
 * `packages/contracts/`. ElevenLabs today, swappable to another provider
 * tomorrow without touching the orchestration / scraper / web layers.
 *
 * The interface is intentionally narrow — only operations we actually call
 * during onboarding, mid-call (server tools), and post-call. Provider-specific
 * runtime config (voice id, LLM choice, prompt template) is opaque to callers
 * and lives behind `provisionAgent`'s `tenantConfig`.
 */

export type SupportedLanguage = "pl" | "en" | "ru";

export interface ProvisionAgentInput {
  tenantId: string;
  tenantDisplayName: string;
  /** Provider-side IDs of knowledge documents already uploaded. */
  knowledgeBaseDocumentIds: string[];
  /** Public URL where this provider should POST tool calls. */
  serverToolBaseUrl: string;
  /** Public URL where this provider should POST the post-call webhook. */
  postCallWebhookUrl: string;
  /** Optional overrides; provider applies sensible defaults if omitted. */
  voiceId?: string;
  defaultLanguage?: SupportedLanguage;
  /** Optional verbatim system prompt. If absent, provider builds a default
   *  template. Pass when the wizard let the user review/edit the prompt
   *  before provisioning. */
  systemPromptOverride?: string;
  /** Attach booking tools (check_availability/create_booking). Default FALSE:
   *  demo deployments have no calendar integration — the agent explains the
   *  demo limitation instead of calling a tool. Flip to true only when a real
   *  calendar provider is wired for the tenant. */
  bookingEnabled?: boolean;
}

export interface ProvisionAgentResult {
  /** Provider-side agent identifier. Stored in our `agents` table. */
  agentId: string;
  /** URL the browser test widget connects to (signed URL or public agent URL). */
  browserTestUrl: string;
}

export interface UpdateAgentKnowledgeInput {
  agentId: string;
  /** Replaces the agent's full KB document list. Idempotent. */
  knowledgeBaseDocumentIds: string[];
}

export interface UploadKnowledgeDocumentInput {
  /** Tenant scoping — providers may namespace internally. */
  tenantId: string;
  /** Display name shown in provider dashboard. */
  name: string;
  /** Document body, markdown. */
  markdown: string;
}

export interface UploadKnowledgeDocumentResult {
  /** Provider-side document identifier. */
  documentId: string;
}

export interface DeleteAgentInput {
  agentId: string;
}

/**
 * The minimal contract every voice runtime adapter must satisfy.
 *
 * Implementations live in `apps/backend/orchestration/`:
 *   - ElevenLabsConvAIProvider (W2.2 — Day 8-9)
 *   - (future) VapiProvider, SynthflowProvider, etc.
 */
export interface VoiceAgentProvider {
  uploadKnowledgeDocument(
    input: UploadKnowledgeDocumentInput,
  ): Promise<UploadKnowledgeDocumentResult>;
  provisionAgent(input: ProvisionAgentInput): Promise<ProvisionAgentResult>;
  updateAgentKnowledge(input: UpdateAgentKnowledgeInput): Promise<void>;
  deleteAgent(input: DeleteAgentInput): Promise<void>;
}
