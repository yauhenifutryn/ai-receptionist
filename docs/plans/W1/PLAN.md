# W1 Plan — Vertical-Agnostic Voice AI Receptionist Core

> Generated 2026-05-15 (sprint Day 8 = Build Day 1). 15 days to Demo Day. Consumed by `gsd-execute-phase` (or executed inline with `superpowers:executing-plans` per task). Verification gates target the **Day 10 internal-demo-green** bar from `docs/plans/2026-05-14-end-to-end-plan.md` Part 9, **using a placeholder ontology** because the vertical isn't locked yet.
>
> **Scope discipline**: this plan covers only the vertical-agnostic core. Vertical-specific ontology + first PMS adapter + vertical phrasing are EXPLICITLY out of scope until vertical locks (target 2026-05-18 AM). Section "Post-vertical-lock follow-up" lists what gets added then.

---

## Goal

By 2026-05-17 EOD (Day 10), a Claude Code operator can:

1. Paste a clinic URL into the wizard.
2. Watch the scraper run (Firecrawl → Gemini 3.1 Pro Preview consolidation → generic `knowledge.md`).
3. See an ElevenLabs agent get provisioned for that tenant.
4. Click "Test in browser" and have a coherent voice conversation in Polish covering:
   - Consent question + deterministic `consent_flag` set,
   - Service / hours / staff Q&A grounded in the scraped KB,
   - A booking flow that invokes `check_availability` (stub returns 3 mock slots) and `create_booking` (writes a row to Supabase),
   - Graceful escalation on out-of-scope intents.
5. See the booking in Supabase tied to the tenant + the consent log.

**Gating gate**: passes 8/10 internal-demo-green checks (`end-to-end-plan.md` Part 9, Day 10 gate).

---

## Waves

Wave ordering reflects what can parallelize. Within a wave, tasks can be assigned to parallel subagents via `superpowers:dispatching-parallel-agents`. Tasks across waves are sequential on the listed dependencies.

### Wave 1 — Foundation (parallelizable, today)

All four can be subagent-dispatched in parallel; none read state from another.

| #    | Task                                                                                                                                                                                                                                                                     | Owner | Verification gate                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1.1 | Monorepo scaffold: root pnpm-workspace.yaml, tsconfig.base, .nvmrc, prettier+eslint, .env.example, apps/web (Next.js 15 + TS + Tailwind + shadcn/ui + Supabase client), apps/backend (Node + TS + tsx + Vitest), packages/contracts (TS lib)                             | Jenya | `pnpm install` clean; `pnpm -r typecheck` green; `pnpm -F web build` green; `pnpm -F backend test` runs (no tests yet, but harness works).       |
| W1.2 | `packages/contracts/*` first drafts: VoiceAgentProvider, CalendarProvider, PostCallWebhookSchema (Zod), ScraperOutputSchema (Zod, generic shape: TenantInfo / Staff / Services / FAQ), AppointmentCategory placeholder enum, ConsentFlagSchema, ServiceValueMatrixSchema | Jenya | All Zod schemas export both runtime validator and inferred TS type. `pnpm -F contracts typecheck` green. README at top documents PR-gating rule. |
| W1.3 | Supabase schema + RLS migrations: `tenants`, `agents`, `bookings`, `consent_log`, `service_value_matrix`, `transcripts`. RLS policies per tenant. Frankfurt region noted in README. SQL runnable as a Supabase migration file.                                           | Jenya | Apply locally against a fresh Supabase project succeeds. RLS test: query `bookings` as tenant A returns 0 rows for tenant B's data.              |
| W1.4 | `apps/backend/ontology/` stubs: `services.md`, `triage.md`, `scripts.md`, `emergency-keywords.md`, `consent.md` with TODO headers only, plus a README explaining the layer-1 architecture and what gets filled post-vertical-lock                                        | Jenya | Files exist, headers in place, README clearly states "VERTICAL NOT LOCKED — content gated on 2026-05-18 lock."                                   |

**Wave-1 verification (all four must pass before Wave 2):**

- `pnpm -r typecheck` green from repo root.
- `pnpm -F backend test` runs (Vitest harness).
- Contracts importable from both apps: a trivial import test in `apps/web` and `apps/backend` passes.
- Supabase migration file applies cleanly.

### Wave 2 — Pipeline (sequential on W1, internal-parallelizable)

