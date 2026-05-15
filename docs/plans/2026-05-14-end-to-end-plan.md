# End-to-End Plan — 2026-05-14 to 2026-05-30

This is the active plan. The kickoff document (`2026-05-14-kickoff.md`) covers team and collaboration decisions; this document covers the **build sequence, account setup, knowledge architecture, and Demo Day execution**.

**Status**: Day 7 of 21 (= Build Day 1; nothing was coded before today). 16 days to Demo Day at Rotunda. 4 days to Inovo VC pitch with Dawid Sugier.

**Day naming**: "Day 7" = day 7 of the 21-day sprint window started 8 May. Days 1-6 were preparation (weekend planning, Sebastian's outreach list build, strategy docs, today's Day 0 hygiene). Build days are counted in parallel: today is Build Day 1, Day 8 = Build Day 2, etc. Track by absolute date (2026-05-14 through 2026-05-30) to avoid any confusion.

---

## Part 1 — Pre-implementation account setup (Jenya, Day 7 morning)

These are manual user actions; I cannot do them. Everything below the line is gated on these.

### 1.1 GitHub (free)

- Create org (optional) or use personal account.
- Create **private** repo named `ai-receptionist` (placeholder OK).
- Add Rem as collaborator with write access.
- Branch protection on `main`: require PR review, require CI green, no force push.
- Add CODEOWNERS file: `packages/contracts/* @<your-github-handle>` so PRs touching contracts auto-request your review.
- Push this directory: `git remote add origin <url>` then `git push -u origin main`.

### 1.2 Vercel (free Hobby tier)

