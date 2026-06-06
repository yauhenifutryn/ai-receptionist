// Real text conversation over the EL ConvAI WebSocket — the RAG-retrieval
// test harness that simulate-conversation cannot be.
//
// Unlike simulate-conversation (rag_retrieval_info always null, retrieval
// inconsistent — documented EL limitation in PROJECT_LOG), a WS session IS
// a real conversation: retrieval runs for real and the resulting call
// record logs rag_retrieval_info per agent turn, chunk by chunk. Discovered
// 2026-06-06 while root-causing the Dentus doctor-roster retrieval miss;
// it replaced a phone call as the retrieval verification.
//
// Usage:
//   set -a; . ./.env.local; set +a
//   node scripts/text-call-agent.mjs <agent_id> "<user msg 1>" ["<user msg 2>" ...]
const KEY = process.env.ELEVENLABS_API_KEY;
const agentId = process.argv[2];
const messages = process.argv.slice(3);
if (!KEY || !agentId || messages.length === 0) {
  console.error("usage: probe-ws-call.mjs <agent_id> '<msg1>' ['<msg2>']");
  process.exit(2);
}

// 1. signed URL (workspace agents require auth)
const su = await (
  await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
    { headers: { "xi-api-key": KEY } },
  )
).json();
if (!su.signed_url) {
  console.error("no signed_url:", JSON.stringify(su).slice(0, 300));
  process.exit(1);
}

let conversationId = null;
let agentTurns = 0;
const ws = new WebSocket(su.signed_url);

const done = new Promise((resolve) => {
  let msgIdx = 0;
  let settleTimer = null;
  const sendNextOrClose = () => {
    if (msgIdx < messages.length) {
      const text = messages[msgIdx++];
      console.log(`\n>> USER: ${text}`);
      ws.send(JSON.stringify({ type: "user_message", text }));
    } else {
      ws.close();
      resolve(null);
    }
  };

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: "conversation_initiation_client_data",
        conversation_config_override: { conversation: { text_only: true } },
      }),
    );
  };
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.type === "conversation_initiation_metadata") {
      conversationId = m.conversation_initiation_metadata_event?.conversation_id;
      console.log(`conversation_id=${conversationId}`);
    } else if (m.type === "agent_response") {
      agentTurns++;
      console.log(`<< AGENT: ${m.agent_response_event?.agent_response}`);
      // settle a moment, then send the next user message
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(sendNextOrClose, 1500);
    } else if (m.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", event_id: m.ping_event?.event_id }));
    }
  };
  ws.onerror = (e) => {
    console.error("ws error", e.message ?? e);
    resolve(null);
  };
  ws.onclose = () => resolve(null);
  // hard cap
  setTimeout(() => {
    try {
      ws.close();
    } catch {
      /* noop */
    }
    resolve(null);
  }, 60000);
});
await done;

if (!conversationId) {
  console.error("no conversation id captured");
  process.exit(1);
}

// 2. give EL a moment to persist, then pull the call record with RAG info
await new Promise((r) => setTimeout(r, 4000));
const d = await (
  await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
    headers: { "xi-api-key": KEY },
  })
).json();
console.log(`\n===== CALL RECORD ${conversationId} (status=${d.status}) =====`);
for (const t of d.transcript ?? []) {
  console.log(`\n--- [${t.role}] ${t.message ?? ""}`);
  const r = t.rag_retrieval_info;
  if (r) {
    console.log(`    RAG query="${r.retrieval_query}"`);
    for (const ch of r.chunks ?? [])
      console.log(`      doc=${ch.document_id} chunk=${ch.chunk_id} dist=${ch.vector_distance}`);
  } else {
    console.log("    rag_retrieval_info: null");
  }
}
