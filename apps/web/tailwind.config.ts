import type { Config } from "tailwindcss";

// Wire CSS variables set by next/font/google in app/layout.tsx into Tailwind's
// font-family utilities. System stacks remain as fallback so:
//   1. SSR + initial paint never look broken if the font file is in flight.
//   2. Operator routes that predate this brand work still render with Geist
//      (via the variable) and degrade gracefully to ui-sans-serif if the var
//      is somehow missing.
//   3. font-serif is opt-in — only the landing applies it; operator pages
//      never use it, so they never accidentally render in Instrument Serif.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
        serif: [
          "var(--font-display)",
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
