# Harness Readiness Audit — ai_receptionist

Date: 2026-05-23
Auditor: Claude Code (harness-readiness-audit skill)
Repo root: `/Users/jenyafutrin/workspace/claude_projects/ai_receptionist`
Current branch: `main`

## 1. Classification

**App repo (multi-package pnpm workspace).** Two runnable apps (`apps/web` Next.js, `apps/backend` Hono on Node) plus a contract package (`packages/contracts`). The repo also hosts the team's operational ledger and plan archive, but those are gitignored, so the public/agent-facing surface is squarely an app repo.

## 2. Current strengths

- **Strong root brief.** `CLAUDE.md` (13 KB) is current, prescriptive, and points to deeper docs. Project rules (RODO, EU-only, consent gates, audio off) are explicit.
- **Decision history exists.** `PROJECT_LOG.md` is being maintained.
- **Workspace boundary is clean.** `pnpm-workspace.yaml` + `tsconfig.base.json` + per-package `tsconfig.json` and `package.json`. TypeScript strict + `noUncheckedIndexedAccess` + `noImplicitOverride`. Modern, agent-friendly.
- **Test scaffolding present where it matters most.** 29 backend + contracts test files covering consent, scraper, tools, post-call, integrations.
- **CI workflow is well-designed.** `.github/workflows/ci.yml.disabled` covers format-check + contracts build + backend build + typecheck + test + web build, with concurrency cancel.
- **EU-region defaults baked into config.** `apps/web/vercel.json` pins `fra1`. Supabase env points to `eu-west-1`.
- **Privacy guardrails in `.gitignore`** for operational ledger, handovers, plans, session continuity, test sessions, and admin scripts.
- **Recent commits show real engineering discipline** (consent pivot, prompt sharpening, observability surfacing).

## 3. Findings

### P0 — blocks safe agent work now

**F1. CI is disabled.** `/Users/jenyafutrin/workspace/claude_projects/ai_receptionist/.github/workflows/ci.yml.disabled`. The file is well-formed and matches the project's actual command surface, but GitHub will not pick it up. Agent-authored PRs (and your own) have no automated green/red signal. For a project 7 days from pilot launch with patient PII in play, this is the single biggest harness gap.

**F2. No canonical verify command.** Root `package.json` has `build`, `dev`, `typecheck`, `lint`, `test`, `format`, `format:check` as separate scripts. No single `verify` entry point. Agents (and CI) currently have to know the right order (contracts build → backend build → typecheck → test → web build). This is encoded in `ci.yml.disabled` but nowhere a developer or agent can run it from one command. The whole pre-PR check sequence is implicit.

**F3. Branch model in `CLAUDE.md` does not match git history.** `CLAUDE.md` § "Parallel work and PR review rules" specifies `dev` integration branch + feature branches → PRs to `dev`. Reality: `dev` branch does not exist locally or on origin. Last 15 commits all landed on `main` directly, no PRs. Only other branch (`feature/core-wave2`) is 82 commits behind main, 0 ahead — fully stale.

Why this matters for agents: a new agent reading `CLAUDE.md` will try to create `feature/...` branches and target a non-existent `dev`. Either fix the model or fix the docs; right now they contradict.

### P1 — high-leverage

**F4. Web app has zero tests and lies about it.** `apps/web/package.json` declares `"test": "echo 'no tests yet'"`. The consent UI, owner dashboard, and `/api/*` route handlers all ship to pilot 1 untested. The echo means `pnpm test` passes green at the workspace level even when web has nothing — masking the gap from CI signal.

**F5. Empty ghost directories.** `apps/backend/apps/backend/{src, src/lib, test, test/lib}` exist as empty dirs (0 B total). Probable leftover from a refactor. Confuses `find`, IDE indexers, and grep. Low risk to delete.

**F6. ~~Duplicated skill stores~~ — RESOLVED, finding was wrong.** `.claude/skills/` contains symlinks pointing at `.agents/skills/`; canonical content lives once under `.agents/`. `diff -rq` followed the symlinks and looked like duplication. No action needed. Audit error corrected 2026-05-23.

**F7. No mechanical guardrails for the hard rules.** `CLAUDE.md` § "Hard rules" lists ~10 invariants (no PII in logs, no audio storage, default `consent_flag = false`, audio-saving permanently off, EU regions). None of these are enforced by a test, validator, or pre-commit hook. They are prose. A regression that flips audio-saving back on, or default-trues `consent_flag`, would not be caught until production.

**F8. No env validator at startup or in CI.** `.env.example` exists, but neither the backend `start` nor the web `dev`/`build` checks that required keys are present. A missing `ELEVENLABS_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` surfaces only at first request. Onboarding (e.g., Rem in Week 2) will hit this.

**F9. README has no harness pointer for the public repo.** `README.md` is 13 lines, marketing-only. The repo is public ("for transparency to pilot clinics") but no public-facing pointer to setup, verify, or contribution flow exists. Agents cloning the repo without `CLAUDE.md` (which is gitignored) have only the marketing text.

### P2 — maturity upgrades

**F10. Root clutter.** Stray artifacts at repo root reduce legibility:

- `PROJECT.html` (40 KB) — looks like a one-time export of `PROJECT.md`; tracked in git.
- `excalidraw.log` (1.7 KB) — Excalidraw MCP server log; should be gitignored or deleted.
- `design.md` (9 KB) — real design-system spec, belongs in `docs/` rather than root.
- `vertical_pivot_brief.md` (3.7 KB) — gitignored personal brief, but tidier as `docs/internal/`.
- `REVIEW.md` (10 KB) — gitignored prior-audit artifact, fine but stale.

**F11. `apps/web/prebuild` rebuilds backend from scratch on every web build.** `apps/web/package.json`:

