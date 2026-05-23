# Security Best Practices Report — AI Receptionist

**Date**: 2026-05-23
**Auditor**: Claude Code (security-best-practices skill)
**Scope**: full repo, with focus on `apps/web` (Next.js 16.2.6 + React 19) and `apps/backend` (Hono on Node 22)
**Method**: rule-by-rule scan against Next.js / React / general-frontend security specs + Supabase RLS + ElevenLabs webhook patterns

## Executive Summary

The codebase already has the load-bearing pieces right: ElevenLabs webhook signature verification on every server-tool + post-call route, service-role key cleanly scoped to server-only paths, Supabase RLS for cross-tenant isolation, Zod input validation on every API route I sampled, no React raw-HTML escape hatch usage, no dynamic-code-execution sinks, no PII or service-role keys in client-bundled modules, Next.js patched against the recent react2shell CVE (16.2.6 >= 16.0.7), and no `localStorage` of session tokens. Webhook signature verifier has tests added in the harness pass.

The gaps are **operational hardening** rather than design-level holes. The two findings rated **Critical** are both abuse-prone unauthenticated endpoints (an LLM/Firecrawl quota burner and a 4-digit PIN with no rate limit). The two **High** findings are missing rate limiting (auth + transcript spam) and missing security headers. Everything else is Medium or below — mostly defense-in-depth.

Pilot 1 ships in days. Recommend fixing F1, F2, F3 before any public-facing demo URL is shared; F4 before the SIP number goes live; F5 + F6 before Demo Day (30 May).

Severity counts: **2 Critical, 4 High, 5 Medium, 2 Low**.

---

## Critical findings

### F1 — `/api/prepare` is unauthenticated and burns paid LLM + Firecrawl quota per request

- **Rule**: NEXT-AUTH-001 (missing authn on state-changing endpoint) + NEXT-DOS-001 (expensive abuse-prone endpoint with no rate limit) + NEXT-SSRF-001 (server fetches user-supplied URL)
- **Severity**: Critical
- **Location**: `apps/web/app/api/prepare/route.ts:72-300+`
- **Evidence**: The route's POST handler validates body shape via Zod, then immediately calls Firecrawl `map` + scrape (up to 50 pages, concurrency 3) and Gemini `consolidate` (large-context LLM call). `maxDuration = 300` seconds. No `getOperatorOrJsonError()`, no `requireOperator()`, no `auth.getUser()` check anywhere in the file.
- **Impact**: Anyone who learns the URL can:
  1. Burn Firecrawl quota (paid tier, billed per page) and Gemini quota (paid tier, billed per token) at $X per request.
  2. Tie up Vercel function concurrency for 60-180 s per call.
  3. Use the server as a reconnaissance proxy: attacker submits a URL, server fetches it via Firecrawl, attacker learns whether the target responds and what it contains.
  4. Cause Vercel function bills to grow linearly with attacker request volume.
- **Fix**: Add `const operator = await getOperatorOrJsonError(); if (!operator.ok) return NextResponse.json(operator.body, { status: operator.status });` at the top of the POST handler, mirroring `apps/web/app/api/provision/route.ts:33`. Both endpoints are operator-only by design — `/api/provision` already enforces this; `/api/prepare` should match.
- **Mitigation if fix is delayed**: rate limit at the Vercel edge (Vercel WAF rule, or upstash ratelimit) keyed on IP. Aggressive — 3 requests / IP / hour — since this is an internal tool.
- **False positive notes**: confirmed by grep across `apps/web/app/api/prepare/route.ts` for `getOperator|requireOperator|auth\.getUser|operator` — only matches are comments and a `firecrawl` keyword.

---

### F2 — 4-digit PIN brute-forceable on `/api/conversations` and `/api/conversations/[id]`

- **Rule**: NEXT-AUTH-001 (insufficient credential strength) + NEXT-DOS-001 (no rate limit on credential-checking endpoint) + crypto best practices
- **Severity**: Critical (combined: weak credential + unlimited attempts)
- **Location**:
  - PIN check sites: `apps/web/app/api/conversations/route.ts:51-58`, `apps/web/app/api/conversations/[conversationId]/route.ts:30-41`
  - PIN generation: `apps/web/app/api/agents/[providerAgentId]/pin/route.ts:11-13` — `Math.floor(1000 + Math.random() * 9000)`
- **Evidence**:
  - PIN is 4 digits, namespace = 9,000 values.
  - `Math.random()` is not cryptographically secure (per Node docs: "values are not cryptographically secure").
  - PIN check returns 403 immediately on mismatch, but no rate limit, no progressive backoff, no IP/agent throttle.
  - Combined: an attacker who knows a `providerAgentId` (visible in any demo URL the operator shares) can brute-force 9,000 PINs at modest concurrency in seconds.
