# AI Receptionist (working name)

Polish-first multi-tenant voice AI receptionist. Built end-to-end during the START Warsaw 3-week sprint (8-30 May 2026). Demo Day at Rotunda 30 May.

## What this is today

Vertical-agnostic core. The vertical (vet vs HVAC vs senior-care) locks 2026-05-18; until then the ontology layer is stubbed and the scaffolding is provider-portable.

- **`apps/backend/`** — Node + TypeScript. ElevenLabs ConvAI orchestration, Firecrawl-driven scraper, server-tool webhooks, post-call webhook, consent classifier.
- **`apps/web/`** — Next.js 15 + Tailwind + shadcn/ui (added on demand). Onboarding wizard + dashboard + browser-test widget.
- **`packages/contracts/`** — Zod schemas + TS types shared across web ↔ backend. **PR-gated** — changes require Jenya's approval.
- **`supabase/migrations/`** — Postgres schema with RLS. Frankfurt (`eu-central-1`).
- **`docs/AI-SPEC.md`** — AI design contract (framework, eval strategy, guardrails, monitoring).
- **`docs/plans/`** — week-by-week build plans with verification gates.

## Operational brief

Read `CLAUDE.md`. It's the source of truth for hard rules (no audio storage, transcripts only with consent, EU regions everywhere, Polish phrasing canonical).

## Local dev

```bash
nvm use                  # Node 20.18.1
npm install -g pnpm      # if not installed
pnpm install
cp .env.example .env.local
# fill in keys

pnpm typecheck           # all workspaces
pnpm test                # all workspaces
pnpm -F @ai-receptionist/web dev      # http://localhost:3000
pnpm -F @ai-receptionist/backend dev  # http://localhost:3001 (Hono)
```

## Stack

| Layer         | Choice                            | Why (one-liner)                                                                                                        |
| ------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Voice runtime | ElevenLabs ConvAI                 | Best Polish TTS + native Twilio EU + integrated agent runtime. Abstracted behind `VoiceAgentProvider` for portability. |
| Agent LLM     | Claude Sonnet 4.6 (EU)            | Quality + EU residency.                                                                                                |
| Scraper       | Firecrawl                         | Managed JS-rendering crawler; 1-2 days saved over Playwright.                                                          |
| Web           | Next.js 15 + Tailwind + shadcn/ui | Direct-with-Claude-Code build (no Lovable).                                                                            |
| Backend       | Node + TypeScript + Hono          | Lightweight, runs cleanly on Vercel + Hetzner alike.                                                                   |
| DB            | Postgres / Supabase Frankfurt     | Auth + RLS + EU residency for RODO.                                                                                    |
| Telephony     | Twilio EU media region            | Per-tenant Polish numbers.                                                                                             |
| SMS           | SMSAPI.pl                         | Shared-brand sender ID for pilots.                                                                                     |
| Hosting       | Vercel `fra1`                     | Backup: Hetzner Falkenstein.                                                                                           |

## Deployment regions (mandatory)

- Vercel: `fra1` (set in `vercel.json`).
- Supabase: Frankfurt (`eu-central-1`).
- Twilio: EU media region.
- LLM: EU residency tier (Anthropic).

## Branch model + PR rules

- `main` (deployable) ← `dev` (integration) ← `feature/<lane>-<scope>`.
- PR review required ONLY for `packages/contracts/*`. Everywhere else, author self-merges after CI green.

## Privacy guardrails (NOT optional)

Per `CLAUDE.md`:

- Never store audio. ElevenLabs `recordVoice=false`, `storeCallAudio=false`, `retainCallDataDays=0`.
- Transcripts stored only when `consent_flag === true` (DB-side trigger enforces).
- ElevenLabs workspace setting "Use conversation data for model improvement" → OFF.
- No PII in Vercel logs. Use `apps/backend/lib/logger.ts` (PII-redacting Pino, lands W2.6).
