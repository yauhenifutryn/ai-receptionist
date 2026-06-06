// Run one EL simulate-conversation against an agent and print the transcript
// for human (semantic) judging — never regex-score these (bake-off lesson).
// Usage:
//   node --env-file=.env.local scripts/sim-agent.mjs <agent_id> <scenario> [turns]
// Scenarios: price | doctor | hours | plru | custom:"<first message>|<persona>"
const AGENT = process.argv[2];
const SCENARIO = process.argv[3] ?? "hours";
const TURNS = Number(process.argv[4] ?? 6);
const KEY = process.env.ELEVENLABS_API_KEY;
if (!AGENT || !KEY) {
  console.error("usage: node --env-file=.env.local scripts/sim-agent.mjs <agent_id> <scenario>");
  process.exit(2);
}

const SCENARIOS = {
  price: {
    first: "Dzień dobry, ile kosztuje u Państwa higienizacja albo przegląd stomatologiczny?",
    persona:
      "Jesteś polskim pacjentem dzwoniącym do klniki stomatologicznej. Pytasz o cenę higienizacji i przeglądu. Jeśli recepcjonistka poda cenę, dopytaj o cenę wybielania zębów. Mów naturalnie po polsku, krótkimi zdaniami.",
  },
  doctor: {
    first: "Dzień dobry, do jakiego lekarza mogę się umówić na leczenie kanałowe?",
    persona:
      "Jesteś polskim pacjentem. Pytasz, który lekarz w klinice zajmuje się leczeniem kanałowym i czy przyjmuje nowych pacjentów. Mów naturalnie po polsku.",
  },
  hours: {
    first: "W jakich godzinach jesteście otwarci?",
    persona:
      "Jesteś polskim pacjentem. Zadajesz TYLKO pytanie o godziny otwarcia. Po odpowiedzi dopytaj o sobotę. Mów naturalnie po polsku.",
  },
  plru: {
    first: "Dzień dobry, chciałbym umówić wizytę.",
    persona:
      "You are a bilingual caller. Start in Polish asking to book a visit. After the receptionist's FIRST reply, switch entirely to Russian and ask 'Сколько стоит лечение кариеса?' and continue ONLY in Russian for the rest of the call, asking about address and working hours in Russian.",
  },
};

let cfg = SCENARIOS[SCENARIO];
if (!cfg && SCENARIO.startsWith("custom:")) {
  const [first, persona] = SCENARIO.slice(7).split("|");
  cfg = { first, persona };
}
if (!cfg) {
  console.error(`unknown scenario ${SCENARIO}`);
  process.exit(2);
}

const body = {
  simulation_specification: {
    simulated_user_config: {
      first_message: cfg.first,
      language: "pl",
      prompt: {
        prompt: cfg.persona,
        llm: "gpt-4o",
        temperature: 0.4,
      },
    },
  },
  new_turns_limit: TURNS,
};

const res = await fetch(
  `https://api.elevenlabs.io/v1/convai/agents/${AGENT}/simulate-conversation`,
  {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  },
);
if (!res.ok) {
  console.error(`simulate failed ${res.status}: ${(await res.text()).slice(0, 800)}`);
  process.exit(1);
}
const data = await res.json();
const turns = data.simulated_conversation ?? [];
console.log(`=== ${SCENARIO} | agent ${AGENT} | ${turns.length} turns ===`);
for (const t of turns) {
  const who = t.role === "agent" ? "AGENT" : "USER ";
  console.log(`${who}: ${t.message ?? ""}`);
  const rag = t.rag_retrieval_info;
  if (rag && rag.chunks?.length) console.log(`       [rag chunks: ${rag.chunks.length}]`);
}