- **Impact**: Successful brute force lets the attacker enumerate ALL `pin_demo` conversations for that agent, including any patient-side dialogue from prospect demos. Cross-tenant — affects every clinic that's been demoed via PIN.
- **Fix** (in order of importance):
  1. Add rate limit on `pin` parameter usage: max 5 attempts per agent per minute, max 50 per IP per hour. upstash ratelimit + Vercel KV or in-DB.
  2. Lengthen PIN to 6 digits (1,000,000-space) and generate with `crypto.randomInt(100000, 1000000)`.
  3. Add a "wrong PIN" counter on the `agents` row and lock the PIN after 10 failures, requiring operator to mint a new one.
- **Mitigation if fix is delayed**: rotate every PIN currently in `agents.pin_code` to 6 digits via a one-off script using `crypto.randomInt`. Even without rate limiting, expanding the space buys time.
- **False positive notes**: confirmed PIN generation uses `Math.random()` at the cited line. Confirmed no rate limit infra exists (grep for `ratelimit|throttle` returns zero hits in `apps/web`).

---

## High findings

### F3 — `/api/test-transcript` is unauthenticated, accepts service-role DB writes

- **Rule**: NEXT-AUTH-001 (no authn on write endpoint) + NEXT-DOS-001 (unbounded write spam)
- **Severity**: High
- **Location**: `apps/web/app/api/test-transcript/route.ts:42-90`
- **Evidence**: POST handler validates body shape via Zod (good), then calls `getServiceRoleSupabase().from("test_transcripts").insert(...)`. No auth check, no rate limit. The local FS write path IS bounded (`SAFE_ID_RE` regex + boundary check at lines 30/87-90 — good), but the DB write is not.
- **Impact**: Attacker can flood `test_transcripts` with junk rows tied to any `agentId` they know. Each write goes through the service-role client (bypasses RLS). Fills Supabase Free tier storage quota; degrades query performance on the operator dashboard; obscures real test sessions in noise.
- **Fix**: Add a lightweight auth check. Two options:
  1. **PIN-gated** (simplest): require the same `pin` parameter the demo URL uses. If `pin` validates against `agents.pin_code`, accept the write. Treats transcript writes as part of the PIN session.
  2. **Operator + service-role-key bearer**: require either a logged-in operator (covers the `/test/*` UI path) or a server-side bearer token (covers automated tests). The bearer would be a separate secret, never shipped to the browser.
- **Mitigation**: rate limit by `(agentId, conversationId)` — accept first N writes per session, drop the rest.

---

### F4 — `/api/twilio/inbound` will accept un-signed Twilio webhooks when the feature flag flips

- **Rule**: NEXT-WEBHOOK-001 (webhook signature verification missing)
- **Severity**: High (latent — currently gated by `TWILIO_INBOUND_ENABLED=1`)
- **Location**: `apps/web/app/api/twilio/inbound/route.ts:31-64`
- **Evidence**: When `ENABLED` is true, the handler reads `req.formData()`, looks up `agents.pin_code` against caller DTMF, and returns `<Dial><Sip>...sip.elevenlabs.io</Sip></Dial>`. No check on `X-Twilio-Signature` header. Twilio docs require validating the signature to ensure the request originated from Twilio.
- **Impact** (when enabled): anyone can POST `Digits=1234` and brute-force PINs against the agents table (different surface than F2 but same underlying issue). Worse, every successful PIN reveals the SIP endpoint URL the call gets dialed to — potential toll-fraud surface if the SIP endpoint isn't itself locked down on the ElevenLabs side.
- **Fix**: validate the Twilio signature before any DB lookup. Twilio's algorithm: HMAC-SHA1 of the URL + alphabetically-sorted POST params, keyed by Twilio Auth Token, base64-compared to `X-Twilio-Signature`. Library option: `twilio` npm package exports `validateRequest()`. Reject with 403 on mismatch.
- **Mitigation if fix is delayed**: keep `TWILIO_INBOUND_ENABLED=0` (current default). Do NOT flip the flag to 1 until signature verification ships.
- **False positive notes**: confirmed by grepping `apps/web/app/api/twilio/inbound/route.ts` for `signature|TwilioSignature|hmac` — zero hits.

---

### F5 — No rate limiting on any auth endpoint (email bombing + OTP brute force)

