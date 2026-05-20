"use client";

// Public landing page v2 — PL / EN / RU.
// Editorial / letterpress visual register, layered with halftone density.
// Audience: dental clinic owners (cold prospects) plus returning operators
// who need an unobtrusive sign-in link in the header.
//
// Six animated layers, all reduced-motion-aware:
//   1. Two-line halftone waveform (rAF, ~24fps).
//   2. Typewriter Polish/English/Russian dialogue (rAF, deterministic).
//   3. Fake live system status panel (interval, jittered).
//   4. Calendar fill simulation (interval, oxblood-dim cells appear).
//   5. Subtle dot-grid background pattern (static, 1% opacity).
//   6. Oxblood band quote between status block and dialogue (static).

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Language layer
// ---------------------------------------------------------------------------

type Lang = "pl" | "en" | "ru";
const LANG_KEY = "recepcjonistka:lang";
const LANGS: Lang[] = ["pl", "en", "ru"];

interface DialogueLine {
  speaker: string;
  line: string;
}

interface LangBundle {
  htmlLang: string;
  wordmark: string;
  nav: { client: string; operator: string };
  hero: {
    title: string;
    body: string;
  };
  band: string;
  statusPanel: {
    title: string;
    active: string;
    response: string;
    bookings: string;
    languageRow: string;
    busy: string;
  };
  calendar: {
    label: string;
    counter: (n: number) => string;
  };
  dialoguePanel: {
    eyebrow: string;
  };
  dialogue: DialogueLine[];
  observations: string[];
  whatItDoes: {
    eyebrow: string;
    items: string[];
  };
  cta: {
    headline: string;
    button: string;
  };
  footer: {
    privacy: string;
    copyright: string;
  };
}