| #    | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Depends on       | Verification gate                                                                                                                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2.1 | Scraper pipeline in `apps/backend/scraper/`: `firecrawlMap(url)` → `firecrawlCrawl(urls)` → `consolidate(markdown[], verticalConfig?)` (`gemini-3.1-pro-preview` via `@google/genai`, `responseSchema`-validated against `ScraperOutputSchema`, fallback chain to `gemini-2.5-pro` → `gemini-3-flash-preview` on rate-limit). Hard rule in prompt: "do not invent prices; mark `unknown` if not in source." Writes `data/clinics/<tenant_id>/knowledge.md` + structured JSON to Supabase. Also: `apps/backend/lib/llm.ts` thin LLMClient abstraction lands here. | W1.1, W1.2, W1.3 | Run end-to-end against one real Polish business site (any vertical — pick a vet clinic for now since vet is the leading candidate). Output `knowledge.md` has Klinika/Tenant + Staff + Services + FAQ sections. No invented prices (manual spot-check). Structured JSON validates against `ScraperOutputSchema`. |
| W2.2 | ElevenLabs orchestration in `apps/backend/orchestration/`: `provisionAgent`, `updateAgentKnowledge`, `getAgentTranscript`. Implements `VoiceAgentProvider` interface. Hardens workspace settings: `recordVoice=false`, `storeCallAudio=false`, `retainCallDataDays=0`. Uses placeholder system prompt (no vertical ontology attached, just generic + scraped KB doc).                                                                                                                                                                                            | W1.2             | Manual test: call `provisionAgent("fake-tenant")` after running scraper on the same fake tenant. Returns agentId. Hit ConvAI dashboard, agent visible with KB doc attached and privacy settings correct. CI test verifies privacy settings via API read-back.                                                    |
| W2.3 | Server-tool stubs in `apps/backend/tools/`: `check_availability` (returns 3 hardcoded mock slots for now), `create_booking` (writes to Supabase `bookings` with tenant_id resolved from agentId). Zod schemas from `packages/contracts/server-tools.contract.ts`. Idempotent on `requestId`.                                                                                                                                                                                                                                                                     | W1.2, W1.3       | Curl test: POST to each endpoint with valid + invalid payloads. Invalid → structured error. Valid `create_booking` → row appears in Supabase with correct tenant_id.                                                                                                                                             |
| W2.4 | Post-call webhook receiver in `apps/backend/post-call/`: validates ElevenLabs webhook payload against `PostCallWebhookSchema`, writes booking-finalization to Supabase, conditionally stores transcript only if `consent_flag === true`. Computes `recovered_revenue` from `appointment_category` × tenant's `service_value_matrix` (placeholder service matrix for now).                                                                                                                                                                                        | W1.2, W1.3       | Curl test with mock webhook payload (consent=true and consent=false). Transcript appears only when consent=true. Booking row updates with correct revenue figure.                                                                                                                                                |
| W2.5 | Universal consent flow in `apps/backend/consent/`: Polish + English script (vertical-independent), classifier (`gemini-3.1-flash-lite` via `LLMClient`, `responseSchema`-validated, ambiguous-defaults-false). Exported as both a system-prompt fragment and a post-turn classifier. Same model used for the language detector.                                                                                                                                                                                                                                  | W1.2             | Vitest test: 10 transcripts (5 "tak", 5 "nie", 2 ambiguous). Classifier returns yes/no correctly on 8/10; ambiguous defaults to no. PII-redaction test: log capture contains zero phone numbers / names.                                                                                                         |
| W2.6 | Structured logger with PII redaction in `apps/backend/lib/logger.ts`. Used everywhere we log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | W1.1             | Vitest: log a payload containing a Polish phone number (`+48 ...`), full name, and email. Output contains zero of those substrings.                                                                                                                                                                              |

**Wave-2 verification (must pass before Wave 3):**

- A fake tenant can be scraped + provisioned + tools curl-tested end-to-end.
- All Wave-2 Vitest tests green.
- CI workflow added: `.github/workflows/ci.yml` runs typecheck + lint + tests on every PR.

### Wave 3 — Web wizard + browser test page (sequential on W2)

| #    | Task                                                                                                                                                                                                                       | Depends on | Verification gate                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W3.1 | `apps/web` wizard skeleton: `/onboard/url` → submit triggers scraper → progress page (poll for status) → `/onboard/done` shows agentId + "Test in browser" CTA. Bound to `ScraperOutputSchema` from `packages/contracts/`. | W2.1, W2.2 | Manual flow: paste a real URL, click through, end up on the "Test" page with a real agentId. No 500s.                                                                                                          |
| W3.2 | ServiceValueMatrix UI page bound to `ServiceValueMatrixSchema`. Owner edits prices/values per service category. Persists to Supabase.                                                                                      | W1.2, W1.3 | Manual: edit values, refresh page, values persist. RLS-isolated per tenant.                                                                                                                                    |
| W3.3 | `/test-agent` page with `@elevenlabs/react` v1.0 widget. Loads agent from query param.                                                                                                                                     | W2.2       | Manual: open page with agentId from scraper run, click connect, hold a 60-second conversation in Polish covering greeting / consent / one FAQ question / one booking attempt. Booking row appears in Supabase. |
| W3.4 | SMS short-URL landing page scaffold `/b/[token]` — show appointment details + "Dodaj do kalendarza" button generating `.ics`. (Token resolution stubbed; real SMS pipeline wired in W2 of the sprint.)                     | W1.2       | Manual: visit `/b/test-token`, see appointment details, download .ics, opens in Calendar app.                                                                                                                  |

**Wave-3 verification = Internal-demo-green gate**

The Day-10 gate from `end-to-end-plan.md` Part 9. ALL of these must pass before Rem onboards Day 11 AM and before Sebastian gets a live URL Day 11 PM:

- [ ] Browser demo widget loads in <3s.
- [ ] Agent answers naturally in Polish for ≥8/10 test queries covering: prices, hours, services, booking, NFZ, parking, multilingual switch, escalation triggers, emergency keywords (cross-vertical placeholder), vague intent.
- [ ] Consent flow returns deterministic `consent_flag` on 10 test transcripts (5 "tak", 5 "nie"). Default behavior on ambiguous: false. Score 10/10 on the test set.
- [ ] Booking appears in Supabase with correct `appointment_category` for ≥8/10 test bookings.
- [ ] Post-call webhook fires and writes to Supabase within 5s of call end.
- [ ] No PII in Vercel logs (grep test passes on a 5-call test run).
- [ ] All migrations applied to staging Supabase; RLS verified by query as tenant A returning 0 of tenant B's rows.
- [ ] CI green on `main` (typecheck + lint + tests).
- [ ] `.env.example` committed; `.env.local` NOT committed; gitignore verified.
- [ ] `packages/contracts/` README documents PR-gating rule.

---

## Out of scope for W1 (gated on vertical lock)

These get added in a follow-up W1.5 mini-phase the moment the vertical locks:

- Layer-1 ontology authoring (services / synonyms / scripts / emergency-keywords / consent — all vertical-specific).
- First PMS / calendar adapter implementation (Booksy / Vetmanager / Google Calendar / specialty PMS).
- Vertical-specific patient/client phrasing in scripts (beyond consent which is vertical-independent).
- Vertical-specific eval test set composition (currently placeholder).
- Vertical-specific emergency-keyword regex.

---

## Risks specific to W1

| Risk                                                               | Mitigation                                                                                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firecrawl free tier burn — 500 credits ≈ 50 sites at 10 pages each | Reserve real-site scrapes for Wave 2 verification; develop against one cached scrape.                                                                                                         |
| Agent-runtime LLM (in-call) selection in ConvAI                    | Day-9 verify which LLMs ConvAI exposes (Anthropic Sonnet 4.6, GPT-4o, Gemini Live, etc.). If preferred not native, use ConvAI custom-LLM URL to proxy.                                        |
| Supabase free-tier 500MB                                           | Far under cap. Non-issue.                                                                                                                                                                     |
| Vertical pivot late (after 2026-05-18 PM)                          | If pivot slips: still ship Wave 1+2+3 with placeholder ontology; vertical content layered on top in W1.5 with no rework of the core.                                                          |
| Gemini 3.1 Pro Preview rate limits during scraper consolidation    | LLMClient retry chain: `gemini-3.1-pro-preview` → `gemini-2.5-pro` → `gemini-3-flash-preview` (last two have free-tier headroom). Consolidate per-chunk in parallel with concurrency cap = 3. |
| ElevenLabs Grants not yet approved                                 | Free tier sufficient for browser-test dev. Creator $22 only when wiring real Twilio number (W2). Trivial cost.                                                                                |

---

## Dependencies on user (gated work)

| When triggered                           | What I need from you                                                                                                                                                                                                                                                                                | I will pause and ask in-line |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Before W1.3 / W2.4 apply                 | Supabase Frankfurt project + URL + service-role key + anon key in `.env.local`                                                                                                                                                                                                                      | Yes                          |
| Before W2.1 actually scrapes a real site | Firecrawl account + API key in `.env.local`                                                                                                                                                                                                                                                         | Yes                          |
| Before W2.1 consolidation step runs      | `GEMINI_API_KEY` in `.env.local` (Google AI Studio — paid tier for `gemini-3.1-pro-preview`; user has credits). Anthropic / OpenAI keys not required.                                                                                                                                               | Yes                          |
| Before W2.5 consent classifier runs      | Same `GEMINI_API_KEY` (uses `gemini-3.1-flash-lite`)                                                                                                                                                                                                                                                | Already covered above        |
| Before W2.2 provisions a real agent      | ElevenLabs free or Creator workspace + API key in `.env.local`; workspace setting "Use conversation data for model improvement" toggled OFF in their UI by you (I cannot do this via API). Free tier sufficient for browser-test dev; upgrade to Creator $22 only when wiring a real Twilio number. | Yes                          |
| Day 8 evening                            | Submit ElevenLabs Grants application (12 months free + 33M chars). Doesn't block code.                                                                                                                                                                                                              | Reminder once                |
| Before pushing to remote                 | GitHub private repo created at `github.com/<your-handle>/ai-receptionist` (private), and `git remote add origin <url>` run                                                                                                                                                                          | Yes                          |
| Before first Vercel deploy               | Vercel project linked to the GitHub repo, `fra1` region pinned in `vercel.json`                                                                                                                                                                                                                     | Yes                          |

---

## Next step

Begin Wave 1 execution. The 4 tasks (W1.1–W1.4) are independent. Default approach: dispatch all 4 in parallel via `superpowers:dispatching-parallel-agents`. Fallback: sequential if subagent dispatch is over budget for the day.

After Wave 1 green: Wave 2, then Wave 3, then Day-10 gate.

Session-end discipline: `gsd-pause-work` writes `HANDOFF.json` + `.continue-here.md`.