- **Rule**: NEXT-DOS-001 (auth endpoints must be rate-limited)
- **Severity**: High
- **Location**:
  - `apps/web/app/api/auth/request-magic-link/route.ts` (whole file — no throttle)
  - `apps/web/app/api/auth/verify-otp/route.ts` (whole file — no throttle)
  - `apps/web/app/api/auth/operator-code-redeem/route.ts` (whole file — no throttle)
- **Evidence**: grep across `apps/web` for `ratelimit|rateLimit|throttle` returns zero hits.
- **Impact**:
  - `request-magic-link`: attacker can email-bomb a target operator with one POST per second. Each request also pulls Resend quota.
  - `verify-otp`: 6-digit OTP namespace (1M) is fine under a 5-attempt-per-10-min limit but trivially brute-forceable without one.
  - `operator-code-redeem`: codes are >=8 chars (per Zod schema), so brute force is impractical. But still SHOULD throttle to avoid log-spam + signal.
- **Fix**: add upstash ratelimit (free tier sufficient at this scale) or hand-roll an IP+email throttle backed by Supabase (`auth_attempts` table). Limits to start with:
  - `request-magic-link`: 3 per email per hour, 10 per IP per hour
  - `verify-otp`: 5 per email per 10 min (lockout 1 h after exceeded)
  - `operator-code-redeem`: 5 per IP per minute
- **Mitigation**: Vercel WAF Rate Limiting (paid tier feature) for `/api/auth/*` paths is a one-toggle alternative.

---

### F6 — No application-level security headers (no CSP, no X-Frame-Options, no X-Content-Type-Options)

- **Rule**: NEXT-HEADERS-001 + REACT-HEADERS-001 + JS-CSP-001
- **Severity**: High (Medium standalone, High given the patient-PII context)
- **Location**: `apps/web/proxy.ts:29-89` (the central place these would be set), `apps/web/next.config.mjs:1-15` (no `headers()` block), `apps/web/vercel.json:1-5` (no `headers` block)
- **Evidence**: grep for `Content-Security|X-Frame|X-Content-Type|Strict-Transport|Referrer-Policy|Permissions-Policy` across `apps/web` returns zero application-defined headers. Vercel sets some defaults (HSTS on `*.vercel.app`) but the app declares none.
- **Impact**:
  - Without CSP: any future XSS escape (e.g., a third-party dep injecting markup) has maximum blast radius. Defense-in-depth is missing.
  - Without `X-Content-Type-Options: nosniff`: browser may execute mis-typed responses as scripts.
  - Without `X-Frame-Options` / CSP `frame-ancestors`: the dashboard can be iframed by an attacker site for clickjacking. The owner dashboard has Status-change controls and SMS-toggle that would survive a clickjack-vs-CSRF combination.
- **Fix**: add a `headers` block to `apps/web/next.config.mjs` setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(self), geolocation=()`, and a starter CSP. `microphone=(self)` is required for the in-browser test widget. Tighten the CSP `script-src` once you've verified what the ElevenLabs SDK actually loads. Starter CSP: `default-src 'self'; script-src 'self' 'unsafe-inline' https://*.elevenlabs.io; connect-src 'self' https://*.supabase.co https://*.elevenlabs.io wss://*.elevenlabs.io; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none';`
- **Mitigation**: enable Vercel's deployment-protection-with-headers feature in the dashboard if shipping the next.config change is delayed.

---

## Medium findings

### F7 — PIN generated with `Math.random()` (not crypto-strong)

- **Rule**: general crypto best practices + Node docs explicitly state `Math.random()` is not cryptographically secure.
- **Severity**: Medium (already counted as part of F2; surfaced separately because the fix is independent)
- **Location**: `apps/web/app/api/agents/[providerAgentId]/pin/route.ts:11-13`
- **Evidence**: `return String(Math.floor(1000 + Math.random() * 9000));`
- **Impact**: PINs are predictable in theory (V8 PRNG state leakage). In practice, the 9,000-value namespace dominates the predictability problem. Still worth fixing.
- **Fix**: `import { randomInt } from "node:crypto"; ...; return String(randomInt(100000, 1000000));` (paired with the F2 fix that widens PIN to 6 digits).

---

### F8 — Cookie-authenticated Route Handlers have no CSRF tokens (rely on Supabase SameSite + browser defaults)

