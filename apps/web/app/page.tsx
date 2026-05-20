"use client";

// Public landing page — Polish-only, editorial register.
// Audience: dental clinic owners (cold prospects on WhatsApp link).
// Strict rule: no operator references, no internal routes, no dashboard
// affordance reachable from this page. All buttons are mailto links.
//
// Visual language: paper / letterpress. Oxblood single accent, Charter
// serif headlines, system-sans body, mono for the demo block. Two
// animations carry the page: an ASCII waveform pulse in the hero and a
// typewriter Polish dialogue in the live-conversation panel. Both
// honour `prefers-reduced-motion`.

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAILTO_CONTACT = "mailto:yauheni.futryn@gmail.com";
const MAILTO_DEMO =
  "mailto:yauheni.futryn@gmail.com?subject=Recepcjonistka%20%E2%80%94%20rozmowa&body=Klinika%3A%20%0AMiasto%3A%20%0ATelefon%3A%20";

// 32-char waveform glyph palette ordered light → heavy.
const WAVE_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const WAVE_WIDTH = 32;
const WAVE_TICK_MS = 180;

// Believable evening exchange. Deliberately short, dignified, no exclamation.
const DIALOGUE: Array<{ speaker: string; line: string }> = [
  { speaker: "Klinika", line: "Dzień dobry." },
  { speaker: "Pacjent", line: "Dobry, chciałbym się umówić na konsultację." },
  { speaker: "Klinika", line: "Oczywiście. Mam wolny termin w czwartek o dziesiątej, pasuje?" },
  { speaker: "Pacjent", line: "Tak, świetnie." },
  { speaker: "Klinika", line: "Potwierdzę SMSem. Do zobaczenia w czwartek." },
];

const TYPE_MS_PER_CHAR = 30;
const PAUSE_BETWEEN_LINES_MS = 600;
const RESTART_DELAY_MS = 5000;

// ---------------------------------------------------------------------------
// Reduced motion hook — single source of truth for both animations.
// ---------------------------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------
// ASCII waveform — setInterval (180ms tick is too coarse for rAF and we get
// natural pause-on-tab-hidden via Page Visibility). Reserved height prevents
// layout shift before first tick.
// ---------------------------------------------------------------------------

function buildWaveFrame(seed: number): string {
  // Three overlapping sine components keep the line organic.
  const out: string[] = new Array(WAVE_WIDTH);
  for (let i = 0; i < WAVE_WIDTH; i++) {
    const t = (i + seed) * 0.32;
    const v =
      Math.sin(t) * 0.5 +
      Math.sin(t * 0.7 + 1.3) * 0.3 +
      Math.sin(t * 1.7 + 0.4) * 0.2;
    const normalised = (v + 1) / 2; // [0,1]
    // Fade the outer edges so the line reads as "a signal in a window."
    const edgeDistance = Math.min(i, WAVE_WIDTH - 1 - i);
    const fade = Math.min(1, edgeDistance / 4);
    const idx = Math.max(
      0,
      Math.min(WAVE_GLYPHS.length - 1, Math.round(normalised * (WAVE_GLYPHS.length - 1) * fade)),
    );
    out[i] = WAVE_GLYPHS[idx] ?? " ";
  }
  return out.join("");
}

function AsciiWaveform() {
  const reduced = usePrefersReducedMotion();
  const [frame, setFrame] = useState<string>(() => buildWaveFrame(0));

  useEffect(() => {
    if (reduced) {
      setFrame(buildWaveFrame(0));
      return;
    }
    let seed = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval !== null) return;
      interval = setInterval(() => {
        seed += 1;
        setFrame(buildWaveFrame(seed));
      }, WAVE_TICK_MS);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reduced]);

  return (
    <div
      aria-hidden="true"
      className="select-none text-center"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.95rem",
        letterSpacing: "0.05em",
        color: "var(--oxblood)",
        lineHeight: "1.2",
        height: "1.2em",
        opacity: 0.85,
      }}
    >
      {frame}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typewriter dialogue — requestAnimationFrame driven from a single elapsed
// counter. Pure function of `elapsedMs` so the loop is deterministic and we
// can short-circuit it on `prefers-reduced-motion`.
// ---------------------------------------------------------------------------

interface RenderedLine {
  speaker: string;
  text: string;
  done: boolean;
}

