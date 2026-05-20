import { notFound } from "next/navigation";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import { formatPolishDayAndTime } from "@/lib/format-pl-datetime";

export const revalidate = 0;

type Params = { params: Promise<{ token: string }> };

export default async function ConfirmationPage({ params }: Params) {
  const { token } = await params;
  if (!/^[A-Za-z0-9]{8}$/.test(token)) {
    notFound();
  }
  const sb = getServiceRoleSupabase();
  const { data, error } = await sb
    .from("bookings")
    .select(
      "id, short_token, starts_at, ends_at, appointment_category, tenants(display_name, contact_phone)",
    )
    .eq("short_token", token)
    .maybeSingle();
  if (error || !data) notFound();

  const tenants = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
  const clinicName: string = tenants?.display_name ?? "Klinika";
  const contactPhone: string | null = tenants?.contact_phone ?? null;
  const startsAt = new Date(data.starts_at);
  const whenLine = formatPolishDayAndTime(startsAt);

  return (
    <main className="mx-auto max-w-md px-6 py-10 font-sans">
      <header className="mb-8 text-center">
        <p className="text-sm uppercase tracking-wider text-neutral-500">
          Potwierdzenie wizyty
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{clinicName}</h1>
      </header>
      <section className="mb-8 rounded-2xl border border-neutral-200 p-6 text-center">
        <p className="text-lg">{whenLine}</p>
      </section>
      <a
        href={`/b/${token}/calendar.ics`}
        className="block w-full rounded-xl bg-black px-6 py-4 text-center text-white font-medium"
      >
        Dodaj do kalendarza
      </a>
      {contactPhone ? (
        <p className="mt-6 text-center text-sm text-neutral-600">
          Aby odwołać, zadzwoń:{" "}
          <a href={`tel:${contactPhone}`} className="font-semibold">
            {contactPhone}
          </a>
        </p>
      ) : null}
      <footer className="mt-12 text-center text-xs text-neutral-400">
        Powered by AI Receptionist
      </footer>
    </main>
  );
}
