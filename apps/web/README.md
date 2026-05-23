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