function renderDialogue(elapsedMs: number): RenderedLine[] {
  // Build a schedule of [start, end] timestamps per line and use the running
  // `elapsedMs` to slice characters out. After the last line, idle for
  // RESTART_DELAY_MS then the caller resets `elapsedMs` to 0.
  let cursor = 0;
  const result: RenderedLine[] = [];
  for (const { speaker, line } of DIALOGUE) {
    const typeMs = line.length * TYPE_MS_PER_CHAR;
    const start = cursor;
    const end = cursor + typeMs;
    if (elapsedMs <= start) {
      result.push({ speaker, text: "", done: false });
    } else if (elapsedMs >= end) {
      result.push({ speaker, text: line, done: true });
    } else {
      const frac = (elapsedMs - start) / typeMs;
      const chars = Math.max(0, Math.floor(line.length * frac));
      result.push({ speaker, text: line.slice(0, chars), done: false });
    }
    cursor = end + PAUSE_BETWEEN_LINES_MS;
  }
  return result;
}

function totalDialogueMs(): number {
  let total = 0;
  for (const { line } of DIALOGUE) {
    total += line.length * TYPE_MS_PER_CHAR + PAUSE_BETWEEN_LINES_MS;
  }
  return total;
}

function TypewriterDialogue() {
  const reduced = usePrefersReducedMotion();
  const [lines, setLines] = useState<RenderedLine[]>(() =>
    DIALOGUE.map((d) => ({ speaker: d.speaker, text: "", done: false })),
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setLines(DIALOGUE.map((d) => ({ speaker: d.speaker, text: d.line, done: true })));
      return;
    }
    const fullCycleMs = totalDialogueMs() + RESTART_DELAY_MS;
    let startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - startedAt) % fullCycleMs;
      setLines(renderDialogue(elapsed));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Pause on tab hidden to avoid burning battery + keep timing honest on resume.
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (rafRef.current === null) {
        startedAt = performance.now();
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reduced]);

  return (
    <div
      aria-hidden="true"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.875rem",
        lineHeight: "1.7",
        color: "var(--ink)",
        // Reserve enough height for all 5 lines so the section never reflows.
        minHeight: `calc(${DIALOGUE.length} * 1.7em)`,
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ whiteSpace: "pre-wrap" }}>
          <span style={{ color: "var(--oxblood)" }}>{l.speaker}.</span>
          <span style={{ color: "var(--ink-soft)" }}>{"  "}</span>
          <span>{l.text}</span>
          {!l.done && l.text.length > 0 && (
            <span style={{ color: "var(--oxblood)", opacity: 0.7 }}>{"█"}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <div className="recepcjonistka-root">
      <style jsx global>{`
        .recepcjonistka-root {
          /* Page-scoped override: this paper background only applies to /. */
          background: var(--paper);
          color: var(--ink);
          font-family: var(--font-sans);
          min-height: 100vh;
          font-size: 16px;
          line-height: 1.55;
        }
        .recepcjonistka-root ::selection {
          background: var(--oxblood);
          color: var(--oxblood-cream);
        }
        .rcp-serif {
          font-family: var(--font-serif);
          font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
        }
        .rcp-mono {
          font-family: var(--font-mono);
        }
        .rcp-hairline {
          border-color: var(--hairline);
        }
        .rcp-link {
          color: var(--ink);
          text-decoration: none;
          border-bottom: 1px solid var(--hairline);
          transition: color 200ms cubic-bezier(0.16, 1, 0.3, 1),
            border-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
            border-bottom-width 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .rcp-link:hover {
          color: var(--oxblood);
          border-color: var(--oxblood);
        }
        .rcp-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--oxblood);
          color: var(--oxblood-cream);
          padding: 14px 28px;
          border-radius: 999px;
          font-size: 0.95rem;
          font-weight: 500;
          text-decoration: none;
          transition: background 200ms cubic-bezier(0.16, 1, 0.3, 1),
            color 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .rcp-cta:hover {
          background: var(--oxblood-deep);
        }
        .rcp-cta:focus-visible {
          outline: 2px solid var(--oxblood-deep);
          outline-offset: 3px;
        }
      `}</style>

      {/* HEADER — wordmark left, single Kontakt link right. No operator entry point. */}
      <header
        className="rcp-hairline"
        style={{
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
          background: "var(--paper)",
        }}
      >
        <div
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            padding: "20px 24px",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <span
            className="rcp-serif"
            style={{
              fontStyle: "italic",
              fontSize: "1.125rem",
              color: "var(--ink)",
              letterSpacing: "-0.005em",
            }}
          >
            Recepcjonistka.
          </span>
          <a href={MAILTO_CONTACT} className="rcp-link" style={{ fontSize: "0.875rem" }}>
            Kontakt
          </a>
        </div>
      </header>

      {/* HERO */}
      <section
        style={{
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "96px 24px 48px",
        }}
      >
        <AsciiWaveform />
        <h1
          className="rcp-serif"
          style={{
            fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)",
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            marginTop: "40px",
            marginBottom: "32px",
            color: "var(--ink)",
            fontStyle: "italic",
          }}
        >
          Telefon dzwoni. Ktoś odbiera.
        </h1>
        <p
          style={{
            fontSize: "1.0625rem",
            lineHeight: 1.65,
            color: "var(--ink-soft)",
            maxWidth: "60ch",
          }}
        >
          Twoja recepcjonistka, która nie chodzi na lunch, nie idzie spać i nie pomyli nazwiska
          pacjenta. Odpowiada po polsku, umawia wizyty, potwierdza SMSem. Działa w klinice
          stomatologicznej, którą prowadzisz.
        </p>
      </section>

      {/* LIVE CONVERSATION PANEL */}
      <section
        style={{
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "32px 24px 96px",
        }}
      >
        <div
          className="rcp-hairline"
          style={{
            background: "var(--paper-deep)",
            border: "1px solid",
            borderRadius: "2px",
            padding: "28px 32px",
          }}
        >
          <div
            className="rcp-mono"
            style={{
              fontSize: "0.6875rem",
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "var(--ink-faint)",
              marginBottom: "20px",
            }}
          >
            Przykładowa rozmowa &middot; 19:23 &middot; wieczorem
          </div>
          <TypewriterDialogue />
        </div>
      </section>

      {/* WHY THIS EXISTS — italic serif observations, hairlines between, no cards */}
      <section
        style={{
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "0 24px 96px",
        }}
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {[
            "Telefon dzwoni, gdy jesteś u pacjenta.",
            "Wieczorem nikt nie odbiera. Pacjent dzwoni do innej kliniki.",
            "Recepcja spędza godziny dziennie na potwierdzaniu wizyt.",
          ].map((line, i, arr) => (
            <li
              key={line}
              className={i < arr.length - 1 ? "rcp-hairline" : ""}
              style={{
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                borderBottomStyle: "solid",
                padding: "28px 0",
              }}
            >
              <p
                className="rcp-serif"
                style={{
                  fontStyle: "italic",
                  fontSize: "1.25rem",
                  lineHeight: 1.5,
                  color: "var(--ink)",
                  margin: 0,
                }}
              >
                {line}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* WHAT IT DOES — 01/02/03 editorial */}
      <section
        style={{
          maxWidth: "56rem",
          margin: "0 auto",
          padding: "0 24px 96px",
        }}
      >
        <div
          className="rcp-mono"
          style={{
            fontSize: "0.6875rem",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--ink-faint)",
            marginBottom: "40px",
          }}
        >
          Co robi
        </div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {[
            "Odbiera każdy telefon, w dzień i w nocy.",
            "Umawia wizyty bezpośrednio w Twoim kalendarzu.",
            "Potwierdza SMSem. Przypomina dzień wcześniej.",
          ].map((line, i) => (
            <li
              key={line}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(80px, 1fr) minmax(0, 4fr)",
                gap: "24px",
                alignItems: "baseline",
                padding: "20px 0",
              }}
            >
              <span
                className="rcp-serif"
                style={{
                  fontSize: "2.25rem",
                  fontWeight: 500,
                  color: "var(--oxblood)",
                  fontVariantNumeric: "lining-nums",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  fontSize: "1.0625rem",
                  lineHeight: 1.55,
                  color: "var(--ink)",
                  maxWidth: "60ch",
                }}
              >
                {line}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section
        style={{
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "32px 24px 96px",
          textAlign: "center",
        }}
      >
        <p
          className="rcp-serif"
          style={{
            fontStyle: "italic",
            fontSize: "1.5rem",
            lineHeight: 1.4,
            color: "var(--ink)",
            margin: "0 0 32px",
          }}
        >
          Chcesz zobaczyć, jak to brzmi w Twojej klinice?
        </p>
        <a href={MAILTO_DEMO} className="rcp-cta">
          Umów rozmowę <span aria-hidden="true">→</span>
        </a>
      </section>

      {/* FOOTER */}
      <footer
        className="rcp-hairline"
        style={{
          borderTopWidth: 1,
          borderTopStyle: "solid",
          marginTop: "48px",
        }}
      >
        <div
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            padding: "24px",
            fontSize: "0.75rem",
            color: "var(--ink-faint)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <span>Dane przechowywane w UE. Nie nagrywamy rozmów.</span>
          <span>&copy; {new Date().getFullYear()} Recepcjonistka</span>
        </div>
      </footer>
    </div>
  );
}
