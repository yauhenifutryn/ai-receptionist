import Link from "next/link";
import type { Route } from "next";
import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal-config";
import { DraftBanner } from "./_components";

export const metadata: Metadata = {
  title: `Legal — ${LEGAL.productName}`,
  // Pre-incorporation drafts: keep them reachable for demos but out of the index.
  robots: { index: false, follow: false },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 sm:px-8 sm:py-12">
        <div className="flex items-center justify-between">
          <Link
            href={"/" as Route}
            className="font-mono text-xs uppercase tracking-wider text-neutral-400 transition hover:text-neutral-700"
          >
            ← {LEGAL.productName}
          </Link>
          <Link
            href={"/legal" as Route}
            className="text-sm text-neutral-500 transition hover:text-neutral-800"
          >
            All policies
          </Link>
        </div>
        <DraftBanner />
        {children}
        <footer className="border-t border-neutral-200 pt-6 text-xs leading-relaxed text-neutral-400">
          {LEGAL.productName} · Effective {LEGAL.effectiveDate} · Governed by {LEGAL.governingLaw}.
          A Polish-language version is required before production use with live patient traffic.
        </footer>
      </div>
    </div>
  );
}
