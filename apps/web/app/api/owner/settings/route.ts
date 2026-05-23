import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveOwnerAgent } from "@/lib/owner-agent-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-scoped settings read/write. Currently exposes a single field:
 *
 *   sms_confirmations_enabled — when false, the post-booking SMS side-effect
 *   in handleCreateBooking is skipped silently. Default `true` (preserves
 *   existing behavior). Wired into the booking flow via the BookingsRepository
 *   resolver (apps/web/lib/booking-deps.ts), which surfaces the flag through
 *   TenantConfig.
 *
 * GET returns { sms_confirmations_enabled, zadarmaConfigured }. The
 * zadarmaConfigured flag is computed server-side from environment presence
 * — never exposes the actual key bytes. It exists so the UI can warn the
 * owner that flipping the toggle ON won't take effect until the operator
 * provisions Zadarma credentials.
 *
 * PATCH gates on tenant_member (via resolveOwnerAgent) and updates the
 * tenants row scoped by the resolved tenantId. RLS on the tenant_members
 * table is what enforces "you can only flip your own clinic".
 */

export async function GET(_req: NextRequest) {
  const ctx = await resolveOwnerAgent();
  if (!ctx.ok) return NextResponse.json(ctx.body, { status: ctx.status });

  const { data, error } = await ctx.supabase
    .from("tenants")
    .select("sms_confirmations_enabled")
    .eq("id", ctx.ctx.tenantId)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: "tenants_read_failed", message: error.message },
      { status: 500 },
    );
  }
  const sms_confirmations_enabled =
    typeof data?.sms_confirmations_enabled === "boolean" ? data.sms_confirmations_enabled : true;

  const zadarmaConfigured = Boolean(process.env.ZADARMA_USER_KEY && process.env.ZADARMA_SECRET_KEY);

  return NextResponse.json({ sms_confirmations_enabled, zadarmaConfigured });
}

const PatchSchema = z.object({
  sms_confirmations_enabled: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const ctx = await resolveOwnerAgent();
  if (!ctx.ok) return NextResponse.json(ctx.body, { status: ctx.status });

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { error } = await ctx.supabase
    .from("tenants")
    .update({ sms_confirmations_enabled: parsed.data.sms_confirmations_enabled })
    .eq("id", ctx.ctx.tenantId);
  if (error) {
    return NextResponse.json(
      { error: "tenants_update_failed", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sms_confirmations_enabled: parsed.data.sms_confirmations_enabled,
  });
}
