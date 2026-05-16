# Supabase

**Region**: Ireland (`eu-west-1`). EU/RODO-compliant. Project ref: `isctdelatfyrzcpynkuq` → `https://isctdelatfyrzcpynkuq.supabase.co`. (Frankfurt `eu-central-1` would also work; Ireland chosen for sprint expedience.)

## Project setup (one-time, done 2026-05-16)

1. Project provisioned at <https://supabase.com/dashboard> in Ireland.
2. Free tier: 500MB DB, 1GB file storage, 50K MAU. Plenty for the 1-5 pilot range.
3. From Project Settings → API (new naming as of late 2025):
   - Copy `URL` → `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`.
   - Copy the **publishable** key (`sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Browser-safe IF RLS is enabled (it is).
   - Copy the **secret** key (`sb_secret_...`) → `SUPABASE_SERVICE_ROLE_KEY`. **Never** ship this to the browser; backend-only; bypasses RLS by design.
4. Apply the migrations in `supabase/migrations/` (timestamp-ordered) via either:
   - **Supabase CLI**: `supabase login` (interactive) OR set `SUPABASE_ACCESS_TOKEN`, then `supabase link --project-ref isctdelatfyrzcpynkuq && supabase db push`.
   - **Dashboard fallback**: SQL Editor → paste `supabase/migrations/20260516120000_init.sql` → Run.
   - **GitHub auto-apply** (since repo is connected to Supabase): enable Database Branching, then migrations run on PR merge to `main`.

## RLS posture

Every table has RLS enabled from creation (RODO-aligned, defense-in-depth).

- **Backend** (`apps/backend`) uses the `service_role` key, which bypasses RLS by design. All webhooks (server-tools, post-call) run as service_role.
- **Web** (`apps/web`) uses the `anon` key + Supabase Auth. RLS policies restrict each authenticated user's reads/writes to their own `tenant_id` (looked up via the `tenant_members` table).
- Tenants never see other tenants' rows under any code path the web app exposes. Verified by the migration's RLS isolation tests.

## Verification (run after applying migrations)

From the SQL editor:

```sql
-- Should return zero rows when run as a non-service-role session not bound to tenant A.
select count(*) from bookings where tenant_id = '<tenant_a_uuid>';
```
