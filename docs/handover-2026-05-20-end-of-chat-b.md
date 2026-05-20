# Handover — End of Chat B → Start of Chat C · 2026-05-20

You are picking up the AI Receptionist sprint at the **end of Chat B (booking flow)** and starting **Chat C (owner dashboard + Demo Day polish)**. This doc is self-contained: a fresh Claude session can load this + `CLAUDE.md` + the last two `PROJECT_LOG.md` entries and pick up cleanly.

**READ FIRST when picking up**: `CLAUDE.md`, this doc, `docs/handover-2026-05-20.md` (the prior end-of-Chat-A doc).

---

## 1. Project at a glance (2026-05-20)

- **Sprint window**: 8-30 May 2026. **10 days to Demo Day** (30 May at Rotunda).
- **Inovo VC visit**: was 18 May (passed).
- **Strategic shift locked 2026-05-19**: **clients never self-provision.** Sales reps (Sebastian / Jenya) provision agents on prospects' behalf, share a demo URL or phone, send "call this" link. The wow is the cold call, not the wizard.
- **Repo root**: `/Users/jenyafutrin/workspace/claude_projects/ai_receptionist`
- **Working branch**: `feature/core-wave2` (Chat B work committed here, 18 new commits).
- **Production URL**: https://ai-receptionist-seven-sigma.vercel.app (fra1, aliased to current prod deploy)
- **Live demo agent**: Dynasty Stomatology, `agent_3101krxkms8eepdr8ycf626krdss`. **NEEDS re-provisioning** to pick up the new ConvAI tools[] block — see §5.
- **Sprint cofounder**: Rem (frontend lane); not active in Chat B. Will need to be onboarded to the new operator UI in Chat C.

---

## 2. What Chat B shipped (end of 2026-05-20)

### 2.1 Booking pipeline (end-to-end, demo-able)

