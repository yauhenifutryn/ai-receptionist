#!/usr/bin/env tsx
/**
 * Backfill conversations that ended while the post-call webhook was broken
 * (workspace post_call_webhook_id unselected until 2026-06-05, and the route
 * lacked the EL→internal adapter). Fetches the conversation from EL, wraps it
 * in the webhook envelope, and runs the SAME adapter + handler the production
 * route uses — so backfilled rows are indistinguishable from webhook-written
 * ones.
 *
 * Usage:
 *   set -a; . ./.env.local; set +a
 *   pnpm -F @ai-receptionist/backend exec tsx scripts/backfill-post-call.ts <conversation_id> [...]
 */
import { createClient } from "@supabase/supabase-js";
import { adaptElevenLabsPostCall } from "../src/post-call/elevenlabs-adapter.js";
import { handlePostCall } from "../src/post-call/handler.js";
import { createSupabasePostCallRepository } from "../src/post-call/supabase-repository.js";

const elKey = process.env.ELEVENLABS_API_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!elKey || !url || !key) throw new Error("env missing");

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("usage: backfill-post-call.ts <conversation_id> [...]");
  process.exit(2);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const repo = createSupabasePostCallRepository(sb);

for (const id of ids) {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, {
    headers: { "xi-api-key": elKey },
  });
  if (!res.ok) {
    console.error(`${id}: EL fetch failed ${res.status}`);
    continue;
  }
  const conversation = await res.json();
  const adapted = adaptElevenLabsPostCall({ type: "post_call_transcription", data: conversation });
  if (!adapted) {
    console.error(`${id}: adapter returned null (unexpected shape)`);
    continue;
  }
  const result = await handlePostCall(adapted, { repo });
  console.log(`${id}:`, JSON.stringify(result));
}
