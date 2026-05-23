# apps/web

Next.js 16 App Router. Hosts the onboarding wizard, owner dashboard, public landing, SMS short-URL pages, and all `/api/*` routes (ElevenLabs server-tools, post-call webhook, provisioning, etc.).

## Build dependency on the backend package

`apps/web` imports compiled artefacts from `@ai-receptionist/backend` (workspace dep) — specifically `dist/orchestration`, `dist/tools`, `dist/post-call`, `dist/consent`, etc. The backend package emits `.d.ts` and `.js` to `apps/backend/dist/`, and the web app's typecheck + build need that `dist/` to exist.

This is why `apps/web/package.json` declares:

```json
"prebuild": "pnpm -F @ai-receptionist/contracts run build && pnpm -F @ai-receptionist/backend run build"
```

Every `pnpm -F @ai-receptionist/web build` (and every `pnpm verify`) re-emits both packages first. CI relies on the same chain.

Local-iteration tip: when iterating on web-only code, run `pnpm -F @ai-receptionist/web dev` (no prebuild) and `pnpm -F @ai-receptionist/backend dev` in a second terminal — `tsx watch` rebuilds backend on save.

## Tests

`vitest run` over `apps/web/test/**/*.test.ts` and `apps/web/lib/**/*.test.ts`. Node environment. Use `pnpm -F @ai-receptionist/web test`.

## Lint

ESLint 9 flat config in `eslint.config.mjs`. Uses `eslint-config-next/core-web-vitals` with two React 19 strict-mode rules demoted (see comments in the config).

## `public/` is web-public — do not put anything sensitive here

Next.js serves every file under `apps/web/public/` as a static asset reachable by URL with no auth. Anything dropped in here is fetchable by the entire internet. Today:

- `public/legal/clinic-website-notice-template.md` — intentional. Compliance template clinics paste on their websites; being able to link to it from a public repo is itself a transparency signal.

Do NOT put inside `public/`:

- Backend keys, API tokens, signed URLs of any kind.
- Patient transcripts, call recordings, prospect lead data.
- Internal-only design docs, prompts, or planning notes.
- Anything from the local-only `docs/` tree.

When in doubt, put it under `apps/web/lib/`, `apps/backend/`, or `docs/` instead.
