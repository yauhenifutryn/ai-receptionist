import type { ScraperOutput, ScraperService } from "@ai-receptionist/contracts";

/**
 * Render a ScraperOutput as the markdown knowledge.md document attached
 * to the ElevenLabs agent. Layout follows ElevenLabs RAG best practice:
 *
 *   - H2 sections (## Klinika, ## Lekarze, ## Usługi i ceny, ## FAQ)
 *     so each section becomes a semantically meaningful chunk
 *     (~200-800 tokens target).
 *   - One service per sub-heading, with synonyms front-loaded so
 *     retrieval matches a user saying any of them.
 *   - Prices as "Cena: X PLN" lines, NEVER inside tables (RAG can't
 *     reliably extract structured table data).
 *   - Hard rule: never invent prices. Anything missing in source
 *     surfaces as the literal word "unknown" — the agent then says
 *     "nie mam tej informacji".
 *   - Metadata footer captures provenance.
 */
export function scraperOutputToMarkdown(out: ScraperOutput): string {
  const blocks: string[] = [];

  blocks.push(`# ${out.tenant.name}`);

  blocks.push(klinikaBlock(out));

  const hours = hoursBlock(out);
  if (hours) blocks.push(hours);

  if (out.staff.length > 0) {
    blocks.push(staffBlock(out));
  }

  if (out.services.length > 0) {
    blocks.push(servicesBlock(out));
  }

  if (out.faq.length > 0) {
    blocks.push(faqBlock(out));
  }

  if (out.unsorted && out.unsorted.trim().length > 0) {
    blocks.push(`## Notatki dodatkowe\n\n${out.unsorted.trim()}`);
  }

  blocks.push(provenanceBlock(out));

  return blocks.join("\n\n") + "\n";
}

function klinikaBlock(out: ScraperOutput): string {
  const lines: string[] = ["## Klinika"];
  const t = out.tenant;
  if (t.description) lines.push(t.description.trim());
  lines.push("");
  if (t.address) lines.push(`- Adres: ${t.address}`);
  if (t.phone) lines.push(`- Telefon: ${t.phone}`);
  if (t.email) lines.push(`- Email: ${t.email}`);
  return lines.join("\n");
}

/**
 * Opening hours as their OWN H2 chunk with trilingual synonyms front-loaded.
 * 2026-06-05 RAG lesson: with hours buried as bullets inside "## Klinika",
 * a bare "w jakich godzinach jesteście otwarci?" / "какие у вас часы
 * работы?" query missed retrieval entirely — and the agent then fabricated
 * plausible-but-wrong hours. Queries mentioning the address still matched
 * (address and hours shared a chunk), which made the failure intermittent.
 */
function hoursBlock(out: ScraperOutput): string | null {
  const t = out.tenant;
  if (!t.hours) return null;
  const lines: string[] = [
    "## Godziny otwarcia (znane także jako: godziny pracy, kiedy otwarte, w jakich godzinach przyjmujecie; RU: часы работы, график работы, когда открыто; EN: opening hours, working hours)",
    "",
  ];
  const days: Array<[keyof typeof t.hours, string]> = [
    ["monday", "Poniedziałek"],
    ["tuesday", "Wtorek"],
    ["wednesday", "Środa"],
    ["thursday", "Czwartek"],
    ["friday", "Piątek"],
    ["saturday", "Sobota"],
    ["sunday", "Niedziela"],
  ];
  for (const [key, label] of days) {
    const val = t.hours[key];
    if (val) lines.push(`- ${label}: ${val}`);
  }
  if (t.hours.notes) lines.push(`- Uwagi godzinowe: ${t.hours.notes}`);
  return lines.join("\n");
}

/**
 * Clinical-taxonomy → patient-phrasing synonym map for staff specializations.
 *
 * 2026-06-06 RAG lesson (dentus.szczecin.pl REAL call, conv_7801ktew…):
 * "Który lekarz zajmuje się leczeniem kanałowym?" went unanswered although
 * the KB listed three endodontists. The EL chunker had stranded the roster
 * in a chunk WITHOUT its section header, and the lines carried clinical
 * taxonomy only ("Endodoncja") — zero patient phrasing — so the chunk
 * embedded far from the query and lost all 20 retrieval slots to generic
 * ontology chunks. Synonyms must live INSIDE EVERY LINE to survive arbitrary
 * chunk boundaries; header-level synonyms die at the first split.
 */
