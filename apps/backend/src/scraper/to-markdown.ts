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
  if (t.hours) {
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
  }
  return lines.join("\n");
}

function staffBlock(out: ScraperOutput): string {
  const lines: string[] = ["## Lekarze i personel", ""];
  for (const s of out.staff) {
    const pieces: string[] = [`- ${s.name}`];
    if (s.role) pieces.push(s.role);
    if (s.specialization) pieces.push(s.specialization);
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
