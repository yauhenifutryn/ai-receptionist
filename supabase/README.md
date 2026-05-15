# Supabase

**Region**: Frankfurt (`eu-central-1`). NOT Vercel's `fra1` naming. Both happen to be physically Frankfurt; Supabase uses AWS region naming, Vercel uses its own.

## Project setup (one-time, by Jenya)

1. Create a new project at <https://supabase.com/dashboard> — pick **Frankfurt (eu-central-1)** in the region selector.
2. Free tier: 500MB DB, 1GB file storage, 50K MAU. Plenty for the 1-5 pilot range.
3. From Project Settings → API:
   - Copy `URL` → `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`.
   - Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`. **Never** ship this to the browser; backend-only.
4. Apply the migrations in `supabase/migrations/` in numeric order via either:
   - Supabase dashboard → SQL Editor → paste each file in order, or
   - Supabase CLI: `supabase link` + `supabase db push`.

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
