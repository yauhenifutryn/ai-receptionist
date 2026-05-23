// Probe GET /v1/convai/conversations/{id} to confirm the response shape used
// by the finalize handler. Usage:
//   set -a; . apps/web/.env.local; set +a
//   cd apps/backend && pnpm tsx scripts/probe-el-conversation.ts <conversation_id>
async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) {
    console.error("usage: probe-el-conversation.ts <conversation_id>");
    process.exit(1);
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing");

  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": apiKey },
  });
  console.log("status:", r.status);
  const body = await r.text();
  console.log("body:", body.slice(0, 4000));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
