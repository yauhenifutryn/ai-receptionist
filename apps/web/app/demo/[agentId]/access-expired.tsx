const CONTACT_EMAIL = "yauheni.futryn@gmail.com";

/**
 * Shown on the public /demo/<agentId> route whenever access can't be granted:
 * the PIN was regenerated (old demo-day link), the PIN is missing or wrong, or
 * the agent is unknown. Replaces a hard 404 with a calm, on-brand bilingual
 * (EN + PL) message and a mailto link, so an expired link reads as "this ended"
 * rather than "this is broken". Reused for any expired / rotated-PIN access.
 */
export default function AccessExpired() {
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    "AI Receptionist demo access",
  )}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6 py-16 font-sans">
      <div className="w-full rounded-3xl border border-neutral-200 bg-white p-10 text-center shadow-sm sm:p-14">
        <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.25em] text-neutral-500">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          AI Receptionist
        </span>

        {/* English */}
        <h1 className="mt-7 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
          This demo access has expired.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-neutral-600">
          Thanks for trying out the system. To extend your access or if you have any questions,
          reach out anytime.
        </p>

        {/* Polish */}
        <div className="mx-auto mt-10 max-w-md border-t border-neutral-200 pt-10">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Dostęp do demo wygasł.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-600">
            Dziękujemy za przetestowanie systemu. Aby przedłużyć dostęp lub w razie pytań, napisz do
            nas w dowolnej chwili.
          </p>
        </div>

        <a
          href={mailto}
          className="mt-10 inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
        >
          {CONTACT_EMAIL}
        </a>
      </div>
    </main>
  );
}
