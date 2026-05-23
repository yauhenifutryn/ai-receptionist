import { redirect } from "next/navigation";
import { getUserSupabase } from "@/lib/supabase-server";
import OwnerBookingsTable, { type OwnerBookingRow } from "./owner-bookings-table";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface BookingsSummary {
  count7d: number;
  count30d: number;
  countAll: number;
  recovered7dPln: number;
  recovered30dPln: number;
  recoveredAllPln: number;
}

/**
 * Owner bookings list.
 *
 * Reads bookings directly via the user-scoped Supabase client; RLS
 * (`is_tenant_member`) gates rows to the signed-in owner's tenant. No
 * explicit tenant_id filter required.
 *
 * Optional URL params: ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD.
 *
 * Empty-state notice handles the Zadarma-pending case (no PSTN bookings
 * yet) by pointing at the demo URL the operator owns.
 */
export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;
  const dateFrom = typeof sp.dateFrom === "string" ? sp.dateFrom : undefined;
  const dateTo = typeof sp.dateTo === "string" ? sp.dateTo : undefined;

  const supabase = await getUserSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/auth/sign-in");

  let query = supabase
    .from("bookings")
    .select(
      "id, starts_at, patient_name, status, appointment_category, recovered_revenue_pln, short_token, conversation_id",
    );
  if (dateFrom) query = query.gte("starts_at", dateFrom);
  if (dateTo) query = query.lte("starts_at", dateTo);

  const { data, error } = await query.order("starts_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as OwnerBookingRow[];

  // Summary stats. Cheap: same RLS-scoped query, no joins. We deliberately
  // run three separate counts rather than computing client-side from `rows`
  // because the rows are capped at 100. If a tenant has 200 bookings the
  // numbers would lie.
  const now = Date.now();
  const cutoff7 = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
  const cutoff30 = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

  // Note: we count by `created_at` window (when the booking was made) for
  // "recent activity". starts_at would mean "upcoming in next 7d" which is
  // a different question.
  const summaryRes = await Promise.all([
    supabase.from("bookings").select("recovered_revenue_pln, created_at"),
  ]);
  const summaryRows =
    (summaryRes[0].data as Array<{ recovered_revenue_pln: number | null; created_at: string }>) ??
    [];

  const summary: BookingsSummary = {
    count7d: 0,
    count30d: 0,
    countAll: summaryRows.length,
    recovered7dPln: 0,
    recovered30dPln: 0,
    recoveredAllPln: 0,
  };
  for (const r of summaryRows) {
    const created = r.created_at;
    const rev = Number(r.recovered_revenue_pln ?? 0);
    summary.recoveredAllPln += rev;
    if (created >= cutoff30) {
      summary.count30d += 1;
      summary.recovered30dPln += rev;
    }
    if (created >= cutoff7) {
      summary.count7d += 1;
      summary.recovered7dPln += rev;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <p className="text-sm text-neutral-500">
          Appointments your AI receptionist has booked. Includes real phone calls and demo sessions.
        </p>
      </header>

      <SummaryCard summary={summary} />

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Failed to load bookings: {error.message}
        </div>
      ) : (
        <OwnerBookingsTable rows={rows} dateFrom={dateFrom} dateTo={dateTo} />
      )}
    </main>
  );
}

function SummaryCard({ summary }: { summary: BookingsSummary }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat label="Last 7 days" count={summary.count7d} revenuePln={summary.recovered7dPln} />
      <Stat label="Last 30 days" count={summary.count30d} revenuePln={summary.recovered30dPln} />
      <Stat label="All time" count={summary.countAll} revenuePln={summary.recoveredAllPln} />
    </section>
  );
}

function Stat({ label, count, revenuePln }: { label: string; count: number; revenuePln: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-2xl font-semibold text-neutral-900">{count}</span>
        <span className="text-xs text-neutral-500">bookings</span>
      </div>
      <div className="mt-1 text-sm text-emerald-700">
        {revenuePln > 0 ? `+${revenuePln.toLocaleString("pl-PL")} PLN recovered` : "— PLN"}
      </div>
    </div>
  );
}
