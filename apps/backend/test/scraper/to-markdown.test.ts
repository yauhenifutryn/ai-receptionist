import { describe, it, expect } from "vitest";
import { scraperOutputToMarkdown } from "../../src/scraper/to-markdown.js";
import type { ScraperOutput } from "@ai-receptionist/contracts";

const SAMPLE: ScraperOutput = {
  sourceUrl: "https://example-vet.pl",
  scrapedAt: "2026-05-17T12:00:00.000Z",
  tenant: {
    name: "Klinika Łapka",
    address: "ul. Marszałkowska 100, Warszawa",
    phone: "+48 22 555 12 34",
    email: "kontakt@lapka.pl",
    hours: {
      monday: "9:00-20:00",
      tuesday: "9:00-20:00",
      wednesday: "9:00-20:00",
      thursday: "9:00-20:00",
      friday: "9:00-20:00",
      saturday: "10:00-15:00",
    },
    description: "Klinika weterynaryjna w Śródmieściu.",
  },
  staff: [
    {
      name: "dr Anna Nowak",
      role: "lekarz",
      specialization: "chirurgia małych zwierząt",
      languages: ["polski", "angielski"],
    },
  ],
  services: [
    {
      name: "Konsultacja",
      synonyms: ["wizyta", "przegląd"],
      nfzCovered: "unknown",
      price: { currency: "PLN", display: "180 PLN", min: 180, max: 180, qualifier: "exact" },
      durationMinutes: 30,
    },
    {
      name: "Wizyta nocna",
      synonyms: ["pogotowie"],
      nfzCovered: "none",
      price: { currency: "PLN", qualifier: "unknown" },
    },
  ],
  faq: [
    {
      question: "Czy przyjmujecie nagłe przypadki?",
      answer: "Tak, w godzinach pracy.",
    },
  ],
  hasUnknownPrices: true,
};

describe("scraperOutputToMarkdown (W2.1 KB formatter)", () => {
  it("emits H2 sections in canonical order", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    const klinikaIdx = md.indexOf("## Klinika");
    const staffIdx = md.indexOf("## Lekarze i personel");
    const servicesIdx = md.indexOf("## Usługi i ceny");
    const faqIdx = md.indexOf("## FAQ");
    const metaIdx = md.indexOf("## Metadane");
    expect(klinikaIdx).toBeGreaterThan(-1);
    expect(staffIdx).toBeGreaterThan(klinikaIdx);
    expect(servicesIdx).toBeGreaterThan(staffIdx);
    expect(faqIdx).toBeGreaterThan(servicesIdx);
    expect(metaIdx).toBeGreaterThan(faqIdx);
  });

  it("front-loads service synonyms on the H3 heading", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("### Konsultacja (znane także jako: wizyta, przegląd)");
  });

  it("renders prices as 'Cena: X PLN' lines, not tables", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("Cena: 180 PLN");
    expect(md).not.toContain("|"); // no markdown tables
  });

  it("marks unknown prices with a clear Polish phrase the agent can read aloud", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("Cena: nieznana (do potwierdzenia z recepcją)");
  });

  it("includes provenance metadata", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("Źródło: https://example-vet.pl");
    expect(md).toContain("Data pobrania: 2026-05-17T12:00:00.000Z");
  });

  it("warns when hasUnknownPrices=true", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toMatch(/część cen oznaczona jako unknown/);
  });

  it("omits empty sections", () => {
    const minimal: ScraperOutput = {
      ...SAMPLE,
      staff: [],
      services: [],
      faq: [],
    };
    const md = scraperOutputToMarkdown(minimal);
    expect(md).not.toContain("## Lekarze i personel");
    expect(md).not.toContain("## Usługi i ceny");
    expect(md).not.toContain("## FAQ");
    expect(md).toContain("## Klinika");
    expect(md).toContain("## Metadane");
  });

  it("includes staff languages when present", () => {
    const md = scraperOutputToMarkdown(SAMPLE);
    expect(md).toContain("dr Anna Nowak");
    expect(md).toContain("języki: polski, angielski");
  });
});