- **Rule**: NEXT-CSRF-001 (Route Handlers don't get the Server Action automatic Origin check)
- **Severity**: Medium
- **Location**: All state-changing POST/PATCH/DELETE Route Handlers using cookie auth: `/api/owner/settings`, `/api/owner/voice`, `/api/owner/kb`, `/api/agents/[providerAgentId]/*` (POST/PATCH paths), `/api/auth/*`
- **Evidence**: Next.js applies Origin/Host comparison automatically to Server Actions, but NOT to Route Handlers (per the official security doc). All your API is Route Handlers. Grep for `origin|csrf|x-csrf` against `apps/web/app/api` returns only `nextUrl.origin` usage (URL construction, not CSRF defense). Supabase SSR sets session cookies with `SameSite=Lax` by default — that blocks most cross-site POST CSRF in modern browsers but is not a complete defense (legacy browsers, certain top-level navigation cases).
- **Impact**: An attacker site that an operator visits while logged into the dashboard could attempt a cross-site POST to e.g. `/api/owner/settings` to flip SMS off, or to `/api/agents/.../owner-invite` to add a third-party email to the tenant. SameSite=Lax stops basic forms, but is not 100%.
- **Fix** (defense-in-depth):
  1. **Origin allowlist check** in proxy or a route helper: reject POST/PATCH/DELETE to `/api/*` (except webhook routes) when `Origin` header is missing or not in `{PUBLIC_BASE_URL, deployment URL}`.
  2. **Or** a synchronizer-token pattern: server-set a non-HttpOnly `csrf` cookie on session creation, require the same value in an `X-CSRF-Token` header for state-changing requests.
- **Mitigation**: confirm Supabase SSR is using `SameSite=Lax` (not `None`) — it is, by default. Document the reliance explicitly.

---

### F9 — HMAC bypass in dev mode depends on `NODE_ENV` being correctly set in production

- **Rule**: NEXT-WEBHOOK-001 + NEXT-DEPLOY-001
- **Severity**: Medium
- **Location**: `apps/web/lib/verify-webhook-signature.ts:42-71`
- **Evidence**: When `ELEVENLABS_WEBHOOK_SECRET` is unset AND `nodeEnv !== "production"`, verification degrades to warn-and-accept. Vercel sets `NODE_ENV=production` by default for production deployments, but this is not enforced by your app.
- **Impact**: If `NODE_ENV` is ever set to something other than `"production"` in a Vercel env (e.g., a preview-deployment env override, or a misconfigured production env var), webhooks would silently accept unsigned payloads. This would let an attacker forge consent flags, transcripts, and recovered-revenue counters via `/api/post-call` and forge bookings via `/api/tools/create-booking`.
- **Fix**: harden the production check. Two cumulative options:
  1. In `verify-webhook-signature.ts`, also fail-closed when `VERCEL_ENV === "production"` (Vercel-set), independent of `NODE_ENV`.
  2. Add a startup assertion in `apps/web/lib/env.ts`: when `VERCEL_ENV === "production"`, `ELEVENLABS_WEBHOOK_SECRET` MUST be set.
- **Mitigation**: visible warning log when bypass triggers (already present at lines 60, 67-69 — good).

---

### F10 — `/api/auth/operator-code-redeem` is intentionally temporary but lacks rate limiting in the meantime

- **Rule**: NEXT-AUTH-001 + NEXT-DOS-001 (general "credential checks need throttling")
- **Severity**: Medium (mostly captured by F5, surfaced because this is the "delete me" route)
- **Location**: `apps/web/app/api/auth/operator-code-redeem/route.ts:48-100`
- **Evidence**: Comment at the top says "Delete this route + the OPERATOR*CODE*\* env vars once Resend domain is verified." Until then, this route accepts an 8-64 char code and on match mints a session. No rate limit.
- **Impact**: Brute force on the operator code is impractical given the namespace, but every failed attempt mints log noise and consumes a Supabase auth call. Worth throttling.
- **Fix**: include in F5's rate-limit rollout. After Resend custom-domain is live: `git rm` this route.

---

### F11 — `/api/test-transcript` writes to local FS — bounded but worth noting

- **Rule**: NEXT-PATH-001 (path traversal defense)
- **Severity**: Low (boundary check is correct)
- **Location**: `apps/web/app/api/test-transcript/route.ts:79-90`
- **Evidence**: `SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,160}$/` on `agentId` and `conversationId`. Then `resolved.startsWith(root)` boundary check before write. Both defenses correct.
- **Impact**: None as written. Documenting because path-traversal defenses tend to drift when refactored.
- **Fix**: no action. Keep the boundary check on any future edit.

---

## Low findings

### F12 — Source-map exposure not visible in repo; verify at runtime

- **Rule**: REACT-CONFIG-001 (sourcemaps as sensitive)
- **Severity**: Low
- **Location**: `apps/web/next.config.mjs`
- **Evidence**: `next.config.mjs` doesn't set `productionBrowserSourceMaps`. Next.js 16 default for browser sourcemaps in production is `false` — so unless explicitly opted in, the public build does not ship them. Worth confirming on a deployed URL by fetching `/_next/static/chunks/<hash>.js.map` and expecting 404.
- **Impact**: Sourcemaps would expose internal module names, code structure, and any inline secrets (none expected, but worth checking).
- **Fix**: confirm by running `curl -sf 'https://<your-prod-url>/_next/static/chunks/xxx.js.map'` and expecting non-200.

---

### F13 — README + landing page advertise public legal templates; not vulnerable, just worth tracking

- **Rule**: REACT-3P-001-adjacent (governance)
- **Severity**: Low (informational)
- **Location**: `apps/web/public/legal/clinic-website-notice-template.md`
- **Evidence**: After the doc-reorg you just merged, the legal template moved to `apps/web/public/legal/` and is served as a static file at `/legal/clinic-website-notice-template.md`. Anyone can fetch it.
- **Impact**: None — this is by design. It's a compliance signal.
- **Fix**: none. Document in `apps/web/README.md` that anything under `public/` is web-public so future contributors don't drop a file with sensitive content into that directory.

---

## What this audit did NOT cover

- **Database / RLS policy review**: schema is in `supabase/` migrations; I checked that the app correctly distinguishes service-role vs user-JWT clients, but did not audit the actual `is_tenant_member` / `is_operator` policy definitions. Recommend running `security-threat-model` skill next, or a dedicated Supabase RLS pass.
- **Backend Hono package** (`apps/backend`): the routes there are mostly imported by `apps/web/app/api/*` route handlers. They were covered transitively (any handler logic that touches DB / external APIs was traced).
- **Dependency CVE scan**: outside scope of this skill. Run `pnpm audit` separately. Last manual check: Next.js 16.2.6 is safe from the recent react2shell CVE (>=16.0.7).
- **TLS / HSTS posture**: out of scope per the skill's own "general security advice" guidance — Vercel handles TLS.
- **Runtime header verification**: I checked the repo for declared headers. Confirming what Vercel actually sends in production requires hitting a deployed URL.

---

## Recommended fix order

1. **F1** (5 min) — add `getOperatorOrJsonError` to `/api/prepare`.
2. **F2** + **F7** (30 min) — widen PIN to 6 digits with `crypto.randomInt`, add basic rate limit on `?pin=` parameter routes. Then rotate existing PINs.
3. **F3** (15 min) — add auth (PIN or operator) to `/api/test-transcript`.
4. **F4** (30 min) — Twilio signature verification using the `twilio` npm package before enabling the flag.
5. **F5** (1-2 h) — upstash ratelimit for the three auth endpoints.
6. **F6** (30 min) — security headers in `next.config.mjs`. Start permissive on CSP, tighten in a follow-up.
7. **F8** (1 h) — Origin allowlist check helper, apply to all cookie-auth state-changing routes.
8. **F9** (10 min) — add the `VERCEL_ENV === "production"` cross-check.
9. **F10** — delete the route once Resend custom-domain is live.

Total: roughly half a day of focused work to close all P0 + P1 + most P2.

---

## Notes on what was checked clean (negative findings worth knowing)

- **No React raw-HTML escape hatch usage anywhere** (no inline-HTML React prop).
- **No dynamic-code-execution sinks anywhere** (no `eval`, no string-to-code patterns).
- **No session tokens in localStorage**. Storage usage is limited to `provision/page.tsx` (form drafts, recent agents) and `page.tsx` + `sign-in/page.tsx` (language preference). All non-sensitive.
- **No service-role key import in any Client Component**. Sampled imports of `getServiceRoleSupabase` all originate from Server Components (no `"use client"` at top).
- **All ElevenLabs webhook routes verify HMAC before any side-effect**: `/api/post-call`, `/api/tools/create-booking`, `/api/tools/check-availability` all call `verifyElevenLabsWebhook(req)` as the first action.
- **`sanitizeNext()` in `/api/auth/verify-otp:42-47`** correctly rejects `//evil.com` open-redirect attacks: `if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";`. Defense-in-depth handled.
- **Zod schemas at every API route boundary** (confirmed via grep on `safeParse` / `parse` against `await req.json()`).
- **Next.js 16.2.6** is patched against the recent react2shell CVE (>=16.0.7).
- **Proxy `matcher` correctly excludes `/api/*`** with a clear comment that the API routes handle their own auth — F1, F3, F4 are about routes that don't fulfill that contract, not about the proxy itself.
