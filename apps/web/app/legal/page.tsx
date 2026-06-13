import Link from "next/link";
import type { Route } from "next";
import { LEGAL } from "@/lib/legal-config";
import { PolicyHeader, P } from "./_components";

export default function LegalIndexPage() {
  return (
    <div className="flex flex-col gap-8">
      <PolicyHeader title="Legal & privacy" updated={LEGAL.lastUpdated} />
      <P>
        How {LEGAL.productName} handles personal data, the terms for using the service, and the
        third parties that help us run it. For patient data handled on behalf of a clinic we act as
        a processor; for our own website and account data we act as the controller. See Data &amp;
        Compliance for the distinction.
      </P>
      <div className="grid gap-3 sm:grid-cols-2">
        {LEGAL.pages.map((p) => (
          <Link
            key={p.slug}
            href={`/legal/${p.slug}` as Route}
            className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <span className="text-sm font-semibold text-neutral-900">{p.label}</span>
            <span className="text-xs leading-relaxed text-neutral-500">{p.blurb}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
