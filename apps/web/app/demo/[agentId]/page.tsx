import { notFound } from "next/navigation";
import { getServiceRoleSupabase } from "@/lib/supabase-server";
import { DEMO_STRINGS, isDemoLocale, type DemoLocale } from "@/lib/demo-i18n";
import DemoVoiceClient from "./demo-voice-client";
import LanguageSwitcher from "./language-switcher";
import PastSessionsPane from "./past-sessions-pane";

interface PageProps {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ pin?: string; lang?: string }>;
}

export const revalidate = 0;

export default async function PublicDemoPage({ params, searchParams }: PageProps) {
  const { agentId } = await params;
  const { pin, lang } = await searchParams;

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    notFound();
  }
  if (!/^agent_[A-Za-z0-9]+$/.test(agentId)) {
    notFound();
  }

  const locale: DemoLocale = isDemoLocale(lang) ? lang : "pl";
  const t = DEMO_STRINGS[locale];

  const sb = getServiceRoleSupabase();
  const { data, error } = await sb
    .from("agents")
    .select("id, pin_code, tenants(display_name)")
    .eq("provider_agent_id", agentId)
    .maybeSingle();
  if (error || !data || data.pin_code !== pin) {
    notFound();
  }

  const tenants = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
  const clinicName: string = tenants?.display_name ?? "Twoja klinika";

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 font-sans">
      <div className="mb-8 flex items-center justify-end">
        <LanguageSwitcher current={locale} agentId={agentId} pin={pin} />
      </div>

      <header className="mb-10 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">{t.badge}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{clinicName}</h1>
        <p className="mt-2 text-sm font-medium text-neutral-500">
          {t.taglinePrefix} {clinicName}
        </p>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-neutral-700">{t.hero}</p>
      </header>

      <section className="mb-12">
        <h2 className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {t.whyTitle}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {t.features.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-sm font-semibold text-neutral-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-12 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-900">
          {t.notesTitle}
        </h2>
        <ul className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-amber-900">
          {t.notes.map((n, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="mt-1 text-amber-700">
                •
              </span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <div className="mb-5 text-center">
          <h2 className="text-xl font-semibold text-neutral-900">{t.callSectionTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">{t.callSectionSubtitle}</p>
        </div>
        <DemoVoiceClient agentId={agentId} strings={t} pin={pin} />
      </section>

      <PastSessionsPane agentId={agentId} pin={pin} strings={t} />

      <footer className="mt-16 text-center text-xs text-neutral-400">{t.poweredBy}</footer>
    </main>
  );
}