- Sign up at vercel.com, connect GitHub.
- Import the `ai-receptionist` repo as a new project.
- Region: **`fra1` Frankfurt** in `vercel.json` (this is Vercel's serverless function deployment region; for static hosting the CDN serves globally regardless).
- Hobby tier is fine for sprint. Upgrade to Pro ($20/mo) only if we hit limits.

### 1.3 Supabase (free tier for sprint)

**Why Supabase**: we need Postgres + Auth + Row-Level Security + EU data residency for RODO. This holds per-clinic config (services, hours, doctors, voice ID), service value matrix (clinic-edited prices for ROI math), booking metadata (call → booking events), consent log (deterministic per-call record), optional transcript storage (only if `consent_flag === true`), and clinic-owner authentication for the dashboard. Multi-tenancy isolation via RLS, one clinic per row.

**Why not just JSON files**: no auth, no multi-tenant, no concurrent web+backend access, no RODO-compliant data residency story for the IOD.

**Region**: Frankfurt = AWS `eu-central-1` underneath. You'll see "Frankfurt (eu-central-1)" in the Supabase region picker. This is NOT the same naming as Vercel's `fra1`. Both happen to be Frankfurt physically; the naming differs because Vercel and Supabase use different cloud providers internally.

**Setup**:

- Create project at supabase.com → pick **Frankfurt** region.
- Free tier: 500MB DB, 1GB file storage, 50K MAU. Plenty for 1-5 pilots.
- Grab: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (for `apps/web`), `SUPABASE_SERVICE_ROLE_KEY` (for `apps/backend`, never exposed to frontend).
- Enable RLS by default on every table from Day 1.

### 1.4 ElevenLabs

**Plan choice**: **Creator tier ($22/mo) for W1 dev**, upgrade to **Pro ($99/mo)** when pilot 1 ships in W2. Pro requirement is concurrent-call ceiling (20 vs 10) which only matters once real clinic phone traffic hits us.

- Creator: 275 min, 10 concurrent calls. Sufficient for browser test + internal demos.
- Pro: 1,238 min, 20 concurrent. Required from W2 when a real clinic's number is forwarded to our agent.
- Save: $77 over W1 by starting on Creator.

**Setup**:

- Create **business workspace** under your company name (not personal). One master workspace, per-clinic agents provisioned via API.
- API key from elevenlabs.io/app/developers/api-keys → `ELEVENLABS_API_KEY` in `.env.local`.
- **Workspace settings on Day 1**:
  - "Use conversation data for model improvement" → **OFF** (default is ON, this is a RODO violation if left on).
  - Audio retention → 0 days.
  - Transcript retention → 0 days (overridable per agent per call when `consent_flag=true`).
- **Apply for ElevenLabs Grants program Day 1**: 12 months free + 33M chars. If approved, EL cost goes to zero for the sprint.

### 1.4b ElevenLabs Agent Skills (one-time install)

Install the official ElevenLabs skill bundle so Claude Code sessions have LLM-optimized ElevenLabs docs auto-loaded:

```bash
npx skills add elevenlabs/skills
```

Pick "Claude Code" as the agent and "global" as the scope (installs to `~/.claude/skills/`). Takes ~30 seconds.

Bundle contains 6 skills. Relevant to us:

- `agents` — build voice AI agents with ElevenLabs. **Directly applicable.**
- `setup-api-key` — useful when Rem onboards Day 11.

Bundled but not used by us: `speech-to-text`, `text-to-speech` (handled inside `agents`), `music`, `sound-effects` (not in scope). Harmless to have installed.

### 1.5 Firecrawl (free tier 500 credits)

**Why Firecrawl over Playwright+Readability+GPT-4o-mini**: we save 1-2 days of scraper development. Firecrawl handles JS-rendered SPAs, returns clean markdown out of the box, has a managed crawl API that handles depth/path filtering, and is already wired as an MCP server + skills in our Claude Code environment (`firecrawl:firecrawl-scrape`, `firecrawl-crawl`, `firecrawl-map`, `firecrawl-extract`).

- Free tier: 500 credits ≈ 500 page scrapes. Polish clinic sites are typically 5-30 pages, so 20-50 clinics covered free.
- Sign up at firecrawl.dev → `FIRECRAWL_API_KEY` in `.env.local`.
- If we run out: $19/mo for 5,000 credits. Skip unless we hit the wall.

### 1.6 LLM provider keys

- **Anthropic API** (Claude Sonnet 4.6, primary agent reasoning): get key from console.anthropic.com. Use EU residency tier. `ANTHROPIC_API_KEY` in `.env.local`.
- **OpenAI API** (for benchmark + scraper extraction): platform.openai.com. EU residency tier. `OPENAI_API_KEY`. Used for `gpt-4o-mini` in Firecrawl extraction and as benchmark vs Claude on Polish call quality.

### 1.7 Twilio EU (Day 9-10, not yet)

- Sign up at twilio.com → pick **Ireland** as account region (Frankfurt media region available separately).
- Don't buy a number yet. Browser test works first; phone test happens Day 9-10.
- Plan: 1 Polish number ~$1/mo + $0.013/min inbound. ~$15/mo at pilot volume.

### 1.8 SMSAPI.pl (W2, not yet)

- Sign up at smsapi.pl. Test mode immediately available.
- Register **shared-brand sender ID** Day 1 of W2 (the company name once chosen). 2-7 day Polish operator approval window.
- Per-clinic branded sender IDs as +200 PLN/mo upgrade later.

### 1.9 Hetzner (optional W3, only if Vercel issues)

- Skip unless we hit a Vercel limit or need a long-running backend not suited to serverless.

---

## Part 2 — Knowledge architecture (the core technical decision today)

Three layered knowledge sources. The agent's RAG retriever pulls from all three at query time. Ordered by precedence; higher layer wins on conflicts.

### Layer 1 — Polish dental ontology (our authored IP)

**Path**: `apps/backend/ontology/`. Version-controlled in git. Committed to the agent's KB as separate markdown documents.

**Contents** (~30 services, ~20 synonyms, ~10 scripts):

- `services.md` — service taxonomy with Polish synonyms. Example section per service:

  ```
  ## Ekstrakcja zęba

  **Synonimy**: wyrwanie zęba, usunięcie zęba, ekstrakcja, wyrywanie zęba

  Typ: zabieg chirurgiczny
  Czas trwania (typowy): 30-45 min
  Konsultacja wymagana przed: tak
  NFZ: częściowo (zęby przednie, dorośli)
  Pytania od pacjenta (przykład):
  - "Ile kosztuje wyrwanie zęba?"
  - "Czy trzeba się umawiać na ekstrakcję?"
  - "Czy boli usunięcie zęba?"
  ```

- `triage.md` — escalation rules (medical questions → human, emergency → human, billing → human, etc.).
- `scripts.md` — default scripts for common flows (no-show recovery, recall, NFZ vs prywatne, hygiene reminder).
- `emergency-keywords.md` — pilne, ból nie do wytrzymania, spuchnięte, krwawi, etc. Trigger immediate handover.
- `consent.md` — exact Polish + English wording for the consent question at call start.

**Indexing rules** (so ElevenLabs RAG retrieves cleanly):

- One service / one rule per H2 section.
- Front-load Polish synonyms in each section so embedding retrieval matches caller language regardless of which synonym they used.
- Use explicit price lines `Cena: 4500 PLN` not markdown tables (tables chunk badly).
- Date-stamp prices: `Cennik aktualizowany: 2026-05-14`.
- Section length 200-500 tokens (sweet spot for most RAG retrievers).
- Polish primary. English and Russian as separate parallel sections per service so language-switched queries match.
- Include 1-2 example caller phrases per section — pushes retrieval embedding toward conversational matching.

### Layer 2 — Per-clinic knowledge base (Firecrawl-scraped, curated)

**Path**: `data/clinics/<clinic_id>/knowledge.md` (gitignored after Day 11; for now committed for one fake clinic).

**Pipeline**:

1. Paste clinic URL into wizard.
2. `firecrawl-map` lists all pages on the domain.
3. `firecrawl-crawl` extracts markdown from each page (depth ~2-3, path filter excludes blog/legal).
4. Consolidation step (Claude or GPT-4o): take all scraped markdown, output one structured `knowledge.md` with sections matching our ontology shape:
   ```
   ## Klinika
   Nazwa, adres, telefon, godziny otwarcia.
   ## Lekarze
   Imię, specjalizacja, języki, doświadczenie.
   ## Usługi i ceny
   Per-service: name, synonyms, price (PLN), duration, NFZ status.
   ## FAQ
   Parking, NFZ, dojazd, płatność.
   ```
5. Upload to ElevenLabs as agent knowledge document via `POST /v1/convai/knowledge-base/...`.

**Why we curate instead of letting ElevenLabs ingest the raw site**: Polish clinic sites vary wildly. Some are SPAs (need JS render), some have prices in images, some have prices on a separate `cennik` subpage, some have no prices online at all. Firecrawl normalizes everything to markdown; the consolidation step normalizes that to our schema; we get to see what was extracted and fix errors before upload.

### Layer 3 — Live website connector (ElevenLabs native, OPTIONAL complement)

ElevenLabs supports connecting a live URL as a knowledge source. They handle crawl + indexing.

**Decision: complement, not main**. Reasoning:

- Indexing quality is opaque. We can't see what was chunked, can't fix errors.
- Polish dental sites have inconsistent structure; quality will vary clinic-to-clinic.
- Our curated Layer 2 already covers everything Layer 3 would cover, at known quality.
- The only value Layer 3 adds is **freshness**: if the clinic updates prices on their website after we onboard, Layer 3 sees the change without us re-running the scraper.

**Verification plan (Day 8-9)**:

1. Pick one real clinic with a typical Polish dental website (5-15 pages, has prices, JS not heavy).
2. Configure agent A with Layer 1 + Layer 2 only.
3. Configure agent B with Layer 1 + Layer 2 + Layer 3 (website connector).
4. Ask both 20 test questions covering: prices ("Ile kosztuje implant?"), hours ("Czy w sobotę jest otwarte?"), services ("Robicie wybielanie laserowe?"), staff ("Kto leczy dzieci?"), NFZ ("Czy macie NFZ na ortodoncję?"), location ("Gdzie macie parking?").
5. Compare answer accuracy, response latency, hallucination rate.
6. **Decision rule**: if B beats A on >70% of question categories, ship with Layer 3 as default. If <70%, Layer 3 is opt-in per clinic. If equal or worse, Layer 3 is off.

This gets done before any pilot clinic goes live.

---

## Part 3 — Daily build sequence

### Day 7 — Today (2026-05-14)

**Account setup** (Jenya, ~1 hour):

- [ ] GitHub private repo created, this directory pushed
- [ ] Vercel project connected to repo, `vercel.json` with `fra1`
- [ ] Supabase project (Frankfurt) provisioned, keys in `.env.local`
- [ ] ElevenLabs workspace on Creator tier, training-data opt-out OFF, audio retention 0, API key in `.env.local`
- [ ] ElevenLabs Grants application submitted
- [ ] Firecrawl account created, key in `.env.local`
- [ ] Anthropic + OpenAI API keys in `.env.local`

**Coding** (Jenya, rest of day):

- [ ] Run `gsd-ai-integration-phase` → `docs/AI-SPEC.md` (~1 hour, interactive Q&A about agent eval strategy)
- [ ] Initial scaffolds:
  - `apps/backend/`: Node + TS + tsconfig + package.json
  - `apps/web/`: Next.js 15 + Tailwind + shadcn/ui + Supabase client
  - `packages/contracts/`: tsconfig + types skeleton
- [ ] First contract drafts:
  - `packages/contracts/voice-agent-provider.ts` (interface around ElevenLabs)
  - `packages/contracts/post-call-webhook.schema.ts` (Zod schema for ElevenLabs webhook payload)
  - `packages/contracts/scraper.schema.ts` (Firecrawl-output normalized type)
  - `packages/contracts/appointment-category.enum.ts` (initial draft, refined as ontology grows)
- [ ] Polish dental ontology v0 stubs in `apps/backend/ontology/`:
  - `services.md` with 10 services first (whitening, implant consultation, hygiene, ortho consultation, ekstrakcja, plomba, korona, leczenie kanałowe, konsultacja, wybielanie). Full 30 by Day 8.
  - `triage.md`, `emergency-keywords.md`, `consent.md`

### Day 8 — Scraper pipeline + ontology completion

- [ ] Scraper module in `apps/backend/scraper/`:
  - Input: clinic URL
  - `firecrawl-map` → list of pages
  - `firecrawl-crawl` → markdown for each
  - Consolidation step: pass all markdown to Claude Sonnet 4.6 with a JSON schema → structured clinic data (services, prices, hours, doctors, FAQ)
  - Output: writes `data/clinics/<clinic_id>/knowledge.md` + structured JSON to Supabase
- [ ] Test scraper on 2-3 real Warsaw dental clinic websites (Sebastian picks from his outreach list)
- [ ] Polish ontology to ~30 services
- [ ] Supabase schema: `clinics`, `agents`, `service_value_matrix`, `consent_log`, `bookings`
- [ ] RLS policies: each clinic only sees its own rows

### Day 9 — Orchestration + first agent

- [ ] ElevenLabs orchestration in `apps/backend/orchestration/`:
  - `provisionAgent(clinicId)`: POST /v1/convai/agents/create with ontology KB + per-clinic KB attached
  - `updateAgentKnowledge(agentId, kbDoc)`: PATCH agent KB references
  - `getAgentTranscript(callId)`: GET /v1/convai/conversations/{id}
- [ ] Provision one fake clinic agent end-to-end
- [ ] Browser test page in `apps/web/test-agent/`: paste agent ID, `@elevenlabs/react` widget loads, you talk to the agent
- [ ] **Knowledge architecture verification**: Layer 1+2 vs Layer 1+2+3 on the same fake clinic. Decide layer-3 default.

### Day 10 — Server tools + consent flow + post-call

- [ ] Server-tool webhooks in `apps/backend/tools/`:
  - `check_availability` (stub: returns 3 mock slots; real Booksy adapter wired by Rem later)
  - `create_booking` (stub: writes to Supabase `bookings` table with `appointment_category` from classifier)
- [ ] Consent flow: agent's first turn says the Polish + English script verbatim, classifier extracts `consent_flag` from caller's response. Default false on ambiguous.
- [ ] Post-call webhook receiver in `apps/backend/post-call/`:
  - Receives ElevenLabs webhook payload
  - Validates against `post-call-webhook.schema.ts`
  - Writes booking to Supabase
  - Conditionally stores transcript only if `consent_flag === true`
  - Computes `recovered_revenue` based on `appointment_category` × clinic's service value matrix
- [ ] End-to-end internal demo: paste URL → wizard → talk to agent → book appointment → see booking in Supabase

### Day 11 — Handoff to Rem + first real clinic

- [ ] All contract files locked. Tagged release on `dev`.
- [ ] Define Rem's concrete scope:
  - Wizard pages (URL input, scraper progress, agent test, service value matrix UI, optional Booksy paste, optional Twilio number)
  - Dashboard pages (calls handled, appointments booked, recovered PLN, status of outcome guarantee)
  - SMS short-URL landing page (`.ics` calendar add, optional email entry)
  - Booksy adapter v1 (URL/token paste; calendar read/write)
  - Vercel + Supabase deployment ownership
- [ ] First real clinic scraped + agent provisioned + browser-testable. Internal demo for Sebastian to use in Day-11 discovery meetings.
- [ ] Sync with Rem: walk through `packages/contracts/`, demo internal flow, agree on what he ships W2.

### Day 12-15 — W2: Pilot 1 + Inovo

- [ ] Pilot 1 customization with real clinic data
- [ ] Real Booksy connection (URL/token paste or full OAuth depending on what their API allows)
- [ ] SMS via SMSAPI + short URL + ICS landing page
- [ ] Dashboard v1 with PLN metrics
- [ ] Multilingual auto-detect (first 2 sec of caller audio → classify PL/EN/RU → switch agent voice + ontology language section)
- [ ] **Day 12 (18 May) Inovo Visit 17:00-21:00**: live browser demo on screen with Dawid Sugier. Ask for 5 portfolio clinic intros. Inovo's healthcare-adjacent investments: Jutro Medical, Infermedica, uPacjenta.
- [ ] 2nd pilot LOI signed by end of W2

### Day 16-22 — W3: Pilot 2 + Demo Day

- [ ] 2nd pilot live (different specialty or different PMS to widen integration coverage)
- [ ] Outcome metrics live with real recovered-PLN tracking
- [ ] Demo Day technical rehearsal (Day 19-20)
- [ ] Stretch: multilingual triple-call demo polished

**Day 22 — Demo Day, 30 May, Rotunda, 12:00-16:00**:

1. **Conversational inbound**: live phone call on stage. Patient asks unscripted Polish ("ile kosztuje implant"), agent qualifies, proposes slots, books one, sends SMS with short URL.
2. **Conversational outbound**: agent calls a "patient" who missed yesterday's appointment, real dialogue, rebooks live.
3. **Three languages, same number, three calls, three correct bookings**: PL → EN → RU.
4. **Dashboard slide**: real PLN recovered from pilot 1 over 2 weeks.
5. **LOI slide**: signed pilot or LOI from named Warsaw clinic, with owner quote.

---

## Part 4 — Risks specific to this plan

| Risk                                                                         | Mitigation                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firecrawl free tier runs out mid-W2                                          | Pre-budget: $19 for 5K credits once we hit 400 scrapes. Trivial cost.                                                                                                                           |
| ElevenLabs Grants not approved in time                                       | We pay $99 Pro from W2. Cost: $99 × 1 month. Trivial.                                                                                                                                           |
| ElevenLabs website connector hallucinates or chunks badly (Layer 3)          | Verification on Day 8-9 catches it; we default to Layer 1+2 only if it underperforms.                                                                                                           |
| Supabase free tier hits 500MB cap                                            | Unlikely at 1-5 pilots. If it happens, upgrade to Pro $25/mo.                                                                                                                                   |
| Scraper consolidation step (Claude) hallucinates clinic prices not in source | Hard rule in consolidation prompt: "do not invent prices; if a price is not in the source text, mark as `unknown` and flag for clinic review during onboarding." Validate output before upload. |
| Polish dental ontology v0 misses a common service synonym, retrieval fails   | Build a test suite of 50 representative Polish dental queries by Day 10. Track retrieval hit rate. Add synonyms iteratively.                                                                    |
| Pilot 1 Booksy doesn't expose API in time                                    | Fallback: URL/token paste, manual mirror to Google Calendar for the pilot. Doc states this is acceptable.                                                                                       |

---

## Part 5 — Handoff to new chat for implementation

When you start the new chat to begin Day 7 coding, do this at the very start:

1. **Read the operational brief**: `CLAUDE.md`.
2. **Read this plan**: `docs/plans/2026-05-14-end-to-end-plan.md`.
3. **Run `gsd-resume-work`** (or read `.continue-here.md` if I wrote one).
4. **Confirm account setup is done** (the Day 7 morning checklist above). Tell Claude which items are still pending.
5. **Pick first task**: I recommend `gsd-ai-integration-phase` first since it's interactive and informs subsequent design. Then `gsd-plan-phase` on W1 to produce `docs/plans/W1/PLAN.md` with verification gates, then `gsd-execute-phase` to run it.

Tell the new Claude session: _"Start with Day 7. Read CLAUDE.md and docs/plans/2026-05-14-end-to-end-plan.md. Account setup status: [list what's done and what's pending]. Run gsd-ai-integration-phase first, then gsd-plan-phase for W1."_

If you want to skip the AI-SPEC and go straight to scraper or orchestration code, that's fine too — the spec is a quality investment, not a blocker.

---

## Part 6 — Expanded GSD usage across the sprint

GSD is not just one skill we run once. The sprint maps cleanly onto its phase model. Here is the full sequence:

**Day 7**:

- `gsd-ai-integration-phase` → `docs/AI-SPEC.md` (framework rationale, eval strategy, guardrails).
- `gsd-plan-phase` for W1 → `docs/plans/W1/PLAN.md` with verification gates (e.g., "scraper produces valid markdown for 3 real clinics", "ElevenLabs agent provisioned for fake clinic", "consent flow returns deterministic `consent_flag` on 10 test transcripts").

**Day 8-10**:

- `gsd-execute-phase` runs the W1 plan in waves. Wave 1 (parallel): scraper module, ontology authoring, contract drafts. Wave 2 (after Wave 1 green): orchestration + agent provisioning. Wave 3: server tools + consent + post-call webhook. Each wave gates on its predecessors' verification.

**Day 11**:

- `gsd-discuss-phase` for W2 with Rem present → captures decisions: which integrations Rem owns end-to-end, whether he owns SMS pipeline, dashboard vs functional v1 trade-off.
- `gsd-plan-phase` for W2 → `docs/plans/W2/PLAN.md`.

**Day 12-15**:

- `gsd-execute-phase` for W2.
- `gsd-secure-phase` Day 14-15 before pilot 1 phone number goes live: verifies RODO mitigations (no audio storage, consent flag gating, EU regions, no PII in logs, training-data opt-out, transcript retention 0 unless consent), AI Act limited-risk transparency, escalation correctness.

**Day 16-22 (W3)**:

- `gsd-plan-phase` for W3 (pilot 2 + Demo Day rehearsal).
- `gsd-execute-phase` for W3.
- `gsd-eval-review` after pilot 1's first week of real calls: retroactive audit of how well the agent covered the AI-SPEC eval dimensions (Polish ASR accuracy, consent correctness, hallucination on prices, escalation accuracy, latency under SIP jitter).

**Per session, every session**:

- Start: `gsd-resume-work` → loads `HANDOFF.json` and `.continue-here.md`.
- Disoriented mid-session: `gsd-progress` → "where are we, what's next".
- Ambiguous "next" / "continue" from user: `gsd-do` → routes to the right GSD command.
- End: `gsd-pause-work` → writes durable handoff state.

---

## Part 7 — Parallel Claude Code sessions

Two patterns. Pick by task shape, not by ambition.

### Pattern A — Multiple top-level sessions

Separate tmux panes, separate IDE windows, or separate machines. Each session is its own conversation with its own context.

**Right for our sprint when**:

- Jenya works `apps/backend/` in session 1, Rem works `apps/web/` in session 2. Same repo, different files, both running Claude Code independently. Standard PR-merge flow keeps them in sync.
- Day 8-9: while you (Jenya) build the scraper in one session, you spin up a second session in another tmux pane to author the Polish dental ontology in parallel. Different files, no shared state. Cuts wall-clock time roughly in half on independent work.

**Wrong for**:

- Two sessions both editing `packages/contracts/post-call-webhook.schema.ts` simultaneously. Guaranteed merge pain. Always sequence work on shared files.

### Pattern B — Subagents inside one session via Agent tool

One Claude Code session, but it dispatches subagents for parallel research / independent sweeps. Use `superpowers:dispatching-parallel-agents` skill — it guides correct dispatch with sealed prompts and structured returns.

**Right for our sprint when**:

- Knowledge architecture verification (Day 8-9): dispatch 5 subagents in parallel, each tests Layer 1+2 vs Layer 1+2+3 on one Polish clinic site, returns a structured comparison. Main session synthesizes the verdict.
- Ontology synonym sweep: dispatch one subagent per service category to research Polish patient-language synonyms via Firecrawl + web search; main session merges into `services.md`.
- Pre-Inovo demo rehearsal: dispatch one subagent per planned demo question to stress-test the agent's answer quality in parallel.

**Wrong for**:

- Subagent that needs context from another subagent — sequence them.
- Tasks that are fundamentally sequential — adding subagent dispatch just adds coordination overhead.
- Critical-path implementation work — keep that in the main session for tighter control.

### Rule of thumb

If two pieces of work touch the same files, files in the same subtree, or share state, sequence them in one session. If they're genuinely independent (different subtrees, different research questions, different agent configs to bench), parallelize via Pattern A or Pattern B.

---

## Part 8 — Iterate-until-success pattern

You mentioned a `/goal` command. I checked the installed skills + slash commands in this environment — **no `/goal` skill or command is registered**. If you have a custom `/goal` slash command in `~/.claude/commands/` or `.claude/commands/` locally, tell me the path and I'll wire it into the loop. Otherwise the closest existing primitives:

| Primitive                     | When to use                                                                                         | What it does                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `superpowers:executing-plans` | **Default for our sprint.** Execute a plan file with verification gates until each gate goes green. | Reads `docs/plans/W<N>/PLAN.md`, executes step-by-step, runs verification at each gate, iterates on failure, stops on green. Tight scope. |
| `ralph-loop:ralph-loop`       | Ambitious "agent grinds at this for an hour" sessions. Token-hungry.                                | Continuous loop with self-feedback. Aggressive iteration toward a stated goal.                                                            |
| `loop` skill                  | Polling or time-interval reruns.                                                                    | `/loop 5m /run-tests` until green; `/loop 10m /check-vercel-deploy` until live. Useful for async waits, not for in-place iteration.       |
| `gsd-execute-phase`           | Phase-level execution with wave parallelization and goal-backward verification.                     | Reads `docs/plans/W<N>/PLAN.md`, identifies wave boundaries, dispatches subagents per wave, verifies wave completion, advances.           |

**My recommendation for the sprint**: default to `gsd-execute-phase` at the phase level (drives W1/W2/W3 plans to completion) and `superpowers:executing-plans` at the task level (drives individual feature plans to verified-green). Reserve `ralph-loop` for the one or two genuinely-stuck moments where you want Claude to grind unsupervised. Use `loop` only for actual polling work (deploy waits, CI checks).

If `/goal` does exist in your environment and I missed it, tell me the source — I'll switch over immediately.

---

## Part 9 — Access provisioning timeline + Day 11 handoff

People get accesses at the moment they can use them. Earlier than that is noise; later than that is a blocker.

### Access timeline

| When                               | Access granted                                                                                                                                                                  | Granted by        | Notes                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Day 7 (today)                      | Jenya as owner on: GitHub, Vercel, Supabase, ElevenLabs, Firecrawl, Anthropic, OpenAI                                                                                           | self              | All accounts created in Jenya's name initially; transfer to company entity post-incorporation in late June.                              |
| Day 7-8                            | Rem invited to private GitHub repo (write access)                                                                                                                               | Jenya             | Rem clones, reads `CLAUDE.md` + plans, doesn't push code yet (contracts not locked).                                                     |
| Day 10 (after internal demo green) | Rem added to: Supabase project (Developer role), ElevenLabs workspace (member with API key access). Firecrawl key shared via secure channel (1Password / Bitwarden / direct DM) | Jenya             | This is when Rem actually needs these to start his W2 work.                                                                              |
| Day 11 AM                          | **Jenya + Rem 60-90 min sync** (not an access event, but the moment Rem is fully onboarded)                                                                                     | both              | See handoff sequence below.                                                                                                              |
| Day 11 PM                          | Sebastian gets the live browser-test URL for the first real prospect clinic                                                                                                     | Jenya → Sebastian | This is "the thing Sebastian can sell with" — he walks into Tue/Wed discovery meetings with a working demo of the prospect's own clinic. |
| Day 14-15                          | Sebastian gets read-only URL to pilot 1's dashboard once data starts flowing                                                                                                    | Jenya → Sebastian | For ROI conversations in subsequent prospect meetings. No admin access.                                                                  |

### Vercel access nuance

Hobby tier is single-user. Two options for Rem:

- **Recommended for sprint**: Rem does NOT need a Vercel seat. Vercel's GitHub integration auto-deploys preview URLs per PR branch. Rem sees the deploy URL in his PR comments and can iterate locally + via preview. Production deploys gate on `dev` → `main` merges that Jenya owns.
- **If we need Rem to manage env vars or production domains directly**: upgrade to Pro $20/mo and add him as team member. Not needed before W3.

### Supabase access nuance

Free tier supports multiple team members per project. Add Rem as "Developer" role (read/write data; cannot delete project or change billing). Service-role key stays in `.env.local` and never goes in code or git.

### ElevenLabs access nuance

Business workspaces support multi-user. Add Rem as workspace member with API key access. Shared workspace means all agents (including pilots) are visible to both Jenya and Rem. Audit log tracks who did what.

### Day 10 — "internal demo green" gate (the test before delegating)

Internal demo must pass these by Day 10 EOD before Rem onboards and Sebastian gets the demo URL:

- [ ] Browser demo widget loads in under 3 seconds.
- [ ] Agent answers naturally in Polish for ≥8/10 test queries covering: prices, hours, services, booking, NFZ, parking, multilingual switch, escalation triggers, emergency keywords, vague intent.
- [ ] Consent flow returns deterministic `consent_flag` on 10 test transcripts (5 "tak", 5 "nie", 0 ambiguous defaults wrong).
- [ ] Booking appears in Supabase with correct `appointment_category` for ≥8/10 test bookings.
- [ ] Post-call webhook fires and writes to Supabase within 5 seconds of call end.
- [ ] No PII in Vercel logs (grep test passes).

If any of these fail Day 10 EOD, push handoff to Day 11 EOD and bump Sebastian's discovery meetings by 1 day.

### Day 11 handoff sequence

| Step | When               | Who               | What                                                                                                                                                                                                                                                                              |
| ---- | ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Day 10 EOD         | Jenya             | Internal demo green gate passed against fake clinic.                                                                                                                                                                                                                              |
| 2    | Day 11 09:30-11:00 | Jenya + Rem       | Codebase tour. Contract files walkthrough in `packages/contracts/`. Live demo end-to-end against fake clinic. Define Rem's W2 deliverables: wizard pages, dashboard pages, SMS short-URL landing, Booksy adapter v1, who owns SMS pipeline. Rem creates his first feature branch. |
| 3    | Day 11 11:00-13:00 | Jenya             | First real Warsaw clinic from Sebastian's outreach → Firecrawl → consolidate → upload KB → provision agent → test in browser.                                                                                                                                                     |
| 4    | Day 11 14:00       | Jenya → Sebastian | Hand off live browser-test URL of the real prospect clinic's own agent. Sebastian rehearses pitch with the demo for 1 hour.                                                                                                                                                       |
| 5    | Day 12             | Sebastian         | Walks into the first 1-2 discovery meetings with the working demo of the prospect's own clinic on his laptop.                                                                                                                                                                     |
| 6    | Day 12 onward      | Rem               | Opens first PR for wizard scaffold. Vercel auto-deploys preview URL. Self-merges after CI green (no contract files touched yet).                                                                                                                                                  |

### What Sebastian needs to do BEFORE Day 11 PM

For step 3 to work, Sebastian must deliver by Day 11 morning:

- One real Polish dental or aesthetic clinic from his Warsaw outreach list whose URL we'll scrape.
- Clinic doesn't need to be the signed pilot — just any real clinic from the discovery pipeline that he can show their own AI receptionist to.
- Ideally the clinic owner is the one Sebastian is meeting Tue/Wed, so the demo is of THEIR practice.
