import Link from "next/link";
import type { Route } from "next";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-16">
      <section className="flex flex-col gap-6">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Operator console
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          A Polish-speaking receptionist that never sleeps.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-neutral-600">
          Internal tool for the AI Receptionist sales team. Provision Polish voice agents for
          Warsaw-area dental clinics, assign phone numbers, and ship a live demo to the prospect
          within minutes.
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500">
          Clinics never see this page. The wow effect for them is a single phone number that already
          knows their services, prices, and doctors — not a self-onboarding wizard.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href={"/dashboard" as Route}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
          >
            Open dashboard
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {[
          {
            kicker: "01",
            title: "Paste URL",
            body: "Sales rep pastes a clinic's website. Firecrawl scrapes, Gemini consolidates into a Polish-dental knowledge base.",
          },
          {
            kicker: "02",
            title: "Provision",
            body: "ElevenLabs spins up a Polish voice agent grounded in that clinic's real services + prices. ~5 minutes per agent.",
          },
          {
            kicker: "03",
            title: "Ship a number",
            body: "Twilio PL number bound to the agent. Send the prospect a 'call this number' link. They call cold and sign the pilot.",
          },
        ].map((step) => (
          <div
            key={step.kicker}
            className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
          >
            <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
              {step.kicker}
            </span>
            <h3 className="text-base font-semibold">{step.title}</h3>
            <p className="text-sm leading-relaxed text-neutral-600">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Under the hood
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Row label="Voice runtime" value="ElevenLabs ConvAI · EU media region" />
          <Row label="Agent LLM" value="Qwen3.6-35B-A3B · ~223 ms TTFB" />
          <Row label="TTS" value="eleven_flash_v2_5 · stability 0.85 · speed 0.8" />
          <Row label="Audio retention" value="0 days · RODO-compliant" />
          <Row label="Knowledge base" value="Firecrawl + Gemini 3 Flash" />
          <Row label="Storage" value="Supabase Ireland · row-level security" />
        </dl>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 py-2 last:border-b-0 sm:border-b-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-800">{value}</dd>
    </div>
  );
}
