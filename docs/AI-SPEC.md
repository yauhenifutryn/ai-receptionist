# AI-SPEC — Vertical-Agnostic Voice AI Receptionist Core

> AI design contract for the W1 core build. Locks framework choice, eval strategy, guardrails, and production monitoring before plan-phase begins. Generated 2026-05-15 (sprint Day 8 = Build Day 1) by `/gsd-ai-integration-phase` running in degraded mode (gsd-sdk not installed; written inline from `CLAUDE.md` + end-to-end plan + vertical-pivot brief).
>
> **Vertical lock status**: NOT LOCKED. Team evaluating vet clinics (lead candidate), HVAC service, senior-care agencies. Monday 2026-05-18 sync commits the vertical. Section 1b is a stub until then. Layer-1 ontology layer is parametrized by vertical and is currently empty.

---

## 1. System Classification

**System Type:** Conversational AI (voice, real-time, multi-turn, multi-tenant) with RAG retrieval over a 3-layer knowledge base, server-tool integrations, and a deterministic consent gate.

**Description:**
Per-tenant voice receptionist that answers inbound phone calls (and a browser-test widget for sales). On every call, the agent: (1) runs a deterministic consent flow in the caller's language, (2) classifies caller intent and switches language if needed (PL/EN/RU auto-detect), (3) answers service / pricing / hours / staff questions grounded in retrieval over (Layer 1) authored ontology, (Layer 2) Firecrawl-scraped per-tenant `knowledge.md`, and optionally (Layer 3) ElevenLabs native website connector, (4) escalates to a human on operationally complex or emergency intents, (5) when the intent is a booking and the caller is qualified, invokes server tools (`check_availability`, `create_booking`) against the tenant's calendar adapter. "Good" looks like a native speaker hearing a natural, polite, professional receptionist who never invents prices, never improvises medical/legal/financial advice, and never books past the calendar's capacity.

**Critical Failure Modes:**

1. **Invented prices**. Agent answers "Cena: 4500 PLN" for a service that has no listed price in the source. Consequence: the clinic gets sued or loses a patient who showed up expecting the quoted price.
2. **Missed emergency escalation**. Caller says "ból nie do wytrzymania" / "child not breathing" / "wycieka woda z rury" (vertical-dependent) and the agent treats it as a routine booking. Consequence: real-world harm.
3. **Consent leak**. Transcript stored when `consent_flag === false` — RODO Art. 6 violation, IOD-blocking, regulator-reportable.
4. **Booking past capacity**. `create_booking` succeeds against an unavailable slot because `check_availability` returned stale data, or the agent ignores its output.
5. **PII in production logs**. Caller's phone number / name / health detail flushed to Vercel logs. RODO Art. 32 violation.
6. **Hallucinated tool name / argument**. Agent invents a `send_email` tool or passes a malformed payload to `create_booking`. Surfaces as silent failure (no booking persisted) or runtime error visible to caller.

---

## 1b. Domain Context

> **STUB pending vertical lock (target 2026-05-18 AM).** Structure is here so the AI-SPEC is consumable by `gsd-planner` today; concrete entries get filled in the moment we lock vertical, by re-running this phase with the vertical name and a Firecrawl sweep of authority sources for that vertical.

**Industry Vertical:** TBD. Active candidates ranked: (1) Polish veterinary clinics — emergency-first wedge, ~2,100 multi-vet practices, no specialist Polish vet voicebot exists, Weter.pl is a 6-12 month threat. (2) HVAC service — winter emergency, ~10k firms, no specialist competitor. (3) Senior-care agencies — 3-5k agencies, demographic tailwind, PL/UA moat. Dental ruled out (ReceptionOS already shipping).

**User Population:** Two populations on each call. (A) End caller — typically Polish-native, age 25-70, calling a small-business landline / mobile from a mobile phone, often emotionally activated (sick pet, broken heating, family-member emergency, urgent appointment need). (B) Tenant business owner — non-technical SMB owner/manager, evaluates the agent by listening to recordings _they_ call (browser-test widget) before going live. The agent must satisfy BOTH: end-caller experience AND owner's "does it sound like me would-want my receptionist to sound" gut check.

**Stakes Level:** **High** for the booking + emergency-routing paths. **Medium** for FAQ. **Critical** for consent + PII handling (regulatory).

**Output Consequence:** Agent output drives: (a) live audio to the caller (irreversible), (b) booking writes to the tenant's calendar (operationally irreversible — sends SMS / blocks slot / costs the business if wrong), (c) transcript storage in Supabase (legally consequential if consent is wrong).