| Capability | Where | Notes |
|---|---|---|
| `CalendarProvider` interface | `packages/contracts/src/calendar-provider.ts` | Already existed pre-Chat-B; clarified doc + added optional `cancelBooking` |
| `SimulatedCalendarProvider` | `apps/backend/src/integrations/calendar/simulated-calendar-provider.ts` | Sprint default — synthesizes 3 hourly slots starting at next round hour |
| `handleCheckAvailability` (DI) | `apps/backend/src/tools/check-availability.ts` | Takes `{provider, tenantId}` |
| `handleCreateBooking` (DI + SMS) | `apps/backend/src/tools/create-booking.ts` | Generates `short_token`, persists `external_id`, fires SMS side-effect post-insert |
| `BookingsRepository.shortToken + externalId` | `apps/backend/src/tools/repository.ts` + `supabase-repository.ts` | Maps to `bookings.short_token` + `bookings.external_id` columns |
| Zadarma SMS client (HMAC-SHA1) | `apps/backend/src/integrations/sms/zadarma.ts` | 5s timeout, SmsClient interface keeps it swappable |
| SMSAPI.pl client | NOT BUILT in production code, smoke script only at `apps/backend/scripts/smsapi-smoke.ts` | Documented as alternative provider |
| `formatConfirmationSms` + `sendBookingConfirmation` | `apps/backend/src/tools/sms-confirmation.ts` | ASCII-only Polish (one-segment safe). Non-blocking — failure logged, booking still succeeds |
| `sms_send_failures` table | Live in Supabase Ireland | RLS: operator OR tenant_member |
| `/b/<token>` confirmation page | `apps/web/app/b/[token]/page.tsx` | Polish, mobile-first, ICS download button |
| `/b/<token>/calendar.ics` endpoint | `apps/web/app/b/[token]/calendar.ics/route.ts` | VEVENT via `ics` npm; `wizyta.ics` download |
| ConvAI tools[] block | `apps/backend/src/orchestration/elevenlabs-convai.ts:119-194` | UNCOMMENTED — agents provisioned post-Chat-B advertise `check_availability` + `create_booking` |
| `/demo/[agentId]?pin=X` public route | `apps/web/app/demo/[agentId]/page.tsx` | WebRTC + chat + transcription (reuses Chat A's TestAgentClient) |
| Twilio inbound IVR webhook | `apps/web/app/api/twilio/inbound/route.ts` | Feature-flagged off (`TWILIO_INBOUND_ENABLED=1`). Polish IVR + PIN lookup + SIP <Dial> to EL |
| Demo access panel (operator UI) | `apps/web/app/test/[agentId]/demo-access-panel.tsx` | Generate PIN + copy `/demo/<agentId>?pin=XXXX` URL |
| `POST /api/agents/<id>/pin` | `apps/web/app/api/agents/[providerAgentId]/pin/route.ts` | Operator-only, retries on unique-constraint collision |
| Smoke scripts (SMSAPI + Zadarma) | `apps/backend/scripts/{smsapi-smoke.ts,zadarma-sms-smoke.ts}` | `pnpm -F backend smoke:sms +48XXX` or `smoke:zadarma-sms` |
| `booking-deps` factory (web side) | `apps/web/lib/booking-deps.ts` | Singletons for provider/repo/smsClient + per-request resolveTenantConfig |

### 2.2 Schema migration applied to production Supabase

File: `supabase/migrations/20260520120000_booking_flow.sql`. Live on `isctdelatfyrzcpynkuq` (Ireland).

```
agents.pin_code text        -- 4-6 digit PIN, unique
tenants.contact_phone text  -- nullable; clinic phone for SMS cancel line (production only)
bookings.short_token text   -- unique, 8-char URL-safe nanoid
bookings.external_id text   -- already existed from init migration, now populated by provider
sms_send_failures           -- new table, RLS operator OR tenant_member
```

### 2.3 Test coverage

- **Backend**: 129 / 129 tests passing across 21 files. TDD for every new module (short-token, SimulatedCalendarProvider, Zadarma client, SMS confirmation, refactored handlers, integration router).
- **Web**: builds clean, no test suite yet for the new pages — manual smoke is the verification.
- **Workspace typecheck**: 3 / 3 projects green.

### 2.4 Plan + spec artifacts (gitignored, local-only)

- `docs/superpowers/specs/2026-05-20-booking-flow-design.md` — full design contract (~470 lines)
- `docs/superpowers/plans/2026-05-20-booking-flow.md` — 17-task TDD execution plan (~2800 lines)

These two files document everything Chat B did at the design + plan level.

---

## 3. What Chat B did NOT finish (open work)

### 3.1 Hard-blocked items (waiting on external verification)

| Item | Blocker | Unblock |
|---|---|---|
| Real SMS delivery (Zadarma) | Passport verification in progress | 24-72h after Jenya submitted it; add `ZADARMA_USER_KEY` + `ZADARMA_SECRET_KEY` to Vercel env, redeploy |
| Real PSTN inbound (Zadarma +48 58 5859038) | Same passport verification | Once verified: bind the number to an agent via the existing `/test/[agentId]` "Assign phone number" panel, set `TWILIO_INBOUND_ENABLED=1`, point Zadarma's webhook to `/api/twilio/inbound` |
| Branded SMS sender ID (e.g. "Asystent" or per-clinic) | $20 + 15 business day Zadarma SenderID registration | Post-sprint; current SMS goes out with Zadarma's unbranded fallback |

### 3.2 Manual operator actions still pending

| Item | Action |
|---|---|
| Live demo on the Dynasty agent | Re-provision via `/provision` (so tools[] block applies) OR PATCH agent config via EL API |
| PIN for testing | Open `/test/<agentId>`, click "Generate PIN", copy demo URL |
| Deploy `feature/core-wave2` to Vercel | `git push origin feature/core-wave2` → auto-preview, OR merge to `main` for production |

### 3.3 NOT done by deliberate scope choice (deferred)

- Real `BooksyCalendarProvider` / `GoogleCalendarProvider` / `MedfileCalendarProvider` — all post-pilot; sprint uses `SimulatedCalendarProvider` only.
- Self-service cancel/reschedule on `/b/<token>` page.
- MMS / WhatsApp / email confirmation channels (only SMS).
- Twilio inbound runtime live (feature-flagged off pending number bundle).
- Reminder SMS 24h before appointment.
- Pre-call confirmation flow.

---

## 4. Chat C scope — what to build next

Per the original handover doc, **Chat C = Owner dashboard + Demo Day polish**. Now that operator-side is solid (Chat A) and the booking pipeline runs end-to-end (Chat B), Chat C makes the **clinic owner** (paying client) the user.

### 4.1 Recommended Chat C scope (suggested, not yet locked)

1. **Owner-scoped `/dashboard` view** — tenant_members with role `'owner'` see their tenant's data only (RLS from Chat A enforces this).
2. **Transcript browser** for owners — `transcripts` table (consent-gated) + `test_transcripts` (browser sessions). Filter by date, agent, conversation_id.
3. **KB editor for owners** — same UI shape as `/test/[agentId]` settings panel, but tenant-scoped + locks operator-only fields (TTS, ASR, LLM).
4. **Booking history view** — `bookings` rows for the tenant. Date range, status, "recovered revenue" estimate.
5. **Voice picker for owners** — same shape as the operator voice picker but limited to the curated EL voice list.
6. **Per-clinic SMS/email opt-in** — owner can toggle whether confirmations send.
7. **Demo Day stage rehearsal artifacts** — script for the on-stage call, list of vetted prospect numbers, projector-ready dashboard view.
8. **ElevenLabs Analysis dashboard configuration** — manual EL UI work (documented in original 2026-05-19 handover Chat 3 section).

### 4.2 NOT in Chat C (defer further)

- Multi-clinic accounts (one user → multiple tenants). Each clinic = one tenant for now.
- Self-service operator promotion (new operators always added by Jenya via SQL).
- A/B voice testing infra beyond manual selection.
- Recurring appointment booking.
- Payment integration.

### 4.3 Strategic question for Chat C kick-off

**Some Chat C items depend on having paying clients** (booking history with real data, recovered-revenue analytics, stage rehearsal with real call data). Brainstorm should resolve:

- (i) Build the whole dashboard structurally today, populate with whatever data exists; the parts that look thin will fill in once pilots sign.
- (ii) Build only the parts that work without real clients (transcript browser of test sessions, KB editor); defer client-data parts to post-pilot.
- (iii) Something else.

My lean: (i). The empty states should be designed deliberately; that's part of the demo polish.

---

## 5. Concrete next-step playbook for live demo TODAY

Even with Zadarma still verifying, **you can run a full demo flow right now** (booking works, SMS step silently fails and logs to `sms_send_failures` — no user-facing impact):

```bash
# 1. Push the branch to GitHub. Vercel auto-deploys a preview URL.
cd /Users/jenyafutrin/workspace/claude_projects/ai_receptionist
git push origin feature/core-wave2

# 2. Re-provision Dynasty Stomatology (or any test clinic).
#    Browser: open https://ai-receptionist-seven-sigma.vercel.app/provision
#    Paste the clinic URL, complete the wizard. The new agent will have
#    check_availability + create_booking tools wired.

# 3. Open the new agent's /test page.
#    Browser: /test/agent_NEW_ID
#    Click "Generate PIN" in the Demo Access panel. Copy the URL.

# 4. Open the demo URL in a SECOND browser (or incognito).
#    URL shape: /demo/agent_NEW_ID?pin=4242
#    No login required — public, PIN-gated.

# 5. Click "Start voice". Speak Polish.
#    Say: "Chciałbym umówić się na konsultację, na piątek o 10:00."
#    Agent uses check_availability → returns 3 slots → you confirm one →
#    agent uses create_booking → says "Potwierdzam termin: ..."

# 6. Verify in Supabase (table editor or SQL):
#    SELECT id, short_token, external_id, starts_at, patient_name
#    FROM bookings ORDER BY created_at DESC LIMIT 1;
#    Expect: one fresh row, external_id starts with sim_, short_token is 8 chars.

# 7. Open the confirmation page directly:
#    /b/<short_token from step 6>
#    Polish page renders, clinic name from joined tenants row.
#    Click "Dodaj do kalendarza" — wizyta.ics downloads, opens in Calendar.app.

# 8. Verify SMS step (will fail until Zadarma creds in env):
#    SELECT * FROM sms_send_failures ORDER BY attempted_at DESC LIMIT 1;
#    Expect: one row with error_code='internal_error', error_message about missing creds.
#    This is fine — the booking succeeded, only the SMS side-effect failed.
```

When Zadarma verification clears:
```bash
# Add to Vercel env (Production scope):
ZADARMA_USER_KEY=...
ZADARMA_SECRET_KEY=...

# Redeploy. SMS starts working — no code change.
# Repeat step 5 above, verify SMS lands on the phone you gave the agent.
```

---

## 6. SIP / PSTN inbound — return-to-Chat-B work

When Zadarma passport approval lands:

1. **Bind the +48 58 5859038 number to an agent** via the existing Twilio/Zadarma phone-number import flow (Chat A's `/test/[agentId]` Phone Number panel works with any provider — it's a wrapper around EL's import-number endpoint).
2. **Point Zadarma's voice webhook at `/api/twilio/inbound`** (the route accepts both Twilio and Zadarma TwiML shapes).
3. **Set `TWILIO_INBOUND_ENABLED=1`** on Vercel env. Redeploy.
4. **Test**: dial +48 58 5859038 from any phone. Polish IVR prompts for PIN. Enter 4242. Connected to the agent.

If Zadarma keeps stalling: **WebRTC path is fully sufficient for Demo Day and for Sebastian's first cold-outreach round.** Each prospect gets their own URL with PIN. Zero PSTN dependency.

---

## 7. Key file locations (fast orientation for next session)

### 7.1 Booking flow (Chat B)
- `apps/backend/src/integrations/calendar/simulated-calendar-provider.ts`
- `apps/backend/src/integrations/sms/zadarma.ts` + `types.ts` + `index.ts`
- `apps/backend/src/tools/check-availability.ts` (refactored)
- `apps/backend/src/tools/create-booking.ts` (refactored + SMS side-effect)
- `apps/backend/src/tools/sms-confirmation.ts`
- `apps/backend/src/tools/router.ts` (refactored)
- `apps/backend/src/tools/repository.ts` (extended)
- `apps/backend/src/lib/short-token.ts`
- `apps/backend/src/orchestration/elevenlabs-convai.ts` (tools[] block live)

### 7.2 Web UI (Chat B)
- `apps/web/app/demo/[agentId]/page.tsx` — public PIN-gated WebRTC
- `apps/web/app/b/[token]/page.tsx` — patient confirmation page
- `apps/web/app/b/[token]/calendar.ics/route.ts` — ICS download
- `apps/web/app/api/twilio/inbound/route.ts` — IVR (flagged off)
- `apps/web/app/api/agents/[providerAgentId]/pin/route.ts` — PIN management API
- `apps/web/app/test/[agentId]/demo-access-panel.tsx` — operator UI for PIN + copy link
- `apps/web/lib/booking-deps.ts` — singleton dep factory for booking routes
- `apps/web/lib/format-pl-datetime.ts` — Polish locale helper

### 7.3 Migrations
- `supabase/migrations/20260516120000_init.sql` — Chat A
- `supabase/migrations/20260519120000_operator_role_and_phone.sql` — Chat A
- `supabase/migrations/20260519130000_test_transcripts.sql` — Chat A
- `supabase/migrations/20260520120000_booking_flow.sql` — Chat B

### 7.4 Smoke scripts
- `apps/backend/scripts/smsapi-smoke.ts` — `pnpm -F backend smoke:sms +48XXX`
- `apps/backend/scripts/zadarma-sms-smoke.ts` — `pnpm -F backend smoke:zadarma-sms +48XXX`

---

## 8. Quick verification commands (Chat B health)

```bash
# All tests
pnpm -r typecheck   # Expect: 3 projects done
pnpm -F @ai-receptionist/backend test   # Expect: 129/129 passing across 21 files

# Web build
pnpm -F web build   # Expect: clean, /demo/[agentId] + /b/[token] + /b/[token]/calendar.ics + /api/agents/[id]/pin + /api/twilio/inbound all registered

# Migration state
pnpm supabase migration list   # Expect: 4 migrations, Local + Remote columns matched

# Production health
curl -sI https://ai-receptionist-seven-sigma.vercel.app/dashboard
# Should: 307 → /auth/sign-in?next=/dashboard

# Live EL agent (Dynasty)
set -a; . apps/web/.env.local; set +a
curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" \
  "https://api.elevenlabs.io/v1/convai/agents/agent_3101krxkms8eepdr8ycf626krdss" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);t=d['conversation_config']['agent']['prompt'].get('tools',[]);print([x['name'] for x in t])"
# Expect: [] (Dynasty pre-Chat-B; doesn't have tools wired until re-provisioned)
```

---

## 9. First-message starter prompt for the next Claude session

> Read `docs/handover-2026-05-20-end-of-chat-b.md` end-to-end + `CLAUDE.md`. Chat B (booking flow) is done. We're starting **Chat C (owner dashboard + Demo Day polish)**. SIP number is still pending Zadarma verification but not blocking. Propose a brainstorming + plan-writing pass for Chat C scope per the recommended items in §4.1, with my lean on (i) "build the whole structure today, populate later." Use the superpowers skills as per CLAUDE.md. Confirm tmux `aidev` is alive before starting.

---

## 10. Tone note for next Claude (carried forward from prior handover)

The user values:
- Adversarial honesty over optimistic spin
- Speed > architectural perfection (sprint mode)
- Verifying with live data before reporting (read logs, fetch sites, run probes)
- Saving private notes / planning files outside the repo (gitignored or `~/.claude/`)
- Don't ship "magic link" patterns on Safari without OTP fallback
- Address every point the user makes (CLAUDE.md §4.6)
- Verify before recommending — cite file:line, never guess (CLAUDE.md §4.7)

Don't over-explain. Don't add features that weren't asked for. Don't refactor unprompted. Ship, verify, report.

Good luck.