const STRINGS: Record<Lang, LangBundle> = {
  pl: {
    htmlLang: "pl",
    wordmark: "Recepcjonistka.",
    nav: { client: "Klient", operator: "Operator" },
    hero: {
      title: "Telefon dzwoni. Ktoś odbiera.",
      body: "Twoja recepcjonistka, która nie chodzi na lunch, nie idzie spać i nie pomyli nazwiska pacjenta. Odpowiada po polsku, umawia wizyty, potwierdza SMSem. Działa w klinice stomatologicznej, którą prowadzisz.",
    },
    band: "Klinika zamknięta. Telefon nadal odbiera.",
    statusPanel: {
      title: "System · operacyjny",
      active: "Rozmowy w toku",
      response: "Czas odpowiedzi",
      bookings: "Dzisiaj rezerwacji",
      languageRow: "Język aktywny",
      busy: "zajęte",
    },
    calendar: {
      label: "Kalendarz · ten miesiąc",
      counter: (n) => `${n} wizyt zarezerwowanych dzisiaj`,
    },
    dialoguePanel: { eyebrow: "Przykładowa rozmowa · 19:23 · wieczorem" },
    dialogue: [
      { speaker: "Klinika", line: "Dzień dobry." },
      { speaker: "Pacjent", line: "Dobry, chciałbym się umówić na konsultację." },
      { speaker: "Klinika", line: "Oczywiście. Mam wolny termin w czwartek o dziesiątej, pasuje?" },
      { speaker: "Pacjent", line: "Tak, świetnie." },
      { speaker: "Klinika", line: "Potwierdzę SMSem. Do zobaczenia w czwartek." },
    ],
    observations: [
      "Telefon dzwoni, gdy jesteś u pacjenta.",
      "Wieczorem nikt nie odbiera. Pacjent dzwoni do innej kliniki.",
      "Recepcja spędza godziny dziennie na potwierdzaniu wizyt.",
    ],
    whatItDoes: {
      eyebrow: "Co robi",
      items: [
        "Odbiera każdy telefon, w dzień i w nocy.",
        "Rozmawia po polsku, angielsku, rosyjsku.",
        "Umawia wizyty bezpośrednio w Twoim kalendarzu.",
        "Wysyła SMS z potwierdzeniem.",
        "Przypomina pacjentowi dzień wcześniej.",
        "Nie zapomina, nie myli, nie idzie spać.",
      ],
    },
    cta: {
      headline: "Chcesz zobaczyć, jak to brzmi w Twojej klinice?",
      button: "Umów rozmowę",
    },
    footer: {
      privacy: "Dane przechowywane w UE. Nie nagrywamy rozmów.",
      copyright: "Recepcjonistka",
    },
  },
  en: {
    htmlLang: "en",
    wordmark: "Recepcjonistka.",
    nav: { client: "Client", operator: "Operator" },
    hero: {
      title: "The phone rings. Someone answers.",
      body: "Your receptionist who never takes lunch, never goes to sleep, and never misspells a patient's name. Speaks Polish, books appointments, confirms by SMS. Works inside the dental practice you already run.",
    },
    band: "The clinic is closed. The phone still answers.",
    statusPanel: {
      title: "System · operational",
      active: "Calls in flight",
      response: "Response time",
      bookings: "Bookings today",
      languageRow: "Active language",
      busy: "busy",
    },
    calendar: {
      label: "Calendar · this month",
      counter: (n) => `${n} appointments booked today`,
    },
    dialoguePanel: { eyebrow: "Sample call · 19:23 · evening" },
    dialogue: [
      { speaker: "Clinic", line: "Good evening." },
      { speaker: "Patient", line: "Hi, I'd like to book a consultation." },
      { speaker: "Clinic", line: "Of course. I have Thursday at ten free, does that work?" },
      { speaker: "Patient", line: "Yes, perfect." },
      { speaker: "Clinic", line: "I'll confirm by SMS. See you Thursday." },
    ],
    observations: [
      "The phone rings while you are with a patient.",
      "Nobody answers in the evening. The patient calls another clinic.",
      "Reception spends hours every day confirming appointments.",
    ],
    whatItDoes: {
      eyebrow: "What it does",
      items: [
        "Answers every call, day and night.",
        "Speaks Polish, English, and Russian.",
        "Books appointments straight into your calendar.",
        "Sends an SMS confirmation.",
        "Reminds the patient the day before.",
        "Does not forget, does not confuse, does not sleep.",
      ],
    },
    cta: {
      headline: "Want to hear how it sounds inside your clinic?",
      button: "Book a call",
    },
    footer: {
      privacy: "Data stored in the EU. We do not record calls.",
      copyright: "Recepcjonistka",
    },
  },
  ru: {
    htmlLang: "ru",
    wordmark: "Recepcjonistka.",
    nav: { client: "Клиент", operator: "Оператор" },
    hero: {
      title: "Телефон звонит. Кто-то отвечает.",
      body: "Ваш администратор, который не уходит на обед, не ложится спать и не путает фамилию пациента. Говорит по-польски, записывает на приём, подтверждает SMS. Работает в стоматологической клинике, которой вы управляете.",
    },
    band: "Клиника закрыта. Телефон по-прежнему отвечает.",
    statusPanel: {
      title: "Система · в работе",
      active: "Активные звонки",
      response: "Время отклика",
      bookings: "Записей сегодня",
      languageRow: "Активный язык",
      busy: "занято",
    },
    calendar: {
      label: "Календарь · этот месяц",
      counter: (n) => `${n} записей сегодня`,
    },
    dialoguePanel: { eyebrow: "Пример разговора · 19:23 · вечер" },
    dialogue: [
      { speaker: "Клиника", line: "Добрый вечер." },
      { speaker: "Пациент", line: "Здравствуйте, хочу записаться на консультацию." },
      { speaker: "Клиника", line: "Конечно. Четверг в десять свободен, подходит?" },
      { speaker: "Пациент", line: "Да, отлично." },
      { speaker: "Клиника", line: "Подтвержу SMS. До встречи в четверг." },
    ],
    observations: [
      "Телефон звонит, когда вы у пациента.",
      "Вечером никто не отвечает. Пациент звонит в другую клинику.",
      "Регистратура тратит часы в день на подтверждение записей.",
    ],
    whatItDoes: {
      eyebrow: "Что делает",
      items: [
        "Отвечает на каждый звонок, днём и ночью.",
        "Говорит по-польски, по-английски, по-русски.",
        "Записывает на приём прямо в ваш календарь.",
        "Отправляет SMS с подтверждением.",
        "Напоминает пациенту за день до визита.",
        "Не забывает, не путает, не спит.",
      ],
    },
    cta: {
      headline: "Хотите услышать, как это звучит в вашей клинике?",
      button: "Заказать звонок",
    },
    footer: {
      privacy: "Данные хранятся в ЕС. Звонки не записываются.",
      copyright: "Recepcjonistka",
    },
  },
};

