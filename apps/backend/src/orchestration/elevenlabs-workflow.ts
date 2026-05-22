/**
 * EL ConvAI agent workflow definitions.
 *
 * Why this file exists: prompt-level rules ("ask consent before booking") are
 * advisory — the LLM might skip them. EL workflows are structural — the
 * conversation literally cannot proceed past a node without the configured
 * forward_condition evaluating true. We use this to enforce RODO consent as
 * a graph gate before the main conversational agent ever runs.
 *
 * Schema source: https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows
 * Schema cross-checked via Context7 against the POST /v1/convai/agents/{id}/drafts
 * request body shape (WorkflowOverrideAgentNodeModel + edge forward_condition
 * variants).
 *
 * Architecture (consent-gate workflow):
 *
 *   start_node
 *     │ (unconditional)
 *     ▼
 *   consent_subagent  ─── llm:"caller agreed" ──► main_subagent ──── llm:"call done" ──► end_node
 *     │
 *     └─ llm:"caller declined or ambiguous" ─► consent_refused_subagent ─► end_node
 *
 *   - start_node + end_node are EL primitives.
 *   - consent_subagent: override_agent node. additional_prompt narrows the
 *     agent to a single job — ask the consent question verbatim, wait for the
 *     caller's reply, do nothing else. The main prompt's full personality is
 *     preserved underneath, the additional_prompt just adds the "ask THIS,
 *     stop after one user turn" instruction at the top of the stack.
 *   - main_subagent: override_agent with empty additional_prompt — runs the
 *     full main system prompt (Michał, language mirroring, booking flow).
 *   - consent_refused_subagent: override_agent that politely acknowledges,
 *     no booking actions, then transitions to end.
 *
 * Edge LLM conditions are evaluated by EL's classifier against the caller's
 * last turn. They're natural-language descriptions, multilingual examples
 * inline so the classifier resolves PL/EN/RU equally.
 */

export interface WorkflowDefinition {
  nodes: Record<string, WorkflowNode>;
  edges: Record<string, WorkflowEdge>;
  prevent_subagent_loops?: boolean;
}

export type WorkflowNode =
  | StartNode
  | EndNode
  | OverrideAgentNode
  | StandaloneAgentNode;

interface StartNode {
  type: "start";
  position?: { x: number; y: number };
  edge_order?: string[];
}

interface EndNode {
  type: "end";
  position?: { x: number; y: number };
}

interface OverrideAgentNode {
  type: "override_agent";
  label: string;
  position?: { x: number; y: number };
  edge_order?: string[];
  /** Stacked on top of the main agent prompt. Empty string = no override. */
  additional_prompt?: string;
  /** Optional config overrides applied while this subagent is running. */
  conversation_config?: Record<string, unknown>;
  additional_knowledge_base?: Array<{ id: string; name?: string; type?: string }>;
  additional_tool_ids?: string[];
}

interface StandaloneAgentNode {
  type: "standalone_agent";
  position?: { x: number; y: number };
  edge_order?: string[];
  agent_id?: string;
  delay_ms?: number;
  transfer_message?: string | null;
}

export interface WorkflowEdge {
  source: string;
  target: string;
  forward_condition: ForwardCondition;
}

export type ForwardCondition =
  | { type: "unconditional" }
  | { type: "llm"; condition: string }
  | { successful: boolean }
  | { condition: string };

/**
 * Consent-gate workflow shared by every clinic agent. Same nodes + edges
 * regardless of tenant — tenant-specific behavior comes from the main agent
 * prompt that sits underneath the override_agent nodes.
 *
 * The consent_subagent's additional_prompt is multilingual: it tells the
 * agent to ask the consent question in whichever language the caller spoke
 * in. The language-mirror rule in the main system prompt covers everything
 * after the gate — but on the gate itself we duplicate the rule so the
 * subagent has clear local guidance.
 */