### What Domain Experts Evaluate Against

> Practitioner-language rubric ingredients. Fully populated post-vertical-lock by `gsd-domain-researcher` (or manually). Today the ones marked CROSS-VERTICAL apply.

| Dimension                    | Good (expert accepts)                                                                                           | Bad (expert flags)                                                                   | Stakes   | Source                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- | ----------------------------------------- |
| Polish phrasing naturalness  | Sounds like a native Warsaw receptionist; "Dzień dobry, w czym mogę pomóc?" not "Witam, jak mogę być pomocnym?" | Literal English translation tells (e.g., "Mam nadzieję, że mogę pomóc Pani dzisiaj") | High     | CROSS-VERTICAL — pilot owner ear          |
| Price honesty                | Says "Nie mam tej informacji, sprawdzę z kliniką" when price is unknown                                         | Invents a plausible-sounding price not in source                                     | Critical | CROSS-VERTICAL — RODO + legal             |
| Escalation when out of scope | "Łączę z lekarzem" / "Łączę z technikem" / "Łączę z koordynatorem" on operationally complex intents             | Improvises a treatment / diagnosis / quote                                           | Critical | CROSS-VERTICAL — pilot owner liability    |
| Emergency recognition        | Recognizes vertical-specific emergency keywords within 2 turns and escalates                                    | Treats emergency as routine booking                                                  | Critical | VERTICAL-SPECIFIC — TBD                   |
| Multilingual switch          | First 2 sec of caller audio → detect PL/EN/RU → switch agent voice + ontology language section                  | Forces caller into wrong language                                                    | High     | CROSS-VERTICAL — refugee population in PL |
| Booking accuracy             | Booking written to calendar matches the slot the agent quoted to caller                                         | Phantom slot / double-booked slot / wrong patient name                               | High     | CROSS-VERTICAL — operational              |

### Known Failure Modes in This Domain

CROSS-VERTICAL:

- **Polish dialectal/regional drift**: Silesian / Lesser-Poland phrasings not in standard tutorials. Ontology must front-load synonyms.
- **NFZ vs prywatne confusion**: caller asks if X is free, agent must distinguish state vs private without quoting wrong copay.
- **After-hours capture**: SMB owners care most about night/weekend; this is where competitors lose calls. Agent must do _more_ than during-hours, not less.
- **Refugee accent**: PL-speaking Ukrainian/Belarusian callers — ASR error rate is higher. Ontology should not refuse "non-perfect" Polish.

VERTICAL-SPECIFIC (filled post-lock):

- vet: vomiting / poisoning / labor — triage criticality and escalation path. Ostatnia szczepionka vs. najbliższy termin szczepień.
- HVAC: gas smell / no heat in winter / water leak — emergency vs. annual service.
- senior-care: medication adherence / fall reports — caregiver routing.

### Regulatory / Compliance Context

