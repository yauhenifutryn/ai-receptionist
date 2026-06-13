import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { LEGAL, LEGAL_IS_DRAFT } from "@/lib/legal-config";

/**
 * Shared presentational primitives for the public /legal pages. Styling mirrors
 * the operator privacy reference (app/dashboard/privacy) so the legal surface
 * is visually consistent with the rest of the product: neutral palette,
 * rounded-2xl bordered cards, max-w-3xl reading column.
 *
 * These are public (no auth). Content is driven by lib/legal-config.ts.
 */

export function DraftBanner() {
  if (!LEGAL_IS_DRAFT) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
      <strong>Draft, pre-incorporation.</strong> These policies are published for evaluation and
      demonstration. The controller is currently a natural person pending registration of a Polish
      limited company; some identity fields are being finalized. A Polish-language version and a
      lawyer review are required before production use with live patient traffic.
    </div>
  );
}

export function PolicyHeader({ title, updated }: { title: string; updated?: string }) {
  return (
    <header className="flex flex-col gap-3">
      <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
        {LEGAL.productName} · Legal
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{title}</h1>
      {updated ? (
        <p className="font-mono text-xs text-neutral-400">Last updated: {updated}</p>
      ) : null}
    </header>
  );
}

export function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-neutral-700">{children}</p>;
}

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-neutral-700">
          <span
            aria-hidden
            className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-neutral-400"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Renders a config value, or a visible "to complete" token when still blank. */
export function Fill({ value, hint }: { value: string; hint: string }) {
  if (value && value.trim()) return <>{value}</>;
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-800">
      [{hint}]
    </span>
  );
}

export function SubprocessorTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
            <th className="py-2 pr-4 font-medium">Processor</th>
            <th className="py-2 pr-4 font-medium">Purpose</th>
            <th className="py-2 pr-4 font-medium">Location</th>
            <th className="py-2 font-medium">Transfer</th>
          </tr>
        </thead>
        <tbody>
          {LEGAL.subprocessors.map((s) => (
            <tr key={s.name} className="border-b border-neutral-100 align-top">
              <td className="py-3 pr-4 font-medium text-neutral-900">{s.name}</td>
              <td className="py-3 pr-4 text-neutral-700">{s.purpose}</td>
              <td className="py-3 pr-4 text-neutral-700">{s.location}</td>
              <td className="py-3 text-neutral-700">{s.transfer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RetentionTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
            <th className="py-2 pr-4 font-medium">Data</th>
            <th className="py-2 pr-4 font-medium">Retention</th>
            <th className="py-2 font-medium">Where</th>
          </tr>
        </thead>
        <tbody>
          {LEGAL.retention.map((r) => (
            <tr key={r.data} className="border-b border-neutral-100 align-top">
              <td className="py-3 pr-4 font-medium text-neutral-900">{r.data}</td>
              <td className="py-3 pr-4 text-neutral-700">{r.retention}</td>
              <td className="py-3 text-neutral-700">{r.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ControllerLine() {
  return (
    <P>
      The data controller is <Fill value={LEGAL.controllerLegalName} hint="controller legal name" />
      , {LEGAL.controllerStatus}, contactable at{" "}
      <Fill value={LEGAL.contactEmail} hint="contact email" />
      {LEGAL.controllerAddress ? `, ${LEGAL.controllerAddress}` : null}. Upon incorporation this
      policy will be updated to name the company as controller.
    </P>
  );
}

export function PolicyNav({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {LEGAL.pages.map((p) => (
        <Link
          key={p.slug}
          href={`/legal/${p.slug}` as Route}
          aria-current={p.slug === current ? "page" : undefined}
          className={
            p.slug === current
              ? "font-medium text-neutral-900"
              : "text-neutral-500 transition hover:text-neutral-800"
          }
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
