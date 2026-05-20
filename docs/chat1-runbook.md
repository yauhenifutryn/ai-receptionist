# Chat 1 — Post-deploy runbook

Production URL: **https://ai-receptionist-seven-sigma.vercel.app** (fra1, ready).

Deploy id: `dpl_FyPrqrnTEWHSuoShEiaZQUGxyjnz`. Inspect: https://vercel.com/yauhenifutryns-projects/ai-receptionist/FyPrqrnTEWHSuoShEiaZQUGxyjnz

The code is on production. **It will 500 on `/provision` until the steps below are done.** Public routes (`/`, `/auth/sign-in`, `/api/post-call`) work right now.

---

## 1. Apply the SQL migration (Supabase Ireland)

Either:

```bash
# If you have Supabase CLI linked:
supabase db push
```

Or paste `supabase/migrations/20260519120000_operator_role_and_phone.sql` into the Supabase SQL editor at https://supabase.com/dashboard/project/isctdelatfyrzcpynkuq/sql and run.

The migration adds:
- `operator_emails` whitelist table
- `operators` table (auto-promoted on signup via `trg_promote_operator_on_signup`)
- `is_operator(uuid)` RLS helper
- `agents.phone_number`, `agents.provisioned_by_user_id`, `tenants.provisioned_by_user_id`
- Operator-bypass policies for tenants/agents/tenant_members/bookings/consent_log/transcripts/service_value_matrix

## 2. Seed the operator whitelist

Two steps. First, insert the allowed emails into `operator_emails`:

```sql
-- In Supabase SQL editor
insert into operator_emails (email) values
  ('yauheni.futryn@gmail.com')
  -- ('sebastian@…'),   -- add later
  -- ('rem@…')
on conflict do nothing;
```

Then run the seed script to backfill any already-signed-up users (idempotent):

```bash
# Loads .env.local and OPERATOR_EMAILS; safe to re-run
set -a; . apps/web/.env.local; set +a
OPERATOR_EMAILS="yauheni.futryn@gmail.com" \
  node apps/backend/scripts/seed-operator-emails.mjs
```

## 3. Configure Supabase Auth

In Supabase dashboard → Authentication → URL Configuration:

- **Site URL**: `https://ai-receptionist-seven-sigma.vercel.app`
- **Redirect URLs allow list** (add both):
  - `https://ai-receptionist-seven-sigma.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

Save. Without these, the magic-link email button will land users on the Supabase default placeholder instead of `/auth/callback`.

## 4. Configure the ElevenLabs webhook secret

A fresh `ELEVENLABS_WEBHOOK_SECRET` was generated and stored only in Vercel. Pull it locally so you can paste it into the ElevenLabs workspace settings:

```bash
vercel env pull .env.vercel.production --environment=production
grep ELEVENLABS_WEBHOOK_SECRET .env.vercel.production
```

Paste the value into ElevenLabs dashboard → Conversational AI → Workspace → Webhook secret. Without this, post-call webhooks land but the HMAC verification fails and your transcripts never persist.

Delete `.env.vercel.production` after you're done. Or merge ELEVENLABS_WEBHOOK_SECRET into `apps/web/.env.local` for local dev parity.

## 5. (Optional) ElevenLabs workspace → "Use for model improvement" OFF

Already mandatory per project rules. Confirm under Workspace → Privacy.

## 6. Verify the auth flow end-to-end

1. Open https://ai-receptionist-seven-sigma.vercel.app/provision
   - Expect: redirect to `/auth/sign-in?next=%2Fprovision`
2. Enter `yauheni.futryn@gmail.com` → "Send magic link"
   - Expect: green confirmation card.
3. Open the magic link from your inbox.
   - Expect: lands on `/provision`.
   - If it lands on `/auth/access-pending` instead: `operator_emails` is not seeded, or the trigger didn't fire on signup. Re-run step 2.
4. Paste a Polish dental URL (e.g. `https://dynastystomatology.pl`) → provision an agent.
   - Expect: lands on `/test/<agentId>` with the "Assign phone number" panel + voice tester.
5. Verify in Supabase:
   ```sql
   select id, name, provisioned_by_user_id from tenants order by created_at desc limit 1;
   select id, provider_agent_id, phone_number, provisioned_by_user_id from agents order by created_at desc limit 1;
   select * from tenant_members order by created_at desc limit 1;
   ```
   - Expect: `provisioned_by_user_id` populated, `tenant_members` row with role `operator`.

## 7. Twilio PL number (sales-rep wow path)

1. Twilio dashboard: buy a Polish local number (`+48…`). Attach regulatory bundle.
2. Number must be voice-capable.
3. On https://ai-receptionist-seven-sigma.vercel.app/test/<agentId>, expand "Assign phone number".
4. Paste:
   - E.164 number: `+48…`
   - Label: e.g. `Dynasty — demo`
   - Twilio Account SID + Auth Token
5. Hit "Import number".
   - Expect: success card, `agents.phone_number` populated, EL phone-number bound to the agent.
6. Call the number from a real phone. Talk in Polish. Confirm:
   - The agent answers `"Dzień dobry, mówi asystent…"`
   - You hear KB-grounded answers (prices, doctors, hours)
   - After hangup, within ~30 s: a `consent_log` row + (if consented) a `transcripts` row exists for the conversation_id under the right `tenant_id`.

## 8. RLS verification

```sql
-- As yauheni (operator), should see all tenants:
select count(*) from tenants;          -- operator bypass

-- Simulate a non-operator tenant member. Sign in with a different email
-- (e.g. via a fresh magic-link), then under that session:
select count(*) from tenants;          -- should be 0 unless added to tenant_members
```

If a non-operator can read foreign tenants: the migration's `tenants_select` policy wasn't replaced. Re-apply step 1.

---

## Known follow-ups (NOT blocking Chat 1 acceptance)

- **Pre-existing test failures**: 2 tests in `test/orchestration/elevenlabs-convai.test.ts` regressed before this session (file is staged but unchanged in this chat). Unblocks Chat 2 work; not blocking deploy.
- **`next lint --max-warnings=0` deprecated** in Next 16. Replace with `eslint .` directly or drop the flag from package.json.
- **`middleware.ts` deprecated** in Next 16 → rename to `proxy.ts`. Functional today; warning only.
- **Preview env vars unset**. Vercel CLI 54 has a regression on "all preview branches" non-interactive add. Push per-branch via `vercel env add KEY preview <branchname> --value … --yes` when first PR preview is needed.
- **Sebastian + Rem operator emails**. Add them to `operator_emails` table + `OPERATOR_EMAILS` Vercel env when they're ready.
- **`/api/prepare` is ungated**. Anyone with the prod URL can trigger a scrape (cost ≤ 500 Firecrawl credits/mo on free tier, but still). Add operator gate in Chat 2 cleanup.