const SPECIALIZATION_PATIENT_SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/endodoncj/i, "leczenie kanałowe, kanałowe leczenie zębów"],
  [/protetyk/i, "korony, mosty, protezy"],
  [/pedodoncj|stomatologia dziecięca/i, "leczenie dzieci, dentysta dla dzieci"],
  [/ortodoncj/i, "aparaty ortodontyczne, prostowanie zębów"],
  [/implantolog/i, "implanty, wszczepianie implantów"],
  [/chirurg/i, "usuwanie zębów, ekstrakcje"],
  [/zachowawcz/i, "plomby, wypełnienia, leczenie próchnicy"],
  [/stomatologia estetyczna/i, "wybielanie, licówki, bonding"],
  [/periodontolog/i, "leczenie dziąseł, paradontoza"],
];

/**
 * Append patient phrasing after each recognized clinical term so any chunk
 * slice of the roster matches how patients actually ask. Idempotent: skips
 * a segment whose patient phrasing is already present.
 */
function enrichWithPatientSynonyms(text: string): string {
  return text
    .split(",")
    .map((seg) => {
      const t = seg.trim();
      for (const [re, synonyms] of SPECIALIZATION_PATIENT_SYNONYMS) {
        if (re.test(t)) {
          const lead = synonyms.split(",")[0]!.trim();
          if (t.toLowerCase().includes(lead.toLowerCase())) return t;
          return `${t} (${synonyms})`;
        }
      }
      return t;
    })
    .join(", ");
}

function staffBlock(out: ScraperOutput): string {
  const lines: string[] = [
    "## Lekarze i personel (znane także jako: który lekarz, kto leczy, jaki specjalista, lekarze i ich specjalizacje; RU: какой врач, кто лечит; EN: which doctor, dentists, specialists)",
    "",
    // The attribution guard lives HERE (not only in the system prompt) so it
    // is retrieved together with the roster chunk. REGRESSION
    // (b2stomatologia.pl WS call 2026-06-06): a roster of bare "lekarz
    // dentysta" lines plus a priced leczenie kanałowe cennik made the agent
    // claim ALL seven dentists do root canals — invented attribution.
    "Pełna lista lekarzy i ich specjalizacji. Odpowiadaj z niej na pytania: który lekarz wykonuje dany zabieg, kto leczy dzieci, do kogo się umówić. Jeżeli przy lekarzu nie podano specjalizacji, NIE zgaduj i NIE przypisuj mu konkretnych zabiegów — wymień lekarzy i zaproponuj potwierdzenie w recepcji, kto wykonuje dany zabieg.",
    "",
  ];
  for (const s of out.staff) {
    const pieces: string[] = [`- ${s.name}`];
    // Enrich the role only when no specialization carries the signal —
    // otherwise the same synonyms would land twice on one line.
    if (s.role) pieces.push(s.specialization ? s.role : enrichWithPatientSynonyms(s.role));
    if (s.specialization) pieces.push(enrichWithPatientSynonyms(s.specialization));
    // Bare doctor lines (no specialization anywhere) get a per-LINE
    // no-attribution marker. REGRESSION round 2 (b2stomatologia.pl): the
    // cue-line guard was chunked AWAY from the names and the agent claimed
    // all seven dentists do root canals. Only per-line text survives
    // arbitrary chunk boundaries.
    const isDoctor = /lekarz|dentyst|stomatolog|\bdr\b|lek\./i.test(`${s.name} ${s.role ?? ""}`);
    const roleCarriesSignal = s.role ? enrichWithPatientSynonyms(s.role) !== s.role : false;
    if (
      isDoctor &&
      !s.specialization &&
      !roleCarriesSignal &&
      (s.specializationSynonyms ?? []).length === 0
    ) {
      pieces.push(
        "specjalizacja niepodana — nie przypisuj temu lekarzowi konkretnych zabiegów, skieruj do recepcji",
      );
    }
    // LLM-generated patient phrasings (specializationSynonyms) cover what
    // the deterministic map doesn't; append only the ones the line doesn't
    // already carry, so map-covered terms never repeat.
    const lineSoFar = pieces.join(" — ").toLowerCase();
    const novel = (s.specializationSynonyms ?? []).filter(
      (syn) => syn.trim().length > 0 && !lineSoFar.includes(syn.trim().toLowerCase()),
    );
    if (novel.length > 0) pieces.push(`pacjenci pytają też: ${novel.join(", ")}`);
    if (s.languages.length > 0) {
      pieces.push(`języki: ${s.languages.join(", ")}`);
    }
    lines.push(pieces.join(" — "));
  }
  return lines.join("\n");
}

