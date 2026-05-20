import Link from "next/link";
import type { Route } from "next";
import type { DemoLocale } from "@/lib/demo-i18n";
import { DEMO_LOCALES } from "@/lib/demo-i18n";

const LABELS: Record<DemoLocale, string> = {
  pl: "PL",
  en: "EN",
  ru: "RU",
};

interface Props {
  current: DemoLocale;
  agentId: string;
  pin: string;
}

export default function LanguageSwitcher({ current, agentId, pin }: Props) {
  return (
    <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
      {DEMO_LOCALES.map((loc) => {
        const active = loc === current;
        const href = `/demo/${agentId}?pin=${pin}&lang=${loc}` as Route;
        return (
          <Link
            key={loc}
            href={href}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {LABELS[loc]}
          </Link>
        );
      })}
    </div>
  );
}
