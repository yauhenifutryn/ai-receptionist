import { type NextRequest } from "next/server";
import { canonicalizeUrl } from "@ai-receptionist/backend/scraper";
import { getOperatorOrJsonError } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Row shape as stored; mapped to camelCase for the client. */
interface DraftRow {
  id: string;
  operator_user_id: string;
  source_url: string;
  canonical_url: string;
  tenant_name: string;
  knowledge_markdown: string;
  system_prompt: string;
  coverage: unknown;
  scraper_summary: unknown;
  created_at: string;
  updated_at: string;
}

export interface DraftDTO {
  id: string;
  sourceUrl: string;
  canonicalUrl: string;
  tenantName: string;
  knowledgeMarkdown: string;
  systemPrompt: string;
  coverage: unknown;
  scraperSummary: unknown;
  createdAt: string;
  updatedAt: string;
}

function toDTO(r: DraftRow): DraftDTO {
  return {
    id: r.id,
    sourceUrl: r.source_url,
    canonicalUrl: r.canonical_url,
    tenantName: r.tenant_name,
    knowledgeMarkdown: r.knowledge_markdown,
    systemPrompt: r.system_prompt,
    coverage: r.coverage,
    scraperSummary: r.scraper_summary,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLUMNS =
  "id, operator_user_id, source_url, canonical_url, tenant_name, knowledge_markdown, system_prompt, coverage, scraper_summary, created_at, updated_at";

/**
 * GET /api/drafts          → list all in-progress drafts (dashboard)
 * GET /api/drafts?url=<u>   → look up the single draft for a URL (cache hit
 *                            check before re-scraping). 200 with {draft:null}
 *                            when no cache exists — NOT a 404, so the client
 *                            can branch without treating "no cache" as error.
 */
export async function GET(req: NextRequest) {
  const operator = await getOperatorOrJsonError();
  if (!operator.ok) {
    return Response.json({ error: operator.body.error }, { status: operator.status });
  }

  const urlParam = req.nextUrl.searchParams.get("url");

  if (urlParam) {
    const canonical = canonicalizeUrl(urlParam);
    if (!canonical) {
      return Response.json({ error: "invalid_url" }, { status: 400 });
    }
    const { data, error } = await operator.supabase
      .from("provision_drafts")
      .select(COLUMNS)
      .eq("canonical_url", canonical)
      .maybeSingle();
    if (error) {
      return Response.json(
        { error: "draft_lookup_failed", message: error.message },
        { status: 500 },
      );
    }
    return Response.json({ draft: data ? toDTO(data as unknown as DraftRow) : null });
  }

  const { data, error } = await operator.supabase
    .from("provision_drafts")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    return Response.json({ error: "draft_list_failed", message: error.message }, { status: 500 });
  }
  return Response.json({ drafts: ((data ?? []) as unknown as DraftRow[]).map(toDTO) });
}