function servicesBlock(out: ScraperOutput): string {
  const lines: string[] = ["## Usługi i ceny", ""];
  for (const svc of out.services) {
    const synonymsLead =
      svc.synonyms.length > 0
        ? `${svc.name} (znane także jako: ${svc.synonyms.join(", ")})`
        : svc.name;
    lines.push(`### ${synonymsLead}`);
    if (svc.description) lines.push(svc.description.trim());
    lines.push(`Cena: ${formatPrice(svc.price)}`);
    if (svc.durationMinutes) {
      lines.push(`Czas trwania: około ${svc.durationMinutes} minut`);
    }
    if (svc.requiresConsultationFirst) {
      lines.push("Wymaga wcześniejszej konsultacji.");
    }
    const nfzLabel =
      svc.nfzCovered === "full"
        ? "NFZ: pełna refundacja"
        : svc.nfzCovered === "partial"
          ? "NFZ: częściowa refundacja"
          : svc.nfzCovered === "none"
            ? "NFZ: prywatnie, bez refundacji"
            : "NFZ: status nieznany";
    lines.push(nfzLabel);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function faqBlock(out: ScraperOutput): string {
  const lines: string[] = ["## FAQ", ""];
  for (const item of out.faq) {
    lines.push(`### ${item.question.trim()}`);
    lines.push(item.answer.trim());
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/**
 * Render the new universal price shape as a natural Polish phrase the
 * agent will read aloud. Preserves the verbatim `display` when available
 * (so an "od X PLN" stays an "od X PLN" in the KB), otherwise composes
 * from min/max/qualifier.
 */
function formatPrice(price: ScraperService["price"]): string {
  if (!price) return "nieznana (do potwierdzenia z recepcją)";
  // Suppress variant when it equals the display string — Gemini sometimes
  // copies the price text into both fields, which would otherwise render
  // as "Cena: 420 PLN (420 PLN)".
  const variant =
    price.variant && price.variant.trim() !== (price.display ?? "").trim()
      ? price.variant
      : undefined;
  if (price.display && price.display.trim().length > 0) {
    return variant ? `${price.display} (${variant})` : price.display;
  }
  const cur = price.currency;
  const fmt = (n: number) => n.toLocaleString("pl-PL");
  let core: string;
  if (price.qualifier === "unknown") {
    core = "nieznana (do potwierdzenia z recepcją)";
  } else if (price.qualifier === "exact" && typeof price.min === "number") {
    core = `${fmt(price.min)} ${cur}`;
  } else if (
    price.qualifier === "range" &&
    typeof price.min === "number" &&
    typeof price.max === "number"
  ) {
    core = `od ${fmt(price.min)} do ${fmt(price.max)} ${cur}`;
  } else if (price.qualifier === "from" && typeof price.min === "number") {
    core = `od ${fmt(price.min)} ${cur}`;
  } else if (price.qualifier === "to" && typeof price.max === "number") {
    core = `do ${fmt(price.max)} ${cur}`;
  } else if (price.qualifier === "starting" && typeof price.min === "number") {
    core = `od ${fmt(price.min)} ${cur}`;
  } else if (typeof price.min === "number" && typeof price.max === "number") {
    core = `${fmt(price.min)} - ${fmt(price.max)} ${cur}`;
  } else if (typeof price.min === "number") {
    core = `${fmt(price.min)} ${cur}`;
  } else {
    core = "nieznana (do potwierdzenia z recepcją)";
  }
  return variant ? `${core} (${variant})` : core;
}

function provenanceBlock(out: ScraperOutput): string {
  const lines: string[] = [
    "## Metadane",
    "",
    `- Źródło: ${out.sourceUrl}`,
    `- Data pobrania: ${out.scrapedAt}`,
  ];
  if (out.hasUnknownPrices) {
    lines.push(
      '- Uwaga: część cen oznaczona jako unknown — agent musi powiedzieć "nie mam tej informacji" zamiast zgadywać.',
    );
  }
  return lines.join("\n");
}
