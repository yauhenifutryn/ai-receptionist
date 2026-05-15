import { z } from "zod";

/**
 * ScraperOutput — vertical-agnostic normalized shape produced by the
 * Firecrawl-map → Firecrawl-crawl → Claude-consolidate pipeline.
 *
 * The consolidation prompt MUST emit values matching this schema. Every field
 * is optional EXCEPT `tenant.name` and `sourceUrl` so that we never refuse to
 * persist a partial result.
 *
 * Hard rule baked into the consolidation prompt: never invent prices.
 * If a price is not in the source markdown, set `priceUnit: "unknown"`.
 */

const PolishLikeMoneySchema = z
  .object({
    amount: z.union([z.number(), z.literal("unknown")]),
    currency: z.literal("PLN"),
  })
  .strict();

export const ScraperServiceSchema = z
  .object({
    name: z.string().min(1),
    synonyms: z.array(z.string()).default([]),
    description: z.string().optional(),
    durationMinutes: z.number().int().positive().optional(),
    price: PolishLikeMoneySchema.optional(),
    nfzCovered: z.enum(["full", "partial", "none", "unknown"]).default("unknown"),
    requiresConsultationFirst: z.boolean().optional(),
  })
  .strict();
export type ScraperService = z.infer<typeof ScraperServiceSchema>;

export const ScraperStaffSchema = z
  .object({
    name: z.string().min(1),
    role: z.string().optional(),
    specialization: z.string().optional(),
    languages: z.array(z.string()).default([]),
  })
  .strict();
export type ScraperStaff = z.infer<typeof ScraperStaffSchema>;

export const ScraperFaqSchema = z
  .object({
    question: z.string().min(1),
    answer: z.string().min(1),
  })
  .strict();
export type ScraperFaq = z.infer<typeof ScraperFaqSchema>;

export const ScraperHoursSchema = z
  .object({
    monday: z.string().optional(),
    tuesday: z.string().optional(),
    wednesday: z.string().optional(),
    thursday: z.string().optional(),
    friday: z.string().optional(),
    saturday: z.string().optional(),
    sunday: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type ScraperHours = z.infer<typeof ScraperHoursSchema>;

export const ScraperTenantInfoSchema = z
  .object({
    /** Display name (vertical-agnostic — clinic, shop, agency, firma). */
    name: z.string().min(1),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    hours: ScraperHoursSchema.optional(),
    description: z.string().optional(),
  })
  .strict();
export type ScraperTenantInfo = z.infer<typeof ScraperTenantInfoSchema>;

export const ScraperOutputSchema = z
  .object({
    /** Where the scrape was rooted. */
    sourceUrl: z.string().url(),
    /** When the consolidation finished (ISO 8601). */
    scrapedAt: z.string().datetime(),
    tenant: ScraperTenantInfoSchema,
    staff: z.array(ScraperStaffSchema).default([]),
    services: z.array(ScraperServiceSchema).default([]),
    faq: z.array(ScraperFaqSchema).default([]),
    /** Free-form notes the consolidation step couldn't slot anywhere — for human review. */
    unsorted: z.string().optional(),
    /** True when at least one price came back as `unknown`; signals owner-review needed. */
    hasUnknownPrices: z.boolean().default(false),
  })
  .strict();
export type ScraperOutput = z.infer<typeof ScraperOutputSchema>;