- **RODO (GDPR)**: Art. 6 lawful basis (legitimate interest for the call; consent for transcript storage), Art. 32 security (no PII in logs, encrypted-at-rest, EU residency), Art. 13/14 transparency (consent script discloses AI agent and retention).
- **EU AI Act**: limited-risk system (chatbot disclosing it's AI is sufficient; the consent script handles this). Not high-risk — we are not making safety-of-life decisions; we escalate emergencies, we do not diagnose or dispatch.
- **Sector-specific**: depends on vertical lock. Healthcare-adjacent (vet, senior-care) → recommend IOD review before pilot 1 goes live. HVAC → no sector layer beyond RODO.
- **No CCPA / HIPAA exposure** — EU-only operations, no US data subjects, no PHI handling (we don't store medical/health details; transcripts may incidentally contain them and are consent-gated).

### Domain Expert Roles for Evaluation

| Role                      | Responsibility                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilot clinic / shop owner | Listens to first 10 real calls, flags un-natural phrasing, signs off on tone before any other tenant onboards. Cross-vertical.                              |
| Sebastian (GTM)           | Acts as patient/customer caller in pre-pilot scenarios, runs the 50-query test set in Polish, flags answers that would embarrass us in a discovery meeting. |
| Vertical specialist (TBD) | Domain SME confirmed post-vertical-lock. Labels reference dataset, calibrates LLM-judge prompts, owns the emergency-keyword list.                           |
| Jenya                     | Calibrates LLM judge against owner labels every Monday in W2-W3, retunes thresholds.                                                                        |

---

## 2. Framework Decision

**Selected Framework:** **ElevenLabs ConvAI** (Conversational AI, formerly "Agents Platform") as voice runtime + agent orchestration. **Anthropic Claude Sonnet 4.6** (EU residency tier) as the agent's reasoning LLM.

**Version:** `@elevenlabs/elevenlabs-js` ^2.x (Node), `@elevenlabs/react` ^1.0 (browser widget). Pin exact in `package.json` on Day 8.

**Rationale:**

- ElevenLabs handles ASR + TTS + turn-taking + barge-in + native phone integration (Twilio EU) end-to-end. Building this stack ourselves in 15 days is impossible. ConvAI exposes the agent runtime via REST: `POST /v1/convai/agents/create`, attach knowledge documents, attach server-tool webhooks, attach post-call webhook, pluggable LLM (Anthropic / OpenAI / xAI / open weights), pluggable voice from the ElevenLabs voice library.
- TTS quality (Polish) is the durable moat — competitor Vapi/Synthflow voices are noticeably weaker on Polish in side-by-side blind tests. Owners decide on the tone.
- EU residency: ElevenLabs supports EU regions for runtime + Twilio EU media region for telephony.
- Cost: Creator $22/mo today, Pro $99/mo from W2. Grants application submitted Day 8 may zero this.
- **Voice runtime is abstracted behind `VoiceAgentProvider` interface** in `packages/contracts/`. ElevenLabs today; Vapi / Synthflow drop-in in 4-6 weeks if reality changes.

**Alternatives Considered:**

| Framework                                                     | Ruled Out Because                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vapi                                                          | Polish TTS noticeably weaker in blind test. Less mature server-tool webhook pattern. Worth a re-bench at W3 if EL prices change.                                                |
| Synthflow                                                     | Same TTS-quality issue + thinner docs + smaller team.                                                                                                                           |
| Retell                                                        | Strong, but Polish voice library narrower than EL.                                                                                                                              |
| Build-your-own (Whisper + GPT-4o + Cartesia + Twilio Streams) | 4-6 weeks of dev minimum, no chance in this sprint. Reconsider post-Demo-Day if EL margin economics break.                                                                      |
| LangGraph / OpenAI Agents SDK directly                        | Wrong layer of abstraction — they orchestrate LLM agents, but we need voice runtime + telephony + RAG + agent orchestration as one product. EL ConvAI IS that integrated layer. |

**Vendor Lock-In Accepted:** **Partial.** Voice quality is the lock-in (cannot trivially re-record demos with a different vendor's voice). Logic, prompts, ontology, calendar adapters, post-call schema are all in our repo and provider-portable via `VoiceAgentProvider`. The lock is conscious and bounded.

---

## 3. Framework Quick Reference

> ElevenLabs ConvAI distilled for our use case. Source: `https://elevenlabs.io/llms-full.txt` (paste at task start), official Node SDK README, `agents` skill bundled in `~/.claude/skills/`.

### Installation

```bash
pnpm add @elevenlabs/elevenlabs-js zod @anthropic-ai/sdk
pnpm add @elevenlabs/react   # apps/web only
```

### Core Imports

```ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Conversation } from "@elevenlabs/react"; // browser widget (test page only)
```

### Entry Point Pattern — provisioning one tenant agent

```ts
// apps/backend/orchestration/provisionAgent.ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export async function provisionAgent(args: {
  tenantId: string;
  tenantDisplayName: string;
  ontologyKbDocIds: string[]; // Layer 1 — vertical-specific (empty array today)
  tenantKbDocId: string; // Layer 2 — per-tenant knowledge.md document_id
  voiceId: string; // pre-selected EL Polish voice
  serverToolBaseUrl: string; // our Vercel webhook URL
}) {
  const el = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });
  const agent = await el.conversationalAi.agents.create({
    name: `${args.tenantDisplayName} — receptionist`,
    conversationConfig: {
      agent: {
        prompt: {
          prompt: buildSystemPrompt({ tenantDisplayName: args.tenantDisplayName }),
          llm: "claude-sonnet-4-6", // Anthropic EU residency configured at workspace level
          temperature: 0.3,
          tools: [
            {
              type: "webhook",
              name: "check_availability",
              url: `${args.serverToolBaseUrl}/tools/check-availability` /* ...schema */,
            },
            {
              type: "webhook",
              name: "create_booking",
              url: `${args.serverToolBaseUrl}/tools/create-booking` /* ...schema */,
            },
          ],
          knowledgeBase: [
            ...args.ontologyKbDocIds.map((id) => ({ documentId: id, usageMode: "auto" })),
            { documentId: args.tenantKbDocId, usageMode: "auto" },
          ],
        },
        language: "pl",
      },
      tts: { voiceId: args.voiceId, stability: 0.45, similarityBoost: 0.75 },
      asr: { quality: "high", userInputAudioFormat: "pcm_16000" },
      turn: { turnTimeout: 7, mode: "turn" },
    },
    platformSettings: {
      privacy: { recordVoice: false, storeCallAudio: false, retainCallDataDays: 0 }, // hard RODO setting
    },
  });
  return agent;
}
```

### Key Abstractions

| Concept                  | What It Is                                                                            | When You Use It                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Agent                    | A persistent ConvAI configuration: prompt + LLM + voice + tools + KB. One per tenant. | Created once at onboarding; updated as KB / prompt / tools evolve.                                                                    |
| Knowledge Base document  | A markdown document uploaded via `/v1/convai/knowledge-base/...`. Multiple per agent. | Layer-1 ontology (shared across tenants of same vertical, attached by reference). Layer-2 per-tenant `knowledge.md` (one per tenant). |
| Server tool              | Webhook the agent invokes mid-call with structured args, blocks on response.          | `check_availability`, `create_booking`. Bounded latency budget (~1-2s).                                                               |
| Client tool              | A function the in-browser widget exposes to the agent (no network).                   | Out of scope for us — telephony first, browser is for owner test only.                                                                |
| Post-call webhook        | Async POST to our URL when call ends, includes transcript + metadata.                 | Booking persistence, consent-gated transcript storage, recovered-revenue computation.                                                 |
| Native website connector | Live URL ElevenLabs crawls + indexes.                                                 | Layer 3, _optional_, A/B tested Day 8-9 vs Layer 1+2 only.                                                                            |

### Common Pitfalls

1. **Default workspace setting "Use conversation data for model improvement" is ON.** Must be flipped OFF at workspace setup (RODO violation if left on). Plus `recordVoice=false`, `storeCallAudio=false`, `retainCallDataDays=0` per-agent.
2. **`usageMode: "auto"` retrieval is opaque.** No control over chunk count, no visibility into what got retrieved. Counter-mitigation: ontology chunks are 200-500 tokens with one service per H2 (template-friendly retrieval), Polish synonyms front-loaded, prices as `Cena: X PLN` lines not tables (tables chunk badly).
3. **Server-tool webhook timeout is short (~5s).** `check_availability` must return within 1.5s p95 or the agent will say "Sprawdzam..." then time out and improvise. Caching / async pre-warm on connect is mandatory once we wire a real PMS.
4. **Tool argument hallucination.** Agent can invent argument values. Counter-mitigation: tight Zod-validated schemas on the webhook side, agent system prompt instructs explicit "use the values the caller said, do not invent."
5. **Language switching mid-call**: setting `language: "pl"` is a _default_. Auto-detect must be implemented as either (a) ConvAI's language detect feature if available, or (b) a server-tool the agent calls on first turn that returns the detected language and triggers a voice swap. Verify Day 9.
6. **Knowledge-base size cap per agent**: confirm in docs Day 8. If we exceed, split into multiple KB documents and rely on retrieval ordering.
7. **Anthropic Claude in ConvAI**: confirm Sonnet 4.6 is a selectable LLM in ConvAI on Day 8 — if not yet available, fall back to GPT-4o EU residency or Anthropic via custom-LLM bring-your-own-endpoint (ConvAI supports a custom LLM URL).

### Recommended Project Structure

```
ai_receptionist/
├── apps/
│   ├── backend/
│   │   ├── orchestration/       # provisionAgent, updateAgentKnowledge, getTranscript
│   │   ├── scraper/             # Firecrawl → Claude consolidation
│   │   ├── tools/               # check_availability + create_booking webhook handlers
│   │   ├── post-call/           # webhook receiver, consent-gated transcript persistence
│   │   ├── consent/             # universal consent script + classifier
│   │   ├── ontology/            # Layer 1 (stubbed until vertical lock)
│   │   ├── prompts/             # system-prompt builder, tenant-template
│   │   └── lib/                 # supabase client, structured logger w/ PII redaction
│   └── web/
│       ├── app/                 # Next.js app router
│       │   ├── (wizard)/        # onboarding pages
│       │   ├── test-agent/      # @elevenlabs/react browser widget
│       │   ├── dashboard/       # tenant dashboard
│       │   └── b/[token]/       # SMS short-URL landing
│       └── components/
├── packages/
│   └── contracts/               # zod schemas + TS types shared web↔backend
├── supabase/
│   └── migrations/              # tenants, agents, bookings, consent_log, service_value_matrix + RLS
└── docs/
    ├── AI-SPEC.md               # this file
    ├── research/                # competitive, statistics, detailed_description
    └── plans/                   # W1/PLAN.md (next step)
```

---

## 4. Implementation Guidance

**Model Configuration:**

- Agent LLM: `claude-sonnet-4-6` via ConvAI, `temperature: 0.3` (we want consistency on prices / hours; some warmth but not creative), `maxTokens: 400` per turn (sub-3s latency budget). System prompt is short (<800 tokens) and instructs deference to retrieved KB. No few-shot in the system prompt — examples live in the ontology where retrieval can chunk them.
- Consent classifier (post-first-turn): Claude Haiku 4.5 (fastest EU), `temperature: 0`, structured output (Pydantic-equivalent: Zod) returning `{ consent: "yes" | "no" | "ambiguous", confidence: number }`. Ambiguous defaults to `false`.
- Scraper consolidation: Claude Sonnet 4.6, `temperature: 0`, structured Zod-validated output, hard prompt rule: "If a price is not in the source text, output `unknown`. Do not infer prices from related services."
- Language detector: built-in ConvAI feature if available (verify Day 8); else GPT-4o-mini 1-shot on first transcribed user turn.

**Core Pattern (Conversational RAG with Server Tools):**

- Agent system prompt declares persona, language, escalation rules, tool catalog.
- KB documents (Layer 1 + Layer 2 + optional Layer 3) attached at provisioning time.
- ConvAI runtime handles ASR → LLM → tool calls → TTS, streaming.
- Server tools called inline via webhook; we return JSON with `slots[]` or `bookingId`.
- Post-call webhook fires once on conversation end → persistence layer.

**Tool Use:**

- `check_availability(serviceCategory, preferredWindow)` → returns up to 5 slots. Source: per-tenant `CalendarProvider` adapter (Booksy / Medfile / Google Calendar / Outlook / fallback "manual mirror"). Adapter selection is per-tenant config.
- `create_booking(slotId, patientName, patientPhone, serviceCategory, notes)` → returns `{ bookingId, smsShortUrl }`. Writes to Supabase `bookings` and tenant's calendar atomically.
- Both tools are idempotent on retry via client-generated UUID `requestId`.
- Tool schemas in `packages/contracts/server-tools.contract.ts` (Zod, exported as both runtime validator and TS type).

**State Management:**

- ConvAI holds per-conversation state in its own runtime; we do not duplicate.
- We persist: tenant config (Supabase `tenants` + `agents`), bookings (Supabase `bookings`), consent records (Supabase `consent_log`), transcripts (only if `consent_flag=true`, Supabase `transcripts`).
- Tenant lookup at tool-webhook time: tenant identified by ElevenLabs agentId passed in webhook payload → maps to `tenants.id` in Supabase. RLS-isolated.

**Context Window Strategy:**

- Conversational, not RAG-over-long-docs: per-turn LLM context = system prompt + retrieved KB snippets (auto-mode, ConvAI picks chunks) + last N turns of conversation history (ConvAI manages compaction). Sonnet 4.6 has plenty of room; we expect <8K tokens per turn p95.
- Ontology chunk discipline (200-500 tokens, one service per H2) is the primary lever for retrieval quality, not context-window size.

---

## 4b. AI Systems Best Practices

### Structured Outputs with Zod (TS equivalent of Pydantic)

Every LLM call returning structured data MUST go through Zod validation with retry on parse failure (max 2 retries; fail open to deterministic fallback on third).

```ts
// apps/backend/consent/classifier.ts
import { z } from "zod";

const ConsentResult = z.object({
  consent: z.enum(["yes", "no", "ambiguous"]),
  confidence: z.number().min(0).max(1),
});

export async function classifyConsent(transcribedUserTurn: string) {
  const raw = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    temperature: 0,
    system: "Classify the caller's response to the consent question. Output JSON only.",
    messages: [
      {
        role: "user",
        content: `Question asked: <consent script>\nCaller said: ${transcribedUserTurn}\nOutput JSON: {"consent":"yes"|"no"|"ambiguous","confidence":0..1}`,
      },
    ],
  });
  const parsed = ConsentResult.safeParse(JSON.parse(raw.content[0].text));
  if (!parsed.success) return { consent: "ambiguous", confidence: 0 } as const;
  return parsed.data;
}
```

Same pattern for scraper consolidation output (a much bigger schema — `ScraperOutput` in `packages/contracts/scraper.schema.ts`).

### Async-First Design

Backend is Node + TS; everything is async. Common mistake: forgetting that `el.conversationalAi.agents.create` returns a Promise resolving AFTER the agent is fully registered, which can take several hundred ms; the calling wizard must await this _and_ await the KB document upload before showing "Test in browser" to the owner. Use `Promise.all` for KB doc uploads but `await` the agent-create after all docs land.

Stream LLM responses where the caller can wait (scraper consolidation can stream for owner-visible progress); do not stream consent-classifier output (it's <100 tokens).

### Prompt Engineering Discipline

- **System prompt** = persona + rules + tool catalog. Stable across calls. Stored as a typed template builder (`buildSystemPrompt`) so we can refactor wording without touching every test.
- **User prompts** are NOT used as the conversation channel (ConvAI uses the live audio transcript as the running user message). The "user content" for non-conversational LLM calls (consent classifier, scraper consolidation, language detect) is constructed deterministically from caller transcript / scraped markdown.
- **No few-shot in the system prompt**. Few-shot examples bloat every turn. Examples live in the KB as ontology documents where retrieval picks them when relevant.
- Token budget per turn: system 800 + KB chunks ~2000 + history ~2000 + output 400 ≈ 5K — well under Sonnet's window. Watch this number in production traces.

### Context Window Management

- Conversational: ConvAI summarizes / drops oldest turns automatically. Verify behavior is "summarize" not "drop" on Day 9.
- Scraper consolidation: chunks of Firecrawl markdown (one section per chunk) consolidated in parallel, then a final consolidation pass on the chunk outputs. Single-shot only for tenants with <30 pages.
- Consent: deterministic, no context risk.

### Cost and Latency Budget

- Voice runtime: $0.10-0.15/min (ElevenLabs Pro). 1,000 included min/mo at the 1,499 PLN tier; per-min refund offset 0.85 PLN.
- LLM cost per call: Sonnet 4.6 ~$0.005/turn × 8 turns avg = $0.04/call. Negligible vs runtime.
- Latency budget per turn (target): ASR finalize ≤500ms + LLM first-token ≤700ms + KB retrieval (parallel) ≤300ms + TTS first-byte ≤400ms = ~1.5s perceived. p95 target 2.5s.
- Caching: Anthropic prompt caching ON for the system prompt (saves 80%+ on tokens after first turn). Verify ConvAI exposes the cache control flag; if not, raise as an EL feature ask.

---

## 5. Evaluation Strategy

### Dimensions

| Dimension                       | Rubric                                                                                                                                                                                     | Measurement                                                         | Priority |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | -------- |
| Polish phrasing naturalness     | 1-5 Likert from native-PL owner on the first 20 turns of each pilot. Pass = avg ≥4.0; any 1 or 2 triggers a script tweak.                                                                  | Human (pilot owner)                                                 | Critical |
| Consent flow correctness        | Pass/Fail per call. Pass = `consent_flag` matches the caller's intent on a labeled test set (20 transcripts: 10 "tak", 10 "nie", 0 ambiguous misroutes). Pass rate ≥95%.                   | Code (test fixtures)                                                | Critical |
| Price hallucination rate        | Pass/Fail per query. Pass = answer is in source OR says "nie mam tej informacji, sprawdzę". Fail = invented number. Pass rate 100% (zero tolerance).                                       | LLM judge (Claude Sonnet 4.6 with rubric) + spot-check 10% by Jenya | Critical |
| Escalation accuracy             | Per emergency keyword set (vertical-specific, currently empty): the agent must escalate within 2 turns when the keyword appears in caller speech. Pass rate ≥95% on a 20-keyword test set. | LLM judge + human spot-check                                        | Critical |
| Multilingual auto-detect        | Pass rate ≥90% on a 30-call test set (10 PL, 10 EN, 10 RU).                                                                                                                                | Code (compare detected vs ground-truth label)                       | High     |
| Booking accuracy                | Booking written to calendar matches the slot the agent quoted to caller, on a 20-booking test set. Pass rate 100% (zero tolerance for phantom bookings).                                   | Code (compare transcript-quoted slot vs DB row)                     | Critical |
| Tool-call format compliance     | Server tool receives Zod-valid payload on every invocation. Failure → graceful fallback message; metric tracked.                                                                           | Code (Zod parse failures = denominator)                             | High     |
| First-response latency (turn 1) | p50 ≤2.0s, p95 ≤3.5s from caller silence-end to agent first audio byte                                                                                                                     | Code (ElevenLabs trace events)                                      | High     |
| Mid-call latency (turns 2+)     | p50 ≤1.5s, p95 ≤2.5s                                                                                                                                                                       | Code (ElevenLabs trace events)                                      | High     |
| PII-in-logs leakage             | Zero occurrences in 1 week of Vercel + Supabase logs. Grep-test in CI on synthetic transcripts.                                                                                            | Code (regex sweep over log buckets)                                 | Critical |
| Owner gut-check approval        | Pilot owner approves first 10 real calls. Blocking gate before pilot 1 goes live.                                                                                                          | Human (owner)                                                       | Critical |

### Eval Tooling

**Primary Tool:** **Langfuse self-hosted (EU)** for LLM tracing across the ElevenLabs ConvAI runtime (custom-LLM proxy emits Langfuse spans) + scraper-consolidation + consent-classifier. Reasoning: EU residency, OSS, free self-host on the same Hetzner backup or a small Supabase-adjacent VM. **Arize Phoenix** considered but more visualization-heavy and US-default. Langfuse fits an EU compliance posture better.

**Setup:**

```bash
# Self-hosted Langfuse on Hetzner / Fly.io EU
docker run -p 3000:3000 langfuse/langfuse:latest
# Backend code:
pnpm add langfuse
```

**CI/CD Integration:**

```bash
# .github/workflows/evals.yml — runs on every PR touching apps/backend or packages/contracts
pnpm -F backend test:evals     # runs Vitest with eval fixtures, fails build on regression
```

Daily smoke test against live agents:

```bash
pnpm -F backend evals:nightly  # 50-query test set vs current fake-clinic agent, posts results to Slack
```

### Reference Dataset

**Size:** Start at 50 examples by Day 10; expand to 200 by end of W2 with pilot 1 real calls.

**Composition** (vertical-agnostic where possible, vertical-specific filled post-lock):

- 10 "happy path" booking calls (caller knows what they want, no edge cases)
- 10 price/hours/staff FAQ calls (different services, different question phrasings)
- 10 ambiguous-intent calls (caller doesn't know what they want; agent must clarify)
- 10 consent edge cases (5 "tak", 5 "nie", 2 with ambient noise, 1 mumbled, 2 sarcastic)
- 5 emergency-keyword calls (vertical-specific list TBD)
- 5 multilingual-switch calls
- 5 NFZ vs private confusion calls (Polish health context)
- 5 "agent must escalate" calls (out-of-scope intents: complaints, billing, medical/technical advice)

**Labeling:**

- 50-call seed set: hand-labeled by Jenya + pilot owner before Day 10.
- Production sampling: smart filter (high tool-call latency, retrieval-low-confidence flag, owner-flagged) → human review weekly.
- LLM judge: Claude Sonnet 4.6 with a rubric prompt per dimension. Judge prompts versioned in `apps/backend/evals/judges/` and re-calibrated against human labels every Monday in W2-W3.

---

## 6. Guardrails

### Online (Real-Time)

| Guardrail                             | Trigger                                                                                                            | Intervention                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Consent gate on transcript storage    | `consent_flag !== true` after first turn                                                                           | Block transcript write to Supabase; metadata only persisted in `consent_log`.                                       |
| Emergency-keyword escalation          | Caller utterance matches the vertical-specific emergency-keyword set (regex + LLM secondary check)                 | Agent immediately routes to "Łączę z lekarzem/dyspozytorem/koordynatorem" script; sends owner SMS in parallel.      |
| Price-hallucination prevention        | Agent system prompt + ontology hard rule: never invent. Retrieval-confidence-low signal triggers fallback phrasing | Agent says "Nie mam tej informacji, sprawdzę z [tenant]" instead of guessing.                                       |
| Tool-call argument validation         | Server tool receives malformed payload (Zod parse fails)                                                           | Webhook returns structured error; agent says "Wystąpił problem, łączę z kimś z zespołu" and triggers escalation.    |
| PII redaction at log boundary         | Any log line containing phone-number / full-name / email patterns                                                  | Structured logger redacts before flush; raw never written.                                                          |
| Out-of-scope intent escalation        | Intent classifier flags medical-advice / legal-advice / billing-dispute / complaint                                | Agent escalates; does not improvise.                                                                                |
| Booking-past-capacity prevention      | `create_booking` called with `slotId` not in last `check_availability` response                                    | Server returns refusal; agent says "Ten termin właśnie się zajął, mam też..."                                       |
| Rate limit per caller-number          | >5 calls/min from same caller-number                                                                               | Backoff + log; legitimate callers rarely repeat-dial that fast.                                                     |
| Audio recording disabled at provision | Any new agent                                                                                                      | `recordVoice=false`, `storeCallAudio=false`, `retainCallDataDays=0` enforced in `provisionAgent`. CI test verifies. |

### Offline (Flywheel)

| Metric                          | Sampling Strategy                                     | Action on Degradation                                                                    |
| ------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Polish phrasing naturalness avg | Random 5% of weekly calls + 100% of pilot owner flags | If avg <4.0 for a tenant: re-tune system prompt for that tenant or ontology section.     |
| Price hallucination rate        | Random 10% of calls that mention prices               | Any single hallucination: investigate that ontology entry; add `unknown` markers; alert. |
| Tool-call format failure rate   | All tool calls                                        | >2%: tighten schema docstrings in system prompt; consider stricter agent temperature.    |
| Escalation false-positives      | Random sample of escalated calls reviewed weekly      | >10%: review keyword list, tune LLM-judge threshold.                                     |
| Escalation false-negatives      | All flagged-by-owner missed-emergency cases           | Any single false-negative on critical keyword: add keyword; re-test.                     |

---

## 7. Production Monitoring

**Tracing Tool:** **Langfuse self-hosted (EU)**. Spans for: scraper-consolidation (per page + final pass), consent classifier, every LLM call inside ConvAI (via custom-LLM proxy when feasible — verify Day 8 whether ConvAI exposes hookable trace events), server-tool webhooks. Trace IDs propagate via OpenTelemetry semantic conventions; correlation IDs link a trace to a Supabase `bookings` row and a `consent_log` entry.

**Key Metrics to Track:**

1. First-response latency p50/p95 per tenant.
2. Tool-call success rate + latency p95 per tool.
3. Retrieval-confidence-low rate (proxy for hallucination risk).
4. Consent-flag distribution (yes/no/ambiguous %) — early-warning if consent script breaks.
5. Recovered-revenue (PLN, per tenant) — the outcome metric the dashboard surfaces to the owner.

**Alert Thresholds (page or Slack):**

- p95 first-response latency >4s for >5 consecutive calls → Slack #alerts.
- Any price-hallucination judge-flag → page Jenya.
- Any tool-call Zod failure → Slack #alerts; >5 in an hour → page.
- Any emergency keyword detected but escalation NOT triggered → page (zero tolerance).
- Vercel log grep finds PII regex match → page (zero tolerance).
- Supabase write error rate >1% → page.

**Smart Sampling Strategy:**

- 100% of calls flagged by guardrails (price-hallucination judge, escalation mismatch, tool failure) → human queue.
- 5% random + 100% pilot-owner flags → weekly review.
- Anomaly filter: calls where retrieval-confidence is bottom-decile OR turn count >15 OR tool latency >3s → automatic flag for review.

---

## Checklist

- [x] System type classified (Conversational + RAG + tools)
- [x] Critical failure modes identified (6, all ≥critical)
- [x] Domain context researched (Section 1b — STUB pending vertical lock 2026-05-18; structure populated, cross-vertical rows filled)
- [x] Regulatory/compliance context identified (RODO Art. 6/13/14/32, EU AI Act limited-risk)
- [x] Domain expert roles defined (pilot owner, Sebastian, vertical specialist TBD, Jenya)
- [x] Framework selected with rationale (ElevenLabs ConvAI + Claude Sonnet 4.6)
- [x] Alternatives considered and ruled out (Vapi, Synthflow, Retell, build-your-own, LangGraph)
- [x] Framework quick reference written (install, imports, entry-point pattern, abstractions, pitfalls, project structure)
- [x] AI systems best practices written (Zod, async, prompt discipline, context, cost+latency)
- [x] Eval dimensions grounded in domain rubric ingredients (11 dimensions, 6 critical)
- [x] Each eval dimension has a concrete rubric
- [x] Eval tooling selected (Langfuse self-hosted EU)
- [x] Reference dataset spec written (50 → 200 examples; composition + labeling defined)
- [x] CI/CD eval integration specified (GitHub Actions, Vitest on PRs + nightly smoke)
- [x] Online guardrails defined (9 real-time guardrails)
- [x] Production monitoring configured (Langfuse + alert thresholds + smart sampling)

---

## Open items to revisit after vertical lock (target 2026-05-18 AM)

1. Section 1b emergency-keyword list, domain-specialist role, vertical-specific failure modes.
2. Section 2 voice library selection (vet vs HVAC vs senior-care implies different default voices).
3. Section 5 emergency-keyword test set (currently empty placeholder).
4. Section 6 emergency-escalation regex (vertical-specific patterns).
5. First PMS / calendar adapter implementation choice (Booksy → vet → Vetmanager; HVAC → likely Google Calendar fallback; senior-care → TBD).
