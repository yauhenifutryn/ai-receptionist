#!/usr/bin/env tsx
/**
 * Force-rotate every `agents.pin_code` to a fresh 6-digit PIN. Any surviving
 * 4-digit legacy PIN narrows the brute-force namespace to 10k, which is
 * feasible against the per-IP rate limiter under IP rotation.
 *
 * Behavior:
 *   - Reads `agents` rows where `pin_code IS NOT NULL`.
 *   - By default rotates ONLY rows whose current PIN has length < 6
 *     (the legacy 4-digit cohort). Pass `--all` to rotate every PIN.
 *   - Per-row retry up to 5 attempts on Postgres unique-violation.
 *   - Idempotent across runs: rerunning when zero candidates exist is a no-op.
 *
 * Usage:
 *   set -a; . apps/web/.env.local; set +a
 *
 *   # Default — only rotate length<6 (recommended one-shot for prod):
 *   pnpm tsx apps/backend/scripts/rotate-pins.ts
 *
 *   # Rotate every PIN regardless of current length:
 *   pnpm tsx apps/backend/scripts/rotate-pins.ts --all
 */

import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PG_UNIQUE_VIOLATION = "23505";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

const rotateAll = process.argv.includes("--all");

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generatePin(): string {
  return String(randomInt(100000, 1000000));
}

const { data: rows, error: listErr } = await sb
  .from("agents")
  .select("id, provider_agent_id, pin_code")
  .not("pin_code", "is", null);
if (listErr) {
  console.error(`agents list failed: ${listErr.message}`);
  process.exit(1);
}

const candidates = (rows ?? []).filter((r) => {
  const pin = (r as { pin_code: string }).pin_code ?? "";
  return rotateAll ? true : pin.length < 6;
});

console.error(
  `agents with pin_code: ${rows?.length ?? 0}; candidates to rotate: ${candidates.length} (${rotateAll ? "all" : "length<6"})`,
);
if (candidates.length === 0) {
  console.error("nothing to do.");
  process.exit(0);
}

let okCount = 0;
let failCount = 0;
for (const row of candidates as Array<{
  id: string;
  provider_agent_id: string;
  pin_code: string;
}>) {
  let rotated = false;
  for (let attempt = 0; attempt < 5 && !rotated; attempt += 1) {
    const pin = generatePin();
    const { error: updErr } = await sb.from("agents").update({ pin_code: pin }).eq("id", row.id);
    if (!updErr) {
      // Print the new PIN to stdout (and a human line to stderr) so the
      // operator can grep / pipe / capture without parsing the log.
      console.log(`${row.provider_agent_id}\t${pin}`);
      console.error(
        `  ok: ${row.provider_agent_id}  was len=${row.pin_code.length}  new pin=${pin}`,
      );
      okCount += 1;
      rotated = true;
    } else if ((updErr as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      continue;
    } else {
      console.error(`  FAIL: ${row.provider_agent_id}  ${updErr.message}`);
      failCount += 1;
      break;
    }
  }
  if (!rotated && failCount === 0) {
    console.error(`  FAIL: ${row.provider_agent_id}  pin_collision_exhausted after 5 attempts`);
    failCount += 1;
  }
}

// Any failed row still has its original short PIN; every ok row is now 6-digit.
// Tracked directly from the loop so we don't re-pull pin_code values across
// the wire just to recount.
const remainingShort = failCount;
console.error(`\nrotated=${okCount}  failed=${failCount}  pin_code<6 remaining=${remainingShort}`);
if (remainingShort > 0) {
  console.error("WARNING: legacy PINs still remain. Re-run to retry the failed rows.");
}
process.exit(failCount > 0 ? 1 : 0);
