import { NextResponse } from "next/server";
import { createEvent } from "ics";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  if (!/^[A-Za-z0-9]{8}$/.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sb = getServiceRoleSupabase();
  const { data, error } = await sb
    .from("bookings")
    .select("starts_at, ends_at, tenants(display_name)")
    .eq("short_token", token)
    .maybeSingle();
  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }
  const tenants = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
  const clinic: string = tenants?.display_name ?? "Klinika";
  const start = new Date(data.starts_at);
  const end = new Date(data.ends_at);
  const { value, error: icsError } = createEvent({
    start: [
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      start.getUTCDate(),
      start.getUTCHours(),
      start.getUTCMinutes(),
    ],
    startInputType: "utc",
    end: [
      end.getUTCFullYear(),
      end.getUTCMonth() + 1,
      end.getUTCDate(),
      end.getUTCHours(),
      end.getUTCMinutes(),
    ],
    endInputType: "utc",
    title: `Wizyta w ${clinic}`,
    description: `Potwierdzenie wizyty w ${clinic}.`,
    productId: "ai-receptionist/ics",
    uid: `${token}@ai-receptionist`,
  });
  if (icsError || !value) {
    return new NextResponse("ICS generation failed", { status: 500 });
  }
  return new NextResponse(value, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="wizyta.ics"`,
    },
  });
}
