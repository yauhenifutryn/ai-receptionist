import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-16">
      <section className="flex flex-col gap-6">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Sprint demo · Day 10
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          A Polish-speaking receptionist that never sleeps.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-neutral-600">
          Paste a knowledge document for any clinic, salon, or service business.
          We provision a live voice agent that answers calls in Polish, books
          appointments, and escalates anything operationally complex — in under
          a minute.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href="/provision"
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
          >
            Try the demo
            <span aria-hidden>→</span>
          </Link>
          <a
            href="https://github.com/yauhenifutryn/ai-receptionist"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
          >
            View the code
          </a>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {[
          {
            kicker: "01",
            title: "Paste",
            body: "Bring your own scraped markdown for any business. Services, hours, prices, staff.",
          },
          {
            kicker: "02",
            title: "Provision",
            body: "We upload it to ElevenLabs as a knowledge base and stand up a voice agent for you.",
          },
          {
            kicker: "03",
            title: "Test",
            body: "Open the browser widget and talk to the agent in Polish. Booking flows write to Supabase.",
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
          <Row label="Agent LLM" value="Qwen3.6-35B-A3B · ~223 ms latency" />
          <Row label="Voice" value="Polish-native multilingual · stability 0.45" />
          <Row label="Audio retention" value="0 days · RODO-compliant" />
          <Row label="Backend" value="Hono · Zod-validated server tools" />
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
