# `@ai-receptionist/contracts`

Shared Zod schemas + TypeScript types between `apps/web` (Rem) and `apps/backend` (Jenya).

## PR review rule

**Per CLAUDE.md and `docs/plans/2026-05-14-kickoff.md`**: PRs that touch any file in this package require Jenya's approval. Outside this package, the author self-merges after CI green.

## What lives here

| File                             | Purpose                                                              | Locked by |
| -------------------------------- | -------------------------------------------------------------------- | --------- |
| `voice-agent-provider.ts`        | `VoiceAgentProvider` interface (ElevenLabs impl today, swappable)    | W1.2      |
| `calendar-provider.ts`           | `CalendarProvider` interface (PMS adapters plug into this)           | W1.2      |
| `post-call-webhook.schema.ts`    | Zod for ElevenLabs post-call webhook payload                         | W1.2      |
| `scraper.schema.ts`              | Zod for the scraper's normalized output (vertical-generic shape)     | W1.2      |
| `appointment-category.enum.ts`   | Categorical classifier output (placeholder, vertical-flavored later) | W1.2      |
| `consent-flag.schema.ts`         | Branch logic gating transcript storage                               | W1.2      |
| `service-value-matrix.schema.ts` | Per-tenant price table for ROI math                                  | W1.2      |
| `server-tools.contract.ts`       | Zod schemas for `check_availability` + `create_booking` payloads     | W1.2      |
