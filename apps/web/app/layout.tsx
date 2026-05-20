import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recepcjonistka",
  description:
    "Polskojęzyczna recepcja telefoniczna dla klinik stomatologicznych. Odbiera telefony, umawia wizyty, potwierdza SMSem.",
};

// Root layout is intentionally chrome-less. Each page renders its own header
// so the public landing can be self-contained and the operator console pages
// can ship their own internal navigation. Keeping the chrome out of here
// prevents public visitors from seeing operator-only links on /.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
