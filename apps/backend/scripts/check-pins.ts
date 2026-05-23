#!/usr/bin/env tsx
/**
 * Read-only audit of agents.pin_code lengths. Tells you whether rotate-pins.ts
 * has anything to do without mutating anything.
 *
 * Usage:
 *   set -a; . apps/web/.env.local; set +a
 *   pnpm tsx apps/backend/scripts/check-pins.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await sb
  .from("agents")
  .select("provider_agent_id, pin_code, status, tenants(display_name)")
  .not("pin_code", "is", null)
  .order("provider_agent_id");
if (error) {
  console.error(`agents list failed: ${error.message}`);
  process.exit(1);
}

const rows = (data ?? []) as Array<{
  provider_agent_id: string;
  pin_code: string;
  status: string;
  tenants: { display_name: string } | { display_name: string }[] | null;
}>;

const byLen = new Map<number, number>();
for (const r of rows) {
  const n = (r.pin_code ?? "").length;
  byLen.set(n, (byLen.get(n) ?? 0) + 1);
}

console.error(`Total agents with a PIN: ${rows.length}`);
console.error(`PIN length distribution:`);
for (const [len, count] of [...byLen.entries()].sort(([a], [b]) => a - b)) {
  console.error(`  ${len} digits: ${count}`);
}

const legacy = rows.filter((r) => (r.pin_code ?? "").length < 6);
if (legacy.length === 0) {
  console.error(`\nNo legacy PINs — rotate-pins.ts has nothing to do.`);
  process.exit(0);
}
console.error(`\nLegacy (<6 digit) PINs:`);
for (const r of legacy) {
  const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
  const clinic = t?.display_name ?? "(no tenant)";
  console.error(
    `  ${r.provider_agent_id}  len=${(r.pin_code ?? "").length}  status=${r.status}  clinic="${clinic}"`,
  );
}
