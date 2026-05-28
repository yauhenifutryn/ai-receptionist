import { type NextRequest } from "next/server";
import { z } from "zod";
import { ScraperOutputSchema, type ScraperOutput } from "@ai-receptionist/contracts";
import { scraperOutputToMarkdown, reportCoverage } from "@ai-receptionist/backend/scraper";
import { buildSystemPrompt, extractPolishCity } from "@ai-receptionist/backend/prompts";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  merged: ScraperOutputSchema,
  rootUrl: z.string().url(),
  urlsMapped: z.number().int().nonnegative(),
  urlsDroppedByFilter: z.number().int().nonnegative(),
  pagesScraped: z.number().int().nonnegative(),
});

export async function POST(req: NextRequest) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return Response.json({ error: operator.body.error }, { status: operator.status });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { merged, rootUrl, urlsMapped, urlsDroppedByFilter, pagesScraped } = parsed.data;

  const scraperOutput = merged as ScraperOutput;
  const knowledgeMarkdown = scraperOutputToMarkdown(scraperOutput);
  const detectedCity = extractPolishCity(scraperOutput.tenant.address);
  const systemPrompt = buildSystemPrompt({
    tenantDisplayName: scraperOutput.tenant.name,
    ...(detectedCity ? { city: detectedCity } : {}),
  });
  const coverage = reportCoverage(scraperOutput);

  return Response.json({
    suggestedTenantName: scraperOutput.tenant.name,
    knowledgeMarkdown,
    systemPrompt,
    coverage,
    scraperSummary: {
      sourceUrl: rootUrl,
      scrapedAt: scraperOutput.scrapedAt,
      urlsMapped,
      urlsDroppedByFilter,
      pagesScraped,
      servicesCount: scraperOutput.services.length,
      staffCount: scraperOutput.staff.length,
      faqCount: scraperOutput.faq.length,
      hasUnknownPrices: scraperOutput.hasUnknownPrices,
    },
  });
}
