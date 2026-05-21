# `ontology/` · Layer 1 of the 3-layer knowledge architecture

This directory holds the **authored, vertical-specific knowledge** that overlays scraped tenant data. Per `docs/AI-SPEC.md` and `CLAUDE.md`:

- **Layer 1** (here): authored ontology covering services, triage rules, scripts, emergency keywords, consent script.
- **Layer 2**: per-tenant Firecrawl-scraped + consolidated `data/clinics/<tenant_id>/knowledge.md`.
- **Layer 3** (optional): ElevenLabs native website connector (A/B tested in W1.5).

## VERTICAL LOCK STATUS · LOCKED = dental (2026-05-21)

Vertical is locked on Polish dental clinics. All Layer 1 files in this directory are authored content.

| File                    | Status                     | Why                                                                                                                                                  |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consent.md`            | **REAL CONTENT** (PL + EN) | Consent wording is vertical-independent per `CLAUDE.md`: RODO-driven, not domain-driven. Used by the runtime classifier in `apps/backend/consent/`. |
| `services.md`           | Authored 2026-05-21        | Polish dental service taxonomy with PL primary, EN + RU parallel summaries.                                                                          |
| `triage.md`             | Authored 2026-05-21        | Three-tier dental escalation rules (NAGŁY / PILNY / PLANOWY).                                                                                        |
| `scripts.md`            | Authored 2026-05-21        | Default Polish conversational flows: greeting, booking, cancellation, recall, unknown-situation fallback.                                            |
| `emergency-keywords.md` | Authored 2026-05-21        | Polish emergency phrases by category, with inflection variants and an escalation rule.                                                               |

## Indexing rules (apply once content lands)

Per `docs/AI-SPEC.md` Section 3 "Common Pitfalls" item 2 + `docs/plans/2026-05-14-end-to-end-plan.md` Part 2:

- One service / one rule per H2 section.
- Polish synonyms front-loaded in each section.
- **Prices are NOT in Layer 1.** Per-clinic Layer 2 is the source of truth for prices and any clinic-specific data. The ontology describes services universally (synonyms, typical duration, national-level NFZ rules, caller phrasing).
- Section length 200-500 tokens.
- Polish primary; EN and RU as parallel sections per service.
- Include 1-2 example caller phrases per section.

## Process when vertical locks

1. Re-run `/gsd-ai-integration-phase` with the vertical name to refill Section 1b of `docs/AI-SPEC.md`.
2. AI-bootstrap Layer 1 by Firecrawl-scraping 20-30 authority sites in the vertical and consolidating with Claude into structured markdown.
3. Human-review the consolidated output before committing.
4. Append to `services.md`, `triage.md`, `scripts.md`, `emergency-keywords.md`.
5. Localize `apps/backend/consent/` and `apps/backend/scripts/` runtime strings.
6. Pick first PMS adapter (vet → Vetmanager; HVAC → Google Calendar; senior-care → TBD) and implement against the existing `CalendarProvider` interface.
