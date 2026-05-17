"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLE_KB = `# Klinika Weterynaryjna Łapka

## Klinika
- Adres: ul. Marszałkowska 100, Warszawa
- Telefon: +48 22 555 12 34
- Godziny: pon-pt 9:00-20:00, sob 10:00-15:00

## Lekarze
- dr Anna Nowak — chirurgia małych zwierząt, języki: polski, angielski
- dr Piotr Wiśniewski — interna, języki: polski

## Usługi i ceny
- Konsultacja podstawowa: 180 PLN
- Szczepienie kompleksowe (psy): 220 PLN
- Wizyta nocna / pilna: unknown
- Sterylizacja kotki: 600 PLN

## FAQ
- **Czy przyjmujemy nagłe przypadki?** Tak, w godzinach pracy. Po godzinach prosimy o kontakt z pogotowiem weterynaryjnym +48 22 555 99 99.
- **Czy potrzebne jest skierowanie?** Nie. Przyjmujemy wszystkich pacjentów bez skierowania.
`;

interface ProvisionResponse {
  tenantId: string;
  agentId: string;
  browserTestUrl: string;
  knowledgeDocumentId: string;
}

export default function ProvisionPage() {
  const router = useRouter();
  const [tenantName, setTenantName] = useState("Klinika Łapka");
  const [knowledgeMarkdown, setKnowledgeMarkdown] = useState(EXAMPLE_KB);
  const [language, setLanguage] = useState<"pl" | "en" | "ru">("pl");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantName, knowledgeMarkdown, language }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.message ?? json?.error ?? `Provision failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      const data = json as ProvisionResponse;
      router.push(`/test/${data.agentId}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
          Step 1 of 2
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">
          Provision a new agent
        </h1>
        <p className="max-w-2xl text-neutral-600">
          Paste a clean markdown knowledge document for the business you want
          to demo. The agent grounds every answer in this document and politely
          says <em>nie mam tej informacji</em> when something isn&apos;t in
          source.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <Field
          id="tenantName"
          label="Business name"
          hint="Shown in the agent's greeting. Use the actual brand."
        >
          <input
            id="tenantName"
            type="text"
            required
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
        </Field>

        <Field
          id="language"
          label="Primary language"
          hint="ElevenLabs auto-detects PL/EN/RU mid-call; this is just the greeting language."
        >
          <div className="flex gap-2">
            {(["pl", "en", "ru"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                disabled={submitting}
                className={`rounded-lg border px-4 py-2 text-sm font-medium uppercase tracking-wider transition ${
                  language === lang
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                } disabled:opacity-50`}
              >
                {lang}
              </button>
            ))}
          </div>
        </Field>

        <Field
          id="knowledgeMarkdown"
          label="Knowledge document (markdown)"
          hint="Klinika section · Lekarze · Usługi i ceny · FAQ. The hard rule: never invent prices — mark unknown if not in source."
        >
          <textarea
            id="knowledgeMarkdown"
            required
            value={knowledgeMarkdown}
            onChange={(e) => setKnowledgeMarkdown(e.target.value)}
            disabled={submitting}
            rows={18}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-xs leading-relaxed transition focus:border-neutral-400 focus:bg-white focus:outline-none disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-neutral-500">
            {knowledgeMarkdown.length.toLocaleString()} characters
          </p>
        </Field>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-neutral-100 pt-6">
          <p className="text-xs text-neutral-500">
            We upload to ElevenLabs, provision the agent, write the tenant row,
            and hand you a test page. ~10 seconds.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Provisioning…" : "Provision agent"}
            {!submitting ? <span aria-hidden>→</span> : null}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
      </label>
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
      {children}
    </div>
  );
}