```
"prebuild": "pnpm -F @ai-receptionist/contracts run build && pnpm -F @ai-receptionist/backend run build"
```

Acceptable for CI (where build order is needed), but slows local web dev iteration. Worth documenting or scoping to a `build:full` variant.

**F12. `PROJECT_LOG.md` is 46 KB.** Append-only is the right pattern, but at this size agents will read only the head/tail. Consider rotating completed-phase entries into `docs/log/` quarterly.

**F13. No CODEOWNERS or PR template.** Given the contract-file PR-gating rule in `CLAUDE.md`, both would enforce the rule mechanically.

## 4. Proposed changes (prioritized)

| #   | Change                                                                                                                                                                                                                                                            | File(s)                                                               | Severity | Risk                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| 1   | Rename `ci.yml.disabled` → `ci.yml`. Pre-flight: run the same steps locally and confirm green.                                                                                                                                                                    | `.github/workflows/ci.yml`                                            | P0       | Medium — needs local green first                      |
| 2   | Add `verify` script at root that runs `format:check && contracts build && backend build && typecheck && test && web build` (same sequence as CI).                                                                                                                 | `package.json`                                                        | P0       | Low                                                   |
| 3   | Reconcile branch model: either delete the stale `feature/core-wave2`, create `dev`, and start using PRs — or update `CLAUDE.md` to reflect `main`-direct reality. Recommend the latter for solo-author velocity, switch to PR flow when Rem onboards.             | `CLAUDE.md`, optionally `git push origin --delete feature/core-wave2` | P0       | Low (doc), Low (branch delete after confirming stale) |
| 4   | Add minimal web smoke test: at least one Vitest or Playwright test that asserts the consent gate component mounts and the `/api/owners` route handler returns expected shape. Change `"test": "echo..."` to a real runner.                                        | `apps/web/package.json`, `apps/web/test/smoke.test.ts`                | P1       | Low                                                   |
| 5   | Delete empty nested ghost dirs `apps/backend/apps/`.                                                                                                                                                                                                              | filesystem                                                            | P1       | Zero — they contain no files                          |
| 6   | Resolve `.agents/skills/` vs `.claude/skills/` duplication. Pick one canonical location, delete the other, document in CLAUDE.md.                                                                                                                                 | `.agents/`, `.claude/`                                                | P1       | Low — confirm which the harness reads                 |
| 7   | Add `pnpm verify:rules` script: a tiny grep-based validator that fails if it finds (a) `console.log` of any field containing `phone`/`patient`/`pesel`/`birth`, (b) `consent_flag\s*=\s*true` as a default, (c) audio-storage config flipped on. Wire it into CI. | `scripts/verify-rules.sh`, `package.json`, `ci.yml`                   | P1       | Low                                                   |
| 8   | Add startup env validator: a tiny `apps/backend/src/lib/env.ts` (and web equivalent) using zod to validate required keys on boot, with a helpful error listing missing ones.                                                                                      | new files                                                             | P1       | Low                                                   |
| 9   | Expand `README.md` from 13 lines to ~30: add a "Local setup" section pointing to `.env.example`, a "Verify" section pointing to `pnpm verify`, and a "For agents / contributors" line referencing private `CLAUDE.md`. Keep marketing tone intact.                | `README.md`                                                           | P1       | Low                                                   |
| 10  | Move root clutter: `design.md` → `docs/design.md`; gitignore `excalidraw.log`; delete `PROJECT.html` if obsolete; move `vertical_pivot_brief.md` → `docs/internal/` (still gitignored).                                                                           | filesystem, `.gitignore`                                              | P2       | Low                                                   |
| 11  | Document the `prebuild` chain in `apps/web/README.md` or a comment, or extract a `build:full` script.                                                                                                                                                             | `apps/web/package.json`                                               | P2       | Low                                                   |
| 12  | Add `.github/CODEOWNERS` requiring Jenya review for `packages/contracts/*`. Add `.github/pull_request_template.md` with verify-command checklist.                                                                                                                 | new files                                                             | P2       | Low                                                   |

## 5. Verification plan

After each batch of approved changes:

1. **Item 1 (CI rename)**: locally run the exact CI sequence first:

   ```
   pnpm install --frozen-lockfile
   pnpm format:check
   pnpm -F @ai-receptionist/contracts build
   pnpm -F @ai-receptionist/backend build
   pnpm typecheck
   pnpm test
   pnpm -F @ai-receptionist/web build
   ```

   If all green, rename the file and push a no-op commit to trigger the workflow. Confirm green badge.

2. **Item 2 (verify script)**: run `pnpm verify` from clean state. Expect same exit code as the manual sequence.

3. **Item 4 (web smoke test)**: run `pnpm -F @ai-receptionist/web test`. Confirm new test runs and the workspace-level `pnpm test` still passes.

4. **Items 5, 6, 10 (cleanup)**: run `pnpm verify` after deletes; confirm typecheck still green, no broken imports.

5. **Item 7 (rules validator)**: run `pnpm verify:rules`; confirm exit 0 against current tree. Then temporarily break a rule (add a forbidden log line in a scratch file) and confirm exit 1.

6. **Item 8 (env validator)**: start backend with a key removed from `.env.local`, confirm clear error listing the missing key.

7. **Item 9 (README)**: visual review, no commands to run.

8. **Item 12 (CODEOWNERS, PR template)**: open a throwaway PR touching `packages/contracts/*`, confirm review-required gate fires.

## 6. Approval request

**Approve which batches to implement?**

- Batch A — P0 only (items 1, 2, 3). ~30 min. Highest leverage.
- Batch B — P0 + P1 cleanup (items 1-9). ~2 hours.
- Batch C — everything (items 1-12). ~3 hours.
- Custom — name specific items.
