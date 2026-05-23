# Recepcjonistka

Polish-speaking AI receptionist for dental clinics. Closed source, operator-only tool.

The product answers phone calls in Polish, books appointments, and confirms by SMS, on behalf of small private dental practices.

## Contact

For pilot enquiries or commercial questions, write to [yauheni.futryn@gmail.com](mailto:yauheni.futryn@gmail.com).

## Licence

All rights reserved. The source code is provided here for transparency to pilot clinics and is not licensed for use, distribution, or modification by third parties. No grant of any kind is implied by this repository being public.

## Repository layout

- `apps/web/` — Next.js 16 (App Router) + Tailwind. Onboarding wizard, owner dashboard, public landing, SMS short-URL pages. Public legal templates under `apps/web/public/legal/`.
- `apps/backend/` — Hono on Node. ElevenLabs orchestration, Firecrawl-based scraper, server-tool webhooks, post-call handlers, consent classifier.
- `packages/contracts/` — Zod schemas + TypeScript types shared by the web and backend tiers. Changes here are PR-gated.
- `supabase/` — database schema (EU, Ireland `eu-west-1`).

Internal documentation (strategy, plans, sales materials, session handovers) lives in a local-only `docs/` tree that is not tracked in this repo.

## Local setup

Requires Node 22.13+ and pnpm 11.1.2 (pinned).

```bash
pnpm install
cp .env.example .env.local   # then fill in the required keys
pnpm env:doctor              # confirms .env.local has every required key
pnpm verify                  # full local CI gate (format, build, typecheck, lint, test, rules)
```

The runtime needs a Supabase project (EU region), an ElevenLabs API key, a Firecrawl key, and a Gemini key at minimum. Telephony (Twilio) and SMS (SMSAPI) keys are W2+ and only required once those features are wired into a clinic.

## Commands

| Command             | Purpose                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Start web (port 3000) + backend (port 3001) in parallel.                                                               |
| `pnpm verify`       | Canonical local + CI gate. Runs format:check, builds, typecheck, lint, test, rules validator. Use this before pushing. |
| `pnpm verify:rules` | Run the mechanical guardrail for hard rules only (audio storage, consent default, EU regions, PII in logs). Fast.      |
| `pnpm env:doctor`   | Confirm `.env.local` has every required key.                                                                           |
| `pnpm test`         | All workspace tests (backend + contracts + web).                                                                       |
| `pnpm lint`         | ESLint across all packages.                                                                                            |
| `pnpm format`       | Prettier write across the tree.                                                                                        |

## CI

`.github/workflows/ci.yml` runs `pnpm verify` on every push to `main` and every PR. The local and CI gates are deliberately identical.
