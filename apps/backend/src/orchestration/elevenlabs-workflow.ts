/**
 * DEPRECATED 2026-05-22 (Option B consent pivot).
 *
 * This file defines the structural EL workflow that was attached to every
 * agent to enforce an in-call RODO consent gate. The gate was dropped on
 * 2026-05-22 in favor of the lighter compliance posture documented in
 * docs/plans/2026-05-22-option-b-consent-pivot.md: Article 6(1)(f) legitimate
 * interest + website notice for transcript retention, plus the agent's AI
 * disclosure on first turn for the EU AI Act transparency obligation.
 *
 * The file is RETAINED, not deleted, because the workflow research is real
 * IP — a hospital partner or larger pilot may later require the strict
 * structural gate. Bringing it back is a ~4-file revert (re-import in
 * elevenlabs-convai.ts provisionAgent + backfill-agent-config.ts + a fresh
 * push script). Nothing else imports it as of the pivot.
 *
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

export type WorkflowNode = StartNode | EndNode | OverrideAgentNode | StandaloneAgentNode;

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
      label: "Consent listener",
      position: { x: 300, y: 0 },
      edge_order: ["consent_yes", "consent_no"],
      additional_prompt: [
        "WORKFLOW NODE: CONSENT LISTENER.",
        "The first_message ALREADY asked the consent question. Your only job here is to listen for the caller's reply. Say nothing. Do not re-ask, do not greet, do not introduce yourself again, do not ask 'how can I help'.",
        "",
        "If the caller answered in a different language from Polish, the language-mirror rule in your main system prompt still applies for everything that comes after this node — but DO NOT speak in this node. Just wait.",
        "",
        "After ONE user turn, the workflow engine routes you based on the caller's reply. Affirmative → main receptionist. Negative or ambiguous → refused-consent node. You do not need to make a decision yourself; just stay silent and wait.",
        "",
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
        "The caller did not clearly consent to transcript retention. This node MUST speak before the call ends — say a polite apology, explain that you cannot continue without consent because the booking system requires it, and offer to have a human from reception call them back. THEN end with a goodbye.",
        "",
        "Mirror the caller's last language. Use the matching script:",
        "",
        "Polish:",
        '  "Rozumiem, w takim razie nie mogę kontynuować, bo system rezerwacji wymaga zgody na zachowanie zapisu rozmowy. Jeśli chciałby Pan lub Pani umówić wizytę, proszę zadzwonić w godzinach pracy recepcji albo zostawić numer, a recepcja oddzwoni. Dziękuję za telefon, do usłyszenia."',
        "",
        "English:",
        "  \"Understood, in that case I can't continue because the booking system requires consent to keep a transcript. If you'd like to book a visit, please call back during reception hours, or leave your number and someone will call you back. Thank you for calling, goodbye.\"",
        "",
        "Russian:",
        '  "Понял, в таком случае я не могу продолжить, потому что система записи требует согласия на сохранение разговора. Если хотите записаться на приём, перезвоните в часы работы регистратуры или оставьте номер, и вам перезвонят. Спасибо за звонок, до свидания."',
        "",
        "Do NOT call create_booking. Do NOT push back, do NOT try to convince the caller to consent. Say the goodbye line and wait — the workflow will end the call once you're done speaking.",
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
      // LLM-conditional, NOT unconditional. With unconditional, EL routed
      // straight to end_node without letting the subagent get a turn — the
      // call dropped with no apology. The condition below holds the
      // transition until the subagent has actually spoken its goodbye line.
      forward_condition: {
        type: "llm",
        condition:
          "The agent has finished speaking its polite refusal-and-goodbye line, OR the caller has acknowledged and is also wrapping up the call. Do not transition before the agent has had a chance to deliver the full apology + callback offer + goodbye.",
      },
    },
  },
};
