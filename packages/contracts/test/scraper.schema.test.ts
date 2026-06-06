import { describe, it, expect } from "vitest";
import { ScraperStaffSchema, ScraperTenantInfoSchema } from "../src/scraper.schema.js";

describe("ScraperStaffSchema", () => {
  it("carries LLM-generated patient synonyms for the specialization, defaulting to []", () => {
    // dentus.szczecin.pl real-call lesson (2026-06-06): roster lines need
    // patient phrasing to win RAG retrieval. The deterministic map in
    // to-markdown.ts covers the dental core taxonomy; this field lets the
    // consolidation LLM cover everything else (rare specializations, other
    // verticals) automatically for every NEW agent.
    const withSyns = ScraperStaffSchema.safeParse({
      name: "lek. stom. Anna Stefańczyk",
      specialization: "Endodoncja",
      specializationSynonyms: ["leczenie kanałowe", "kanałowe leczenie zębów"],
    });
    expect(withSyns.success).toBe(true);

    const without = ScraperStaffSchema.parse({ name: "dr X" });
    expect(without.specializationSynonyms).toEqual([]);
  });
});

describe("ScraperTenantInfoSchema", () => {
  it("accepts a single plain email", () => {
    const r = ScraperTenantInfoSchema.safeParse({
      name: "Klinika X",
      email: "gabinet@klinika.pl",
    });
    expect(r.success).toBe(true);
  });

  it("REGRESSION dentus.szczecin.pl: accepts multi-location comma-joined emails", () => {
    // Two-location clinics publish one email per gabinet. The consolidation
    // LLM faithfully captures both ("a@x.pl, b@x.pl") — z.string().email()
    // rejected that and killed the whole provisioning run (2026-06-06).
    // This field is descriptive KB text, not a send-to address; format
    // validation is wrong here.
    const r = ScraperTenantInfoSchema.safeParse({
      name: "Gabinety Dentus",
      email: "gabinet@dentus.szczecin.pl, dentus2@dentus.szczecin.pl",
    });
    expect(r.success).toBe(true);
  });
});
