import type { Metadata } from "next";
import { Instrument_Serif, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Three-font Technical Cinema stack:
//   --font-display → Instrument Serif (display headlines, italic quotes)
//   --font-sans    → Geist (body, UI chrome)
//   --font-mono    → Geist Mono (technical labels, timestamps, tabular nums)
//
// `next/font/google` self-hosts the woff2 files at build time; no runtime
// requests to fonts.gstatic.com, no CLS, EU-data-residency-friendly.
//
// Operator routes (/dashboard, /provision, /test, /owner, /demo, /auth) keep
// using Tailwind's `font-sans` / `font-mono` utilities — those map to the
// same CSS variables via tailwind.config.ts, with system stacks as fallback.
// This means operator pages also pick up Geist Sans, which is intentional:
// it's a refined, neutral system-adjacent sans, so the operator UI stays
// readable while gaining a touch of polish. No serif headlines anywhere
// outside the landing.
// Instrument Serif does not ship a Cyrillic subset on Google Fonts; we load
// latin + latin-ext only, and the CSS font-family fallback chain falls
// through to ui-serif / Georgia for Russian glyphs. That's acceptable because
// the only Cyrillic serif copy is the italic quote in IllustrationBlock —
// Georgia italic carries the same editorial weight.
const serif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

const sans = Geist({
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
  variable: "--font-sans",
});

const mono = Geist_Mono({
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Odbiera",
  description:
    "Polskojęzyczna recepcja telefoniczna dla klinik stomatologicznych. Odbiera telefony, umawia wizyty, potwierdza SMSem.",
};

// Root layout is intentionally chrome-less. Each page renders its own header
// so the public landing can be self-contained and operator console pages
// can ship their own internal navigation.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body
        className={`${serif.variable} ${sans.variable} ${mono.variable} min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
