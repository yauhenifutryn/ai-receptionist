import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import type { Route } from "next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Receptionist — Polish voice AI demo",
  description:
    "End-to-end voice receptionist for Polish-speaking businesses. Paste a knowledge document, get a working voice agent in seconds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={inter.variable}>
      <body className="min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased">
        <header className="border-b border-neutral-200/80 bg-white/70 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold tracking-tight"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              AI Receptionist
            </Link>
            <div className="flex items-center gap-6 text-sm text-neutral-600">
              <Link
                href={"/dashboard" as Route}
                className="transition hover:text-neutral-900"
              >
                Dashboard
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">{children}</main>
      </body>
    </html>
  );
}
