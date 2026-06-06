import { describe, it, expect } from "vitest";
import { ScraperTenantInfoSchema } from "../src/scraper.schema.js";

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