describe("staffBlock RAG hardening (REGRESSION dentus.szczecin.pl REAL CALL 2026-06-06)", () => {
  // Real call: "Który lekarz zajmuje się leczeniem kanałowym?" went
  // unanswered although the KB listed three endodontists. Evidence from the
  // EL chunks API: (a) the chunker stranded the roster in a chunk WITHOUT
  // its section header, (b) roster lines carried clinical taxonomy only
  // ("Endodoncja") — zero patient phrasing ("leczenie kanałowe") — so the
  // chunk embedded far from the patient's query and lost all 20 retrieval
  // slots to generic ontology chunks. Per-LINE synonym expansion is the
  // split-robust fix; header-level synonyms alone die at the first chunk
  // boundary.
  const dental: ScraperOutput = {
    ...SAMPLE,
    staff: [
      {
        name: "lek. stom. Anna Stefańczyk",
        role: "lekarz stomatolog",
        specialization: "Endodoncja, Protetyka",
        languages: [],
      },
      {
        name: "lek. stom. Agnieszka Herdzik",
        role: "lekarz stomatolog",
        specialization: "Pedodoncja, Leczenie zachowawcze (bonding)",
        languages: [],
      },
      {
        name: "dr n. med. Cezary Turostowski",
        role: "lekarz implantolog",
        specialization: "Implantologia, Stomatologia estetyczna",
        languages: [],
      },
      {
        name: "lek. stom. Katarzyna Jankowska",
        role: "lekarz stomatolog",
        specialization: "Ortodoncja",
        languages: [],
      },
      {
        name: "lek. stom. Kamila Banasik",
        role: "lekarz stomatolog",
        specialization: "Chirurgia",
        languages: [],
      },
      {
        name: "Magdalena Milancew",
        role: "Dyplomowana higienistka stomatologiczna",
        languages: [],
      },
    ],
  };

  it("front-loads patient-query synonyms on the section header", () => {
    const md = scraperOutputToMarkdown(dental);
    expect(md).toContain("## Lekarze i personel (znane także jako: który lekarz");
  });

  it("expands clinical taxonomy with patient phrasing PER LINE (split-robust)", () => {
    const md = scraperOutputToMarkdown(dental);
    expect(md).toContain("Endodoncja (leczenie kanałowe");
    expect(md).toContain("Protetyka (korony, mosty, protezy)");
    expect(md).toContain("Pedodoncja (leczenie dzieci");
    expect(md).toContain("Leczenie zachowawcze (bonding) (plomby, wypełnienia");
    expect(md).toContain("Implantologia (implanty");
    expect(md).toContain("Stomatologia estetyczna (wybielanie, licówki, bonding)");
    expect(md).toContain("Ortodoncja (aparaty ortodontyczne");
    expect(md).toContain("Chirurgia (usuwanie zębów, ekstrakcje)");
  });

  it("enriches the role only when no specialization carries the signal", () => {
    const md = scraperOutputToMarkdown({
      ...SAMPLE,
      staff: [
        { name: "dr X", role: "lekarz implantolog", languages: [] },
        {
          name: "dr Y",
          role: "lekarz implantolog",
          specialization: "Implantologia",
          languages: [],
        },
      ],
    });
    // role-only doctor: enrichment lands on the role
    expect(md).toContain("lekarz implantolog (implanty");
    // with specialization present, the role stays bare (no double append)
    expect(md.match(/implanty, wszczepianie implantów/g)?.length).toBe(2);
  });

  it("does not duplicate when patient phrasing is already present", () => {
    const md = scraperOutputToMarkdown({
      ...SAMPLE,
      staff: [
        {
          name: "lek. Z",
          role: "lekarz stomatolog",
          specialization: "Endodoncja (leczenie kanałowe)",
          languages: [],
        },
      ],
    });
    expect(md.match(/leczenie kanałowe/g)?.length).toBe(1);
  });

  it("leaves unmapped specializations untouched", () => {
    const md = scraperOutputToMarkdown({
      ...SAMPLE,
      staff: [
        { name: "lek. W", role: "lekarz stomatolog", specialization: "Radiologia", languages: [] },
      ],
    });
    expect(md).toContain("Radiologia");
    expect(md).not.toContain("Radiologia (");
  });

  it("appends LLM-generated specializationSynonyms not already covered by the map", () => {
    // Auto patient phrasing for NEW agents: the consolidation LLM emits
    // synonyms for unmapped terms; the renderer appends only the ones the
    // deterministic map didn't already put on the line.
    const md = scraperOutputToMarkdown({
      ...SAMPLE,
      staff: [
        {
          name: "lek. Q",
          role: "lekarz stomatolog",
          specialization: "Endodoncja, Gnatologia",
          specializationSynonyms: [
            "leczenie kanałowe", // duplicate — map already adds it
            "leczenie stawów skroniowo-żuchwowych", // novel — must appear
            "ból żuchwy",
          ],
          languages: [],
        },
      ],
    });
    expect(md).toContain("pacjenci pytają też: leczenie stawów skroniowo-żuchwowych, ból żuchwy");
    // the duplicate must not be repeated in the appended tail — the only
    // occurrence is the map's own parenthetical expansion
    expect(md.match(/leczenie kanałowe/g)?.length).toBe(1);
  });

  it("cue line forbids guessing doctor-service attribution (REGRESSION b2stomatologia.pl WS call: agent claimed ALL 7 dentists do root canals; the site lists no specializations)", () => {
    // B2's roster is 7 bare "lekarz dentysta" lines; the clinic's cennik
    // prices leczenie kanałowe. The agent fused the two into "leczeniem
    // kanałowym zajmują się wszyscy nasi lekarze" — real names, real
    // service, INVENTED attribution. The guard must live in the cue line
    // so it is retrieved together with the roster chunk.
    const md = scraperOutputToMarkdown({
      ...SAMPLE,
      staff: [{ name: "lek. dent. Adam B", role: "lekarz dentysta", languages: [] }],
    });
    expect(md).toMatch(/NIE przypisuj|NIE zgaduj/);
    expect(md).toMatch(/recepcj/i);
  });

  it("emits no 'pacjenci pytają' tail when synonyms are absent or all duplicates", () => {
    const md = scraperOutputToMarkdown({
      ...SAMPLE,
      staff: [
        {
          name: "lek. R",
          role: "lekarz stomatolog",
          specialization: "Endodoncja",
          specializationSynonyms: ["leczenie kanałowe"],
          languages: [],
        },
      ],
    });
    expect(md).not.toContain("pacjenci pytają");
  });
});