export const CONSENT_GATE_WORKFLOW: WorkflowDefinition = {
  prevent_subagent_loops: false,
  nodes: {
    start_node: {
      type: "start",
      position: { x: 0, y: 0 },
      edge_order: ["start_to_consent"],
    },
    consent_subagent: {
      type: "override_agent",
      label: "Consent gate",
      position: { x: 300, y: 0 },
      edge_order: ["consent_yes", "consent_no"],
      additional_prompt: [
        "WORKFLOW NODE: CONSENT GATE.",
        "Your only job in this node is to ask the consent question once and wait for the caller's reply. After one user turn you MUST stop — do not continue the conversation, do not ask for a name, do not call any tool. Routing to the next node is handled by the workflow engine based on the caller's reply.",
        "",
        "Step 1 — identify the language the caller spoke in their last turn.",
        "Step 2 — ask the consent question verbatim in that language:",
        "  - Polish: \"Czy zgadza się Pan / Pani na zachowanie zapisu tej rozmowy w celu poprawy jakości obsługi? Nagranie głosu nigdy nie jest przechowywane.\"",
        "  - English: \"Do you consent to a transcript of this call being kept for service-quality purposes? Voice audio is never stored regardless.\"",
        "  - Russian: \"Согласны ли вы на сохранение записи этого разговора для улучшения качества обслуживания? Голосовая запись не сохраняется в любом случае.\"",
        "Step 3 — wait for the caller's reply, then STOP. Do not ack, do not say anything else. The workflow routes based on the reply.",
        "",
        "Do NOT re-greet, do NOT introduce yourself again — the first_message already did that.",
        "Do NOT proceed to booking, do NOT ask for a name, do NOT call tools — those happen only after this gate passes.",
      ].join("\n"),
    },
    main_subagent: {
      type: "override_agent",
      label: "Main receptionist",
      position: { x: 600, y: -100 },
      edge_order: ["main_to_end"],
      additional_prompt: [
        "WORKFLOW NODE: MAIN CONVERSATION.",
        "Consent has been captured (the workflow routed you here because the caller said yes). You DO NOT re-ask consent. You DO NOT re-disclose AI status. Acknowledge briefly if natural, then proceed with normal reception duties per your main system prompt: identify need, answer KB-grounded questions, check availability, book the slot, confirm.",
        "When the caller's goal is achieved and the conversation has naturally concluded, the workflow will route to the end node.",
      ].join("\n"),
    },
    consent_refused_subagent: {
      type: "override_agent",
      label: "Consent refused",
      position: { x: 600, y: 100 },
      edge_order: ["refused_to_end"],
      additional_prompt: [
        "WORKFLOW NODE: CONSENT REFUSED.",
        "The caller declined or did not clearly agree to the transcript-retention consent. Acknowledge politely once in their language, offer to help WITHOUT recording any transcript, and end the call gracefully after the next user turn.",
        "Polish: \"Rozumiem, nie zachowam zapisu rozmowy. W czym mogę krótko pomóc?\"",
        "English: \"Understood, I won't keep a transcript. How can I briefly help you?\"",
        "Russian: \"Понял, запись сохранять не буду. Чем могу коротко помочь?\"",
        "Do NOT call create_booking — bookings require consent. If the caller wants to book, say they need to call back during clinic hours, or that you can take a quick message for the reception to call back. Then end politely.",
      ].join("\n"),
    },
    end_node: {
      type: "end",
      position: { x: 900, y: 0 },
    },
  },
  edges: {
    start_to_consent: {
      source: "start_node",
      target: "consent_subagent",
      forward_condition: { type: "unconditional" },
    },
    consent_yes: {
      source: "consent_subagent",
      target: "main_subagent",
      forward_condition: {
        type: "llm",
        condition: [
          "The caller's last turn was an affirmative answer to the consent question.",
          "Affirmative replies in PL: 'tak', 'tak, zgadzam się', 'oczywiście', 'okej', 'dobrze', 'nie mam nic przeciwko', 'proszę bardzo'.",
          "Affirmative replies in EN: 'yes', 'sure', 'of course', 'okay', 'go ahead', 'that's fine', 'no problem'.",
          "Affirmative replies in RU: 'да', 'конечно', 'согласен', 'согласна', 'хорошо', 'не возражаю'.",
          "Pick this branch ONLY for clear affirmative replies. Ambiguity, hesitation, or silence should pick the other branch.",
        ].join(" "),
      },
    },
    consent_no: {
      source: "consent_subagent",
      target: "consent_refused_subagent",
      forward_condition: {
        type: "llm",
        condition: [
          "The caller's last turn was negative, ambiguous, off-topic, or silent — anything other than a clear affirmative.",
          "Negative replies in PL: 'nie', 'nie zgadzam się', 'nie chcę', 'wolałbym nie', 'proszę nie nagrywać'.",
          "Negative replies in EN: 'no', 'I don't consent', 'please don't', 'I'd rather not', 'no thanks'.",
          "Negative replies in RU: 'нет', 'не согласен', 'не согласна', 'не хочу'.",
          "Also pick this branch for hedged replies ('nie wiem', 'może później', 'I don't know'), silence, or off-topic answers. Default-deny when in doubt.",
        ].join(" "),
      },
    },
    main_to_end: {
      source: "main_subagent",
      target: "end_node",
      forward_condition: {
        type: "llm",
        condition:
          "The conversation has naturally concluded — booking confirmed and caller said goodbye, OR caller's question was answered and they have no further questions, OR escalation was completed.",
      },
    },
    refused_to_end: {
      source: "consent_refused_subagent",
      target: "end_node",
      forward_condition: { type: "unconditional" },
    },
  },
};
