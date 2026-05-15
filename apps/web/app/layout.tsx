import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Receptionist",
  description: "Voice AI receptionist (working name).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
