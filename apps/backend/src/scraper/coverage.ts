import type { ScraperOutput } from "@ai-receptionist/contracts";

/**
 * Coverage report — sanity-check the consolidated scrape against what a
 * voice-receptionist actually needs to function. Surfaces warnings the
 * UI can show as yellow banners so non-technical operators (clinic
 * owners running self-onboarding) see "10 services, 0 with prices —
 * probably missed the pricing page" instead of silently shipping a
 * gimped agent.
 *
 * Categorized by criticality:
 *   - critical: agent can't function without this (no phone, no name)
 *   - high: agent gives bad UX without this (services without prices)
 *   - medium: nice to have (FAQ count low, hours partial)
 *
 * Purely deterministic — no LLM call. Runs in microseconds after the
 * scrape consolidation step.
 */

export type CoverageSeverity = "critical" | "high" | "medium";

export interface CoverageWarning {
  severity: CoverageSeverity;
  /** Stable code so the UI can map to translated copy if needed. */
  code: string;
  /** Human-readable English message. */
  message: string;
  /** Suggested action ("re-scrape with higher ceiling", "ask owner", ...). */
  suggestion?: string;
}

export interface CoverageReport {
  /** Single 0..1 score: 1.0 means everything we want is captured. */
  score: number;
  warnings: CoverageWarning[];
  details: {
    tenantName: string;
    hasPhone: boolean;
    hasAddress: boolean;
    hasEmail: boolean;
    hasHours: boolean;
    servicesCount: number;
    servicesWithPrices: number;
    staffCount: number;
    faqCount: number;
  };
}

export function reportCoverage(out: ScraperOutput): CoverageReport {
  const details = {
    tenantName: out.tenant.name,
    hasPhone: !!out.tenant.phone && out.tenant.phone.trim().length > 0,
    hasAddress: !!out.tenant.address && out.tenant.address.trim().length > 0,
    hasEmail: !!out.tenant.email && out.tenant.email.trim().length > 0,
    hasHours: hasAnyHours(out),
    servicesCount: out.services.length,
    servicesWithPrices: out.services.filter(
      (s) =>
        s.price &&
        (typeof s.price.min === "number" || typeof s.price.max === "number"),
    ).length,
    staffCount: out.staff.length,
    faqCount: out.faq.length,
  };

  const warnings: CoverageWarning[] = [];

  // CRITICAL — agent can't run without these
  if (!details.hasPhone) {
    warnings.push({
      severity: "critical",
      code: "no_phone",
      message:
        "No phone number was captured. The agent has nothing to give callers asking how to reach the clinic.",
      suggestion:
        "Verify /kontakt was scraped. Add phone manually below if the site doesn't list one.",
    });
  }
  if (!details.hasAddress) {
    warnings.push({
      severity: "critical",
      code: "no_address",
      message:
        "No address was captured. Callers asking 'where are you' will get 'nie mam tej informacji'.",
      suggestion: "Add address manually below.",
    });
  }

  // HIGH — agent will function but give bad UX
  if (details.servicesCount >= 3 && details.servicesWithPrices === 0) {
    warnings.push({
      severity: "high",
      code: "services_without_prices",
      message: `Found ${details.servicesCount} services but zero have prices. Most pricing pages live at /cennik or /uslugi/<service>; the agent will say 'nie mam tej informacji' for every price question.`,
      suggestion:
        "Re-run with a longer scrape ceiling, or paste prices manually into the knowledge document below.",
    });
  } else if (
    details.servicesCount >= 5 &&
    details.servicesWithPrices < Math.ceil(details.servicesCount * 0.3)
  ) {
    warnings.push({
      severity: "high",
      code: "most_services_without_prices",
      message: `Only ${details.servicesWithPrices} of ${details.servicesCount} services have prices.`,
      suggestion:
        "Likely missed deeper service pages. Consider re-running or filling in manually.",
    });
  }
  if (!details.hasHours) {
    warnings.push({
      severity: "high",
      code: "no_hours",
      message:
        "No opening hours captured. Callers asking 'czy są Państwo otwarci' won't get an answer.",
      suggestion: "Hours usually appear on /kontakt or in the page footer. Add manually if needed.",
    });
  }

  // MEDIUM — nice to have
  if (details.servicesCount === 0) {
    warnings.push({
      severity: "high",
      code: "no_services",
      message:
        "No services captured — the agent will only handle generic booking requests.",
      suggestion: "Add services manually if this clinic offers specific treatments.",
    });
  }
  if (details.staffCount === 0) {
    warnings.push({
      severity: "medium",
      code: "no_staff",
      message:
        "No staff/doctors captured. Callers asking for a specific person won't get a match.",
    });
  }
  if (details.faqCount === 0) {
    warnings.push({
      severity: "medium",
      code: "no_faq",
      message:
        "No FAQ entries captured. The agent will defer more questions to staff than necessary.",
    });
  }

  // Score: start at 1.0, subtract per warning by severity weight.
  let score = 1.0;
  for (const w of warnings) {
    score -=
      w.severity === "critical" ? 0.3 : w.severity === "high" ? 0.15 : 0.05;
  }
  score = Math.max(0, Math.min(1, score));

  return { score, warnings, details };
}

function hasAnyHours(out: ScraperOutput): boolean {
  const h = out.tenant.hours;
  if (!h) return false;
  return (
    [
      h.monday,
      h.tuesday,
      h.wednesday,
      h.thursday,
      h.friday,
      h.saturday,
      h.sunday,
    ].some((d) => !!d && d.trim().length > 0) || !!h.notes
  );
}