// ---------------------------------------------------------------------------
// LangContext + hook + provider
// ---------------------------------------------------------------------------

interface LangCtxValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: LangBundle;
}

const LangCtx = createContext<LangCtxValue | null>(null);

function useLang(): LangCtxValue {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}

function LangProvider({ children }: { children: React.ReactNode }) {
  // SSR-safe: always start as "pl" on first render; restore from
  // localStorage in an effect to avoid hydration mismatch.
  const [lang, setLangState] = useState<Lang>("pl");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === "pl" || stored === "en" || stored === "ru") {
        setLangState(stored);
      }
    } catch {
      // localStorage may be unavailable (private mode, SSR); ignore.
    }
  }, []);

  // Reflect the active language on <html lang="…"> for screen readers.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = STRINGS[lang].htmlLang;
    }
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      // ignore
    }
  };

  const value = useMemo<LangCtxValue>(() => ({ lang, setLang, t: STRINGS[lang] }), [lang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

// ---------------------------------------------------------------------------
// Reduced motion hook
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
// Halftone waveform
// ---------------------------------------------------------------------------

const HALFTONE_GLYPHS = [" ", ".", ",", ":", ";", "o", "O", "0", "#", "@"];
const HALFTONE_WIDTH = 68;
const HALFTONE_FPS = 24;
const HALFTONE_FRAME_MS = 1000 / HALFTONE_FPS;

interface FlashPeak {
  col: number;
  birth: number; // ms timestamp
}

function densityChar(v: number): string {
  // v expected in [0,1]; clamp + bucket.
  const clamped = Math.max(0, Math.min(1, v));
  const idx = Math.min(HALFTONE_GLYPHS.length - 1, Math.floor(clamped * HALFTONE_GLYPHS.length));
  return HALFTONE_GLYPHS[idx]!;
}

function buildHalftoneLine(t: number, phase: number, freq: number, peaks: FlashPeak[]): string {
  const out: string[] = new Array(HALFTONE_WIDTH);
  for (let i = 0; i < HALFTONE_WIDTH; i++) {
    const x = (i / HALFTONE_WIDTH) * Math.PI * 2;
    const v =
      Math.sin(x * freq + t * 0.0018 + phase) * 0.5 +
      Math.sin(x * (freq * 1.7) + t * 0.0011 + phase * 0.6) * 0.3 +
      Math.sin(x * (freq * 2.3) - t * 0.0007 + phase) * 0.2;
    // Map [-1,1] → [0,1]
    let density = (v + 1) / 2;
    // Edge fade so the signal reads as bracketed.
    const edge = Math.min(i, HALFTONE_WIDTH - 1 - i);
    const fade = Math.min(1, edge / 6);
    density *= fade;

    // Apply flash peaks: each flash spikes a column for ~280ms then decays.
    for (const p of peaks) {
      if (p.col === i) {
        const age = t - p.birth;
        if (age >= 0 && age < 280) {
          const boost = 1 - age / 280;
          density = Math.min(1, density + boost * 0.9);
        }
      }
    }
    out[i] = densityChar(density);
  }
  return out.join("");
}

function HalftoneWaveform() {
  const reduced = usePrefersReducedMotion();
  const [frames, setFrames] = useState<{ a: string; b: string }>(() => ({
    a: buildHalftoneLine(0, 0, 3.1, []),
    b: buildHalftoneLine(0, Math.PI / 3, 2.4, []),
  }));
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const lastDrawRef = useRef<number>(0);
  const peaksRef = useRef<FlashPeak[]>([]);
  const lastPeakAtRef = useRef<number>(0);

  useEffect(() => {
    if (reduced) {
      setFrames({
        a: buildHalftoneLine(0, 0, 3.1, []),
        b: buildHalftoneLine(0, Math.PI / 3, 2.4, []),
      });
      return;
    }

    startRef.current = performance.now();
    lastDrawRef.current = 0;

    const tick = (now: number) => {
      const t = now - startRef.current;
      // Throttle to 24fps to keep the halftone reading "video terminal", not silky.
      if (t - lastDrawRef.current >= HALFTONE_FRAME_MS) {
        lastDrawRef.current = t;

        // Maintain 3-5 active peaks. Drop expired ones, spawn new ones.
        peaksRef.current = peaksRef.current.filter((p) => t - p.birth < 280);
        if (t - lastPeakAtRef.current > 90 + Math.random() * 180) {
          const targetCount = 3 + Math.floor(Math.random() * 3);
          while (peaksRef.current.length < targetCount) {
            peaksRef.current.push({
              col: Math.floor(Math.random() * HALFTONE_WIDTH),
              birth: t,
            });
          }
          lastPeakAtRef.current = t;
        }

        setFrames({
          a: buildHalftoneLine(t, 0, 3.1, peaksRef.current),
          b: buildHalftoneLine(t, Math.PI / 3, 2.4, peaksRef.current),
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (rafRef.current === null) {
        startRef.current = performance.now() - lastDrawRef.current;
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
      className="select-none"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.85rem",
        letterSpacing: "0.04em",
        color: "var(--oxblood)",
        lineHeight: "1.15",
        // Reserve 2 lines (waveform A + B) so layout never shifts.
        height: "2.3em",
        opacity: 0.88,
        textAlign: "center",
        whiteSpace: "pre",
      }}
    >
      {frames.a}
      {"\n"}
      {frames.b}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typewriter dialogue — operates on whatever DIALOGUE matches the active lang.
// ---------------------------------------------------------------------------

const TYPE_MS_PER_CHAR = 30;
const PAUSE_BETWEEN_LINES_MS = 600;
const RESTART_DELAY_MS = 5000;

interface RenderedLine {
  speaker: string;
  text: string;
  done: boolean;
}

function renderDialogue(elapsedMs: number, dialogue: DialogueLine[]): RenderedLine[] {
  let cursor = 0;
  const result: RenderedLine[] = [];
  for (const { speaker, line } of dialogue) {
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

function totalDialogueMs(dialogue: DialogueLine[]): number {
  let total = 0;
  for (const { line } of dialogue) {
    total += line.length * TYPE_MS_PER_CHAR + PAUSE_BETWEEN_LINES_MS;
  }
  return total;
}

function TypewriterDialogue() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const dialogue = t.dialogue;
  const [lines, setLines] = useState<RenderedLine[]>(() =>
    dialogue.map((d) => ({ speaker: d.speaker, text: "", done: false })),
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset the rendered transcript whenever the language flips.
    setLines(dialogue.map((d) => ({ speaker: d.speaker, text: "", done: false })));

    if (reduced) {
      setLines(dialogue.map((d) => ({ speaker: d.speaker, text: d.line, done: true })));
      return;
    }
    const fullCycleMs = totalDialogueMs(dialogue) + RESTART_DELAY_MS;
    let startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - startedAt) % fullCycleMs;
      setLines(renderDialogue(elapsed, dialogue));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

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
  }, [reduced, dialogue]);

  return (
    <div
      aria-hidden="true"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.875rem",
        lineHeight: "1.7",
        color: "var(--ink)",
        minHeight: `calc(${dialogue.length} * 1.7em)`,
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
// Fake live system status panel
// ---------------------------------------------------------------------------

const BAR_WIDTH = 7;
const BAR_FULL = "▰";
const BAR_EMPTY = "▱";

function makeBar(value: number, max: number): string {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((value / max) * BAR_WIDTH)));
  return BAR_FULL.repeat(filled) + BAR_EMPTY.repeat(BAR_WIDTH - filled);
}

function makeResponseBar(ms: number): string {
  // Render 380-820ms as a 3-cell shaded bar — heaviest cell = slowest response.
  const ratio = Math.max(0, Math.min(1, (ms - 380) / (820 - 380)));
  if (ratio < 0.33) return "░░░";
  if (ratio < 0.66) return "▒▒▒";
  return "▓▓▓";
}

function weightedActiveCalls(): number {
  // 1-6 weighted toward 3.
  const r = Math.random();
  if (r < 0.08) return 1;
  if (r < 0.22) return 2;
  if (r < 0.55) return 3;
  if (r < 0.78) return 4;
  if (r < 0.93) return 5;
  return 6;
}

function LiveStatusPanel() {
  const { t, lang } = useLang();
  const reduced = usePrefersReducedMotion();

  // SSR-safe deterministic initial values (no Math.random on first render).
  const [active, setActive] = useState(3);
  const [responseMs, setResponseMs] = useState(580);
  const [bookings, setBookings] = useState(12);
  const [langPulse, setLangPulse] = useState<Lang>("pl");

  useEffect(() => {
    if (reduced) {
      // Static composed frame.
      setActive(3);
      setResponseMs(612);
      setBookings(12);
      setLangPulse(lang);
      return;
    }

    // Drift response time on a smooth oscillator plus jitter.
    let responseTimer: ReturnType<typeof setInterval> | null = null;
    let activeTimer: ReturnType<typeof setInterval> | null = null;
    let bookingsTimer: ReturnType<typeof setTimeout> | null = null;
    let langTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const startResponse = () => {
      let phase = 0;
      responseTimer = setInterval(() => {
        phase += 0.4;
        const base = 600 + Math.sin(phase) * 160; // 440-760
        const jitter = (Math.random() - 0.5) * 80;
        const next = Math.round(Math.max(380, Math.min(820, base + jitter)));
        setResponseMs(next);
      }, 1400);
    };

    const startActive = () => {
      activeTimer = setInterval(() => {
        setActive(weightedActiveCalls());
      }, 2400);
    };

    const scheduleBookings = () => {
      const delay = 8000 + Math.random() * 7000;
      bookingsTimer = setTimeout(() => {
        if (stopped) return;
        setBookings((b) => b + 1);
        scheduleBookings();
      }, delay);
    };

    const startLangPulse = () => {
      let i = 0;
      langTimer = setInterval(() => {
        i = (i + 1) % LANGS.length;
        setLangPulse(LANGS[i]!);
      }, 2200);
    };

    const startAll = () => {
      startResponse();
      startActive();
      scheduleBookings();
      startLangPulse();
    };
    const stopAll = () => {
      if (responseTimer) clearInterval(responseTimer);
      if (activeTimer) clearInterval(activeTimer);
      if (bookingsTimer) clearTimeout(bookingsTimer);
      if (langTimer) clearInterval(langTimer);
      responseTimer = activeTimer = bookingsTimer = langTimer = null;
    };

    startAll();

    const onVis = () => {
      if (document.hidden) stopAll();
      else if (!responseTimer) startAll();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      stopAll();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced, lang]);

  const busy = active > 4;
  const busyLabel = busy ? ` · ${t.statusPanel.busy}` : "";

  return (
    <div
      className="rcp-hairline"
      style={{
        background: "var(--paper-cream)",
        border: "1px solid",
        borderRadius: "2px",
        padding: "20px 22px",
        fontFamily: "var(--font-mono)",
        fontSize: "0.8125rem",
        lineHeight: 1.7,
        color: "var(--ink)",
        // Reserve height so the panel cannot reflow as values change.
        minHeight: "204px",
      }}
      aria-label={t.statusPanel.title}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          fontSize: "0.6875rem",
          color: "var(--ink-faint)",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--hairline-softest)",
          marginBottom: "14px",
        }}
      >
        <span>{t.statusPanel.title}</span>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span
            className="rcp-pulse"
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "999px",
              background: "var(--oxblood-pulse)",
              display: "inline-block",
            }}
          />
          <span style={{ color: "var(--oxblood)" }}>LIVE</span>
        </span>
      </div>

      <StatusRow
        label={t.statusPanel.active}
        valueDisplay={
          <>
            <span style={{ color: busy ? "var(--oxblood)" : "var(--ink-soft)" }}>
              {makeBar(active, 6)}
            </span>
            <span style={{ marginLeft: "10px", color: busy ? "var(--oxblood)" : "var(--ink)" }}>
              {active}
              {busyLabel}
            </span>
          </>
        }
      />
      <StatusRow
        label={t.statusPanel.response}
        valueDisplay={
          <>
            <span style={{ color: "var(--ink-soft)" }}>{makeResponseBar(responseMs)}</span>
            <span style={{ marginLeft: "10px" }}>{responseMs} ms</span>
          </>
        }
      />
      <StatusRow
        label={t.statusPanel.bookings}
        valueDisplay={<span style={{ color: "var(--oxblood)" }}>+{bookings}</span>}
      />
      <StatusRow
        label={t.statusPanel.languageRow}
        valueDisplay={
          <span aria-hidden="true">
            {LANGS.map((l, i) => (
              <span key={l}>
                <span
                  style={{
                    color: l === langPulse ? "var(--oxblood)" : "var(--ink-faint)",
                    fontWeight: l === langPulse ? 600 : 400,
                  }}
                >
                  {l.toUpperCase()}
                </span>
                {i < LANGS.length - 1 && <span style={{ color: "var(--ink-faint)" }}> · </span>}
              </span>
            ))}
          </span>
        }
      />
    </div>
  );
}

function StatusRow({ label, valueDisplay }: { label: string; valueDisplay: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: "16px",
        alignItems: "baseline",
        padding: "4px 0",
      }}
    >
      <span style={{ color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ whiteSpace: "nowrap" }}>{valueDisplay}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar fills
// ---------------------------------------------------------------------------

const CAL_CELLS = 35;
const CAL_FILL_THRESHOLD = 0.7;

function CalendarFills() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();

  // 0 = empty, 1 = filled. Start with a deterministic distribution so
  // SSR + first client render agree.
  const initialPattern: number[] = useMemo(() => {
    // Seed: every 4th cell filled, biased toward the first 3 weeks (typical month-to-date).
    const arr = new Array(CAL_CELLS).fill(0);
    for (let i = 0; i < CAL_CELLS; i++) {
      if (i % 4 === 0 && i < 24) arr[i] = 1;
    }
    return arr;
  }, []);

  const [cells, setCells] = useState<number[]>(initialPattern);
  const [counter, setCounter] = useState(12);

  useEffect(() => {
    if (reduced) {
      // ~50% filled static frame.
      const half = new Array(CAL_CELLS).fill(0);
      for (let i = 0; i < CAL_CELLS; i++) if (i % 2 === 0) half[i] = 1;
      setCells(half);
      setCounter(12);
      return;
    }

    let fillTimer: ReturnType<typeof setTimeout> | null = null;
    let counterTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const scheduleFill = () => {
      const delay = 600 + Math.random() * 900;
      fillTimer = setTimeout(() => {
        if (stopped) return;
        setCells((prev) => {
          const filled = prev.filter((c) => c === 1).length;
          if (filled / CAL_CELLS >= CAL_FILL_THRESHOLD) {
            // Reset to the seed sparse pattern.
            return initialPattern.slice();
          }
          // Pick a random empty cell.
          const empties: number[] = [];
          for (let i = 0; i < prev.length; i++) if (prev[i] === 0) empties.push(i);
          if (empties.length === 0) return initialPattern.slice();
          const pick = empties[Math.floor(Math.random() * empties.length)]!;
          const next = prev.slice();
          next[pick] = 1;
          return next;
        });
        scheduleFill();
      }, delay);
    };

    counterTimer = setInterval(() => {
      setCounter((c) => c + 1);
    }, 11000);

    scheduleFill();

    const onVis = () => {
      if (document.hidden) {
        if (fillTimer) clearTimeout(fillTimer);
        if (counterTimer) clearInterval(counterTimer);
        fillTimer = null;
        counterTimer = null;
      } else {
        if (!fillTimer) scheduleFill();
        if (!counterTimer) {
          counterTimer = setInterval(() => {
            setCounter((c) => c + 1);
          }, 11000);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      if (fillTimer) clearTimeout(fillTimer);
      if (counterTimer) clearInterval(counterTimer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced, initialPattern]);

  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.75rem",
        color: "var(--ink)",
        // Reserve fixed height matching status panel.
        minHeight: "204px",
        display: "flex",
        flexDirection: "column",
      }}
      aria-label={t.calendar.label}
    >
      <div
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          fontSize: "0.6875rem",
          color: "var(--ink-faint)",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--hairline-softest)",
          marginBottom: "14px",
        }}
      >
        {t.calendar.label}
      </div>
      <div
        aria-hidden="true"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "4px",
          maxWidth: "220px",
        }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "1 / 1",
              background: c === 1 ? "var(--oxblood-dim)" : "var(--paper-deep)",
              border: "1px solid var(--hairline-softest)",
              borderRadius: "1px",
              transition: "background 320ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          marginTop: "14px",
          fontSize: "0.75rem",
          color: "var(--ink-soft)",
        }}
      >
        {t.calendar.counter(counter)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language switcher button
// ---------------------------------------------------------------------------

function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <span
      role="group"
      aria-label="Language"
      className="rcp-mono"
      style={{
        fontSize: "0.75rem",
        letterSpacing: "0.12em",
        color: "var(--ink-faint)",
      }}
    >
      {LANGS.map((l, i) => (
        <span key={l}>
          <button
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className="rcp-lang-btn"
            style={{
              fontFamily: "inherit",
              fontSize: "inherit",
              letterSpacing: "inherit",
              padding: "2px 4px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: lang === l ? "var(--oxblood)" : "var(--ink-faint)",
              fontWeight: lang === l ? 700 : 400,
              textTransform: "uppercase",
            }}
          >
            {l}
          </button>
          {i < LANGS.length - 1 && <span aria-hidden="true"> · </span>}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page (inner — uses lang context)
// ---------------------------------------------------------------------------

const MAILTO_DEMO =
  "mailto:yauheni.futryn@gmail.com?subject=Recepcjonistka%20%E2%80%94%20rozmowa&body=Klinika%3A%20%0AMiasto%3A%20%0ATelefon%3A%20";

function LandingInner() {
  const { t } = useLang();

  return (
    <div className="recepcjonistka-root">
      <style jsx global>{`
        .recepcjonistka-root {
          /* Page-scoped: applies only on /. */
          background-color: var(--paper);
          /* Very subtle dot grid for halftone density. 1% ink dots every 24px. */
          background-image: radial-gradient(
            circle at 1px 1px,
            oklch(0.22 0.012 60 / 0.04) 1px,
            transparent 0
          );
          background-size: 24px 24px;
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
            border-color 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .rcp-link:hover {
          color: var(--oxblood);
          border-color: var(--oxblood);
        }
        .rcp-nav-link {
          color: var(--ink-soft);
          text-decoration: none;
          font-size: 0.8125rem;
          transition: color 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .rcp-nav-link:hover {
          color: var(--oxblood);
        }
        .rcp-lang-btn:hover {
          color: var(--oxblood) !important;
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
          transition: background 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .rcp-cta:hover {
          background: var(--oxblood-deep);
        }
        .rcp-cta:focus-visible {
          outline: 2px solid var(--oxblood-deep);
          outline-offset: 3px;
        }
        @keyframes rcp-pulse {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }
        .rcp-pulse {
          animation: rcp-pulse 1800ms cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .rcp-pulse {
            animation: none;
            opacity: 0.8;
          }
        }
        .rcp-asym-grid {
          display: grid;
          gap: 32px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .rcp-asym-grid {
            grid-template-columns: 3fr 2fr;
            align-items: stretch;
          }
        }
        .rcp-six-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
        }
        @media (min-width: 768px) {
          .rcp-six-grid {
            grid-template-columns: 1fr 1fr;
            column-gap: 56px;
          }
          .rcp-six-grid .rcp-six-last-row {
            border-bottom: none !important;
          }
        }
      `}</style>

      {/* HEADER */}
      <header
        className="rcp-hairline"
        style={{
          borderBottomWidth: 1,
          borderBottomStyle: "solid",
          background: "var(--paper)",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
            flexWrap: "wrap",
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
            {t.wordmark}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
            }}
          >
            <LangSwitcher />
            <span
              aria-hidden="true"
              style={{
                width: "1px",
                height: "14px",
                background: "var(--hairline)",
                display: "inline-block",
              }}
            />
            <a href="/auth/sign-in" className="rcp-nav-link">
              {t.nav.client}
            </a>
            <a href="/auth/sign-in" className="rcp-nav-link">
              {t.nav.operator}
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section
        style={{
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "80px 24px 40px",
        }}
      >
        <HalftoneWaveform />
        <h1
          className="rcp-serif"
          style={{
            fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)",
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            marginTop: "36px",
            marginBottom: "28px",
            color: "var(--ink)",
            fontStyle: "italic",
          }}
        >
          {t.hero.title}
        </h1>
        <p
          style={{
            fontSize: "1.0625rem",
            lineHeight: 1.65,
            color: "var(--ink-soft)",
            maxWidth: "60ch",
          }}
        >
          {t.hero.body}
        </p>
      </section>

      {/* LIVE STATUS + CALENDAR — 60/40 asymmetric row */}
      <section
        style={{
          maxWidth: "56rem",
          margin: "0 auto",
          padding: "16px 24px 48px",
        }}
      >
        <div className="rcp-asym-grid">
          <LiveStatusPanel />
          <CalendarFills />
        </div>
      </section>

      {/* OXBLOOD BAND */}
      <section
        className="rcp-hairline"
        style={{
          borderTop: "1px solid var(--oxblood-deep)",
          borderBottom: "1px solid var(--oxblood-deep)",
          background: "var(--paper-cream)",
          padding: "20px 24px",
          textAlign: "center",
          minHeight: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          className="rcp-serif"
          style={{
            fontStyle: "italic",
            fontSize: "1.0625rem",
            lineHeight: 1.4,
            color: "var(--oxblood-deep)",
            margin: 0,
            maxWidth: "44rem",
          }}
        >
          {t.band}
        </p>
      </section>

      {/* LIVE CONVERSATION PANEL */}
      <section
        style={{
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "48px 24px 64px",
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
            {t.dialoguePanel.eyebrow}
          </div>
          <TypewriterDialogue />
        </div>
      </section>

      {/* WHY THIS EXISTS */}
      <section
        style={{
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "0 24px 64px",
        }}
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {t.observations.map((line, i, arr) => (
            <li
              key={line}
              className={i < arr.length - 1 ? "rcp-hairline" : ""}
              style={{
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                borderBottomStyle: "solid",
                padding: "24px 0",
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

      {/* WHAT IT DOES — 6 items, two columns */}
      <section
        style={{
          maxWidth: "56rem",
          margin: "0 auto",
          padding: "0 24px 64px",
        }}
      >
        <div
          className="rcp-mono"
          style={{
            fontSize: "0.6875rem",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--ink-faint)",
            marginBottom: "32px",
          }}
        >
          {t.whatItDoes.eyebrow}
        </div>
        <ol className="rcp-six-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {t.whatItDoes.items.map((line, i, arr) => {
            // Hairline divider between rows. On 2-col layout each row spans 2 items,
            // so the last 2 items skip their bottom border.
            const isLastRowOnMd = i >= arr.length - 2;
            return (
              <li
                key={line}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(60px, auto) minmax(0, 1fr)",
                  gap: "16px",
                  alignItems: "baseline",
                  padding: "18px 0",
                  borderBottom: "1px solid var(--hairline-faint)",
                  // Strip the bottom hairline from the visually-last rows.
                  ...(isLastRowOnMd ? { borderBottom: "1px solid var(--hairline-faint)" } : {}),
                }}
                className={isLastRowOnMd ? "rcp-six-last-row" : ""}
              >
                <span
                  className="rcp-serif"
                  style={{
                    fontSize: "1.875rem",
                    fontWeight: 500,
                    color: "var(--oxblood)",
                    fontVariantNumeric: "lining-nums",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontSize: "1rem",
                    lineHeight: 1.55,
                    color: "var(--ink)",
                  }}
                >
                  {line}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* CTA */}
      <section
        style={{
          maxWidth: "44rem",
          margin: "0 auto",
          padding: "16px 24px 80px",
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
          {t.cta.headline}
        </p>
        <a href={MAILTO_DEMO} className="rcp-cta">
          {t.cta.button} <span aria-hidden="true">→</span>
        </a>
      </section>

      {/* FOOTER */}
      <footer
        className="rcp-hairline"
        style={{
          borderTopWidth: 1,
          borderTopStyle: "solid",
          marginTop: "32px",
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
          <span>{t.footer.privacy}</span>
          <span>
            &copy; {new Date().getFullYear()} {t.footer.copyright}
          </span>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (outer — wraps the provider)
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <LangProvider>
      <LandingInner />
    </LangProvider>
  );
}
