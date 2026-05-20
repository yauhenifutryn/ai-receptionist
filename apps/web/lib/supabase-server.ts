import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import type { User } from "@supabase/supabase-js";

// @supabase/ssr exports CookieOptions but not the per-entry shape of the
// setAll callback; redeclare it here so we can type the parameter strictly.
interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Service-role Supabase client. Bypasses RLS. Server-only.
 * Use ONLY from contexts with no end-user identity — i.e. webhooks
 * (post-call, ElevenLabs server tools) and one-off admin scripts.
 * Never import from a client component.
 */
let cachedServiceRole: SupabaseClient | null = null;

export function getServiceRoleSupabase(): SupabaseClient {
  if (cachedServiceRole) return cachedServiceRole;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  cachedServiceRole = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedServiceRole;
}

/**
 * User-scoped Supabase client for server components, route handlers, and
 * server actions. Carries the user's JWT via Next 16 async cookies(), so
 * RLS policies fire (`is_tenant_member`, `is_operator`).
 *
 * Use this for any request that originates from an authenticated browser
 * session. Webhooks (no user context) must keep using getServiceRoleSupabase.
 */
export async function getUserSupabase(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          // Force path: "/" so refreshed session cookies are sent on every
          // route. Without this, cookies set during a server-component render
          // can inherit the current route's path and stop being visible
          // elsewhere (e.g. set during /dashboard render, not sent on /test/*).
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, path: "/" });
          }
        } catch {
          // Server Components can't mutate cookies; middleware refreshes
          // sessions before the request hits a server component. Swallowing
          // this is the documented @supabase/ssr pattern.
        }
      },
    },
  });
}

export interface OperatorContext {
  user: User;
  supabase: SupabaseClient;
}

/**
 * Resolve the current authenticated user and assert they are an operator
 * (sales rep / staff with elevated cross-tenant access). Used by route
 * handlers and server components that gate the provisioning flow.
 *
 * Throws via Next.js `redirect()`:
 *   - to `/auth/sign-in?next=<path>` if no session
 *   - to `/auth/access-pending` if signed-in but not in `operators` table
 *
 * The redirect throw is intentional — callers should not catch it.
 */
export async function requireOperator(
  opts: { redirectPath?: string } = {},
): Promise<OperatorContext> {
  const supabase = await getUserSupabase();
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;
  if (!user) {
    const next = opts.redirectPath ?? "/provision";
    redirect(`/auth/sign-in?next=${encodeURIComponent(next)}` as Route);
  }
  const { data: operatorRow, error } = await supabase
    .from("operators")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    // Surfacing the DB error here would leak schema detail to a non-operator
    // browser. Treat any failure as "not an operator".
    redirect("/auth/access-pending" as Route);
  }
  if (!operatorRow) {
    redirect("/auth/access-pending" as Route);
  }
  return { user, supabase };
}

/**
 * Like requireOperator but for route handlers that prefer JSON 401/403
 * over redirect. Returns null/Response so the caller can short-circuit.
 */
export async function getOperatorOrJsonError(): Promise<
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; status: number; body: { error: string } }
> {
  const supabase = await getUserSupabase();
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;
  if (!user) {
    return { ok: false, status: 401, body: { error: "unauthenticated" } };
  }
  const { data: operatorRow } = await supabase
    .from("operators")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!operatorRow) {
    return { ok: false, status: 403, body: { error: "not_an_operator" } };
  }
  return { ok: true, user, supabase };
}
