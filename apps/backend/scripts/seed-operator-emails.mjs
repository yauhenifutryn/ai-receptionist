#!/usr/bin/env node
/**
 * Seed the operator_emails whitelist + (best-effort) backfill the operators
 * table for any already-signed-up users whose email is on the whitelist.
 *
 * Usage:
 *   OPERATOR_EMAILS="jenya@x.com,sebastian@y.com" \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node apps/backend/scripts/seed-operator-emails.mjs
 *
 * Run once after applying migration 20260519120000_operator_role_and_phone.sql
 * and again whenever OPERATOR_EMAILS changes. Idempotent.
 *
 * The auth.users trigger handles new signups automatically; this script is
 * for: (1) initial seed and (2) promoting users who happened to sign up
 * before being added to the whitelist.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const list = (process.env.OPERATOR_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (list.length === 0) {
  console.error("OPERATOR_EMAILS is empty — nothing to seed.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`Seeding ${list.length} operator emails…`);
const { error: upsertErr } = await supabase
  .from("operator_emails")
  .upsert(list.map((email) => ({ email })), { onConflict: "email" });
if (upsertErr) {
  console.error("operator_emails upsert failed:", upsertErr.message);
  process.exit(1);
}
console.log("operator_emails seeded.");

// Backfill: any existing auth.users with a matched email gets an operators row.
// Use the admin auth API to list users since the auth schema isn't queryable
// from PostgREST.
const { data: usersPage, error: listErr } = await supabase.auth.admin.listUsers({
  perPage: 200,
});
if (listErr) {
  console.error("Could not list auth users for backfill:", listErr.message);
  process.exit(1);
}

const matches = (usersPage.users ?? []).filter(
  (u) => u.email && list.includes(u.email.toLowerCase()),
);

if (matches.length === 0) {
  console.log("No existing users matched the whitelist — nothing to backfill.");
  process.exit(0);
}

const { error: insertErr } = await supabase
  .from("operators")
  .upsert(
    matches.map((u) => ({ user_id: u.id, email: u.email })),
    { onConflict: "user_id" },
  );
if (insertErr) {
  console.error("operators upsert failed:", insertErr.message);
  process.exit(1);
}
console.log(`Backfilled ${matches.length} operator(s): ${matches.map((u) => u.email).join(", ")}`);
