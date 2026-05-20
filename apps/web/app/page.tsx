"use client";

// Public landing page v3 — PL / EN / RU.
// Bright-white, neutral + emerald palette. Sibling to /dashboard, not an alien.
//
// Sections:
//   1. Header — wordmark + lang toggle + Klient / Operator sign-in links.
//   2. Hero — ASCII halftone waveform, heavy sans headline, body intro.
//   3. Live status + calendar duo — 60/40 cards on md+.
//   4. Typewriter dialogue — subtle ruled-paper card, speaker pills.
//   5. What it does — 2x3 numbered cards.
//   6. CTA + footer — soft neutral-50 band, single CTA, single privacy line.
//
// All animations honor prefers-reduced-motion and pause on visibilitychange.

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
  side: "clinic" | "patient";
}

interface LangBundle {
  htmlLang: string;
  wordmark: string;
  nav: { client: string; operator: string };
  hero: {
    title: string;
    body: string;
  };
  statusPanel: {
    title: string;
    active: string;
    response: string;
    bookings: string;
    languageRow: string;
    busy: string;
    live: string;
  };
  calendar: {
    label: string;
    counter: (n: number) => string;
  };
  dialoguePanel: {
    eyebrow: string;
    speakerClinic: string;
    speakerPatient: string;
  };
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
    wordmark: "Recepcjonistka",
    nav: { client: "Klient", operator: "Operator" },
    hero: {
      title: "Telefon dzwoni. Ktoś odbiera.",
      body: "Recepcjonistka, która nie chodzi na lunch, nie idzie spać i nie pomyli nazwiska pacjenta. Odpowiada po polsku, angielsku, rosyjsku. Umawia wizyty, potwierdza SMSem, działa w klinice stomatologicznej którą prowadzisz.",
    },
    statusPanel: {
      title: "Status · operacyjny",
      active: "Rozmowy w toku",
      response: "Czas odpowiedzi",
      bookings: "Dzisiaj rezerwacji",
      languageRow: "Język aktywny",
      busy: "zajęte",
      live: "LIVE",
    },
    calendar: {
      label: "Kalendarz · ten miesiąc",
      counter: (n) => `${n} wizyt zarezerwowanych dzisiaj`,
    },
    dialoguePanel: {
      eyebrow: "Przykładowa rozmowa · 19:23",
      speakerClinic: "Klinika",
      speakerPatient: "Pacjent",
    },
    whatItDoes: {
      eyebrow: "Co robi",
      items: [
        "Odbiera każdy telefon, dzień i noc.",
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
      privacy: "Dane przechowywane w UE.",
      copyright: "Recepcjonistka",
    },
  },
  en: {
    htmlLang: "en",
    wordmark: "Recepcjonistka",
    nav: { client: "Client", operator: "Operator" },
    hero: {
      title: "The phone rings. Someone answers.",
      body: "A receptionist who never takes lunch, never goes to sleep, and never misspells a patient's name. Speaks Polish, English, and Russian. Books appointments, confirms by SMS, works inside the dental practice you already run.",
    },
    statusPanel: {
      title: "Status · operational",
      active: "Calls in flight",
      response: "Response time",
      bookings: "Bookings today",
      languageRow: "Active language",
      busy: "busy",
      live: "LIVE",
    },
    calendar: {
      label: "Calendar · this month",
      counter: (n) => `${n} appointments booked today`,
    },
    dialoguePanel: {
      eyebrow: "Sample call · 19:23",
      speakerClinic: "Clinic",
      speakerPatient: "Patient",
    },
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
      privacy: "EU-hosted data.",
      copyright: "Recepcjonistka",
    },
  },
  ru: {
    htmlLang: "ru",
    wordmark: "Recepcjonistka",
    nav: { client: "Клиент", operator: "Оператор" },
    hero: {
      title: "Телефон звонит. Кто-то отвечает.",
      body: "Администратор, который не уходит на обед, не ложится спать и не путает фамилию пациента. Говорит по-польски, по-английски, по-русски. Записывает на приём, подтверждает SMS, работает в стоматологической клинике, которой вы управляете.",
    },
    statusPanel: {
      title: "Система · в работе",
      active: "Активные звонки",
      response: "Время отклика",
      bookings: "Записей сегодня",
      languageRow: "Активный язык",
      busy: "занято",
      live: "LIVE",
    },
    calendar: {
      label: "Календарь · этот месяц",
      counter: (n) => `${n} записей сегодня`,
    },
    dialoguePanel: {
      eyebrow: "Пример разговора · 19:23",
      speakerClinic: "Клиника",
      speakerPatient: "Пациент",
    },
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
      privacy: "Данные в ЕС.",
      copyright: "Recepcjonistka",
    },
  },
};

// Per-language dialogue scripts. Speaker label is derived from t.dialoguePanel
// so that switching language reformats the speaker pill correctly.
const DIALOGUES: Record<Lang, DialogueLine[]> = {
  pl: [
    { speaker: "Klinika", line: "Dzień dobry.", side: "clinic" },
    { speaker: "Pacjent", line: "Dobry, chciałbym się umówić na konsultację.", side: "patient" },
    {
      speaker: "Klinika",
      line: "Oczywiście. Mam wolny termin w czwartek o dziesiątej, pasuje?",
      side: "clinic",
    },
    { speaker: "Pacjent", line: "Tak, świetnie.", side: "patient" },
    { speaker: "Klinika", line: "Potwierdzę SMSem. Do zobaczenia w czwartek.", side: "clinic" },
  ],
  en: [
    { speaker: "Clinic", line: "Good evening.", side: "clinic" },
    { speaker: "Patient", line: "Hi, I'd like to book a consultation.", side: "patient" },
    {
      speaker: "Clinic",
      line: "Of course. I have Thursday at ten free, does that work?",
      side: "clinic",
    },
    { speaker: "Patient", line: "Yes, perfect.", side: "patient" },
    { speaker: "Clinic", line: "I'll confirm by SMS. See you Thursday.", side: "clinic" },
  ],
  ru: [
    { speaker: "Клиника", line: "Добрый вечер.", side: "clinic" },
    { speaker: "Пациент", line: "Здравствуйте, хочу записаться на консультацию.", side: "patient" },
    { speaker: "Клиника", line: "Конечно. Четверг в десять свободен, подходит?", side: "clinic" },
    { speaker: "Пациент", line: "Да, отлично.", side: "patient" },
    { speaker: "Клиника", line: "Подтвержу SMS. До встречи в четверг.", side: "clinic" },
  ],
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
// Halftone waveform — preserved from v2. Recolored to emerald via currentColor.
// ---------------------------------------------------------------------------

const HALFTONE_GLYPHS = [" ", ".", ",", ":", ";", "o", "O", "0", "#", "@"];
const HALFTONE_WIDTH = 64;
const HALFTONE_FPS = 24;
const HALFTONE_FRAME_MS = 1000 / HALFTONE_FPS;

interface FlashPeak {
  col: number;
  birth: number; // ms timestamp
}

function densityChar(v: number): string {
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
    let density = (v + 1) / 2;
    const edge = Math.min(i, HALFTONE_WIDTH - 1 - i);
    const fade = Math.min(1, edge / 6);
    density *= fade;

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
      if (t - lastDrawRef.current >= HALFTONE_FRAME_MS) {
        lastDrawRef.current = t;

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
      className="select-none whitespace-pre text-center font-mono text-emerald-600"
      style={{
        fontSize: "0.85rem",
        letterSpacing: "0.04em",
        lineHeight: "1.15",
        // Reserve 2 lines so layout never shifts.
        height: "2.3em",
        opacity: 0.85,
      }}
    >
      {frames.a}
      {"\n"}
      {frames.b}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typewriter dialogue — ruled-paper card + emerald speaker pills.
// ---------------------------------------------------------------------------

const TYPE_MS_PER_CHAR = 30;
const PAUSE_BETWEEN_LINES_MS = 600;
const RESTART_DELAY_MS = 5000;

interface RenderedLine {
  speaker: string;
  side: "clinic" | "patient";
  text: string;
  done: boolean;
}

function renderDialogue(elapsedMs: number, dialogue: DialogueLine[]): RenderedLine[] {
  let cursor = 0;
  const result: RenderedLine[] = [];
  for (const { speaker, line, side } of dialogue) {
    const typeMs = line.length * TYPE_MS_PER_CHAR;
    const start = cursor;
    const end = cursor + typeMs;
    if (elapsedMs <= start) {
      result.push({ speaker, side, text: "", done: false });
    } else if (elapsedMs >= end) {
      result.push({ speaker, side, text: line, done: true });
    } else {
      const frac = (elapsedMs - start) / typeMs;
      const chars = Math.max(0, Math.floor(line.length * frac));
      result.push({ speaker, side, text: line.slice(0, chars), done: false });
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
  const { t, lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const dialogue = DIALOGUES[lang];
  const [lines, setLines] = useState<RenderedLine[]>(() =>
    dialogue.map((d) => ({ speaker: d.speaker, side: d.side, text: "", done: false })),
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setLines(dialogue.map((d) => ({ speaker: d.speaker, side: d.side, text: "", done: false })));

    if (reduced) {
      setLines(
        dialogue.map((d) => ({ speaker: d.speaker, side: d.side, text: d.line, done: true })),
      );
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
      className="font-mono text-[15px] leading-8 text-neutral-800"
      style={{
        // Reserve a stable minimum height — 5 lines * 32px (leading-8) + margin.
        minHeight: `${dialogue.length * 32}px`,
      }}
    >
      {lines.map((l, i) => {
        const pillBg = l.side === "clinic" ? "bg-emerald-50" : "bg-neutral-100";
        const pillText = l.side === "clinic" ? "text-emerald-700" : "text-neutral-600";
        return (
          <div key={i} className="flex items-start gap-3 py-0.5">
            <span
              className={`mt-1.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${pillBg} ${pillText}`}
              style={{ minWidth: "62px", justifyContent: "center" }}
            >
              {l.side === "clinic" ? t.dialoguePanel.speakerClinic : t.dialoguePanel.speakerPatient}
            </span>
            <span className="min-w-0 flex-1 break-words">
              <span>{l.text}</span>
              {!l.done && l.text.length > 0 && (
                <span className="ml-[2px] inline-block h-[1em] w-[7px] translate-y-[2px] bg-emerald-600 align-middle animate-pulse" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live status panel — white card, neutral hairlines, emerald accent.
// ---------------------------------------------------------------------------

const BAR_WIDTH = 7;
const BAR_FULL = "▰";
const BAR_EMPTY = "▱";

function makeBar(value: number, max: number): string {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((value / max) * BAR_WIDTH)));
  return BAR_FULL.repeat(filled) + BAR_EMPTY.repeat(BAR_WIDTH - filled);
}

function makeResponseBar(ms: number): string {
  const ratio = Math.max(0, Math.min(1, (ms - 380) / (820 - 380)));
  if (ratio < 0.33) return "░░░";
  if (ratio < 0.66) return "▒▒▒";
  return "▓▓▓";
}

function weightedActiveCalls(): number {
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

  const [active, setActive] = useState(3);
  const [responseMs, setResponseMs] = useState(580);
  const [bookings, setBookings] = useState(12);
  const [langPulse, setLangPulse] = useState<Lang>("pl");

  useEffect(() => {
    if (reduced) {
      setActive(3);
      setResponseMs(612);
      setBookings(12);
      setLangPulse(lang);
      return;
    }

    let responseTimer: ReturnType<typeof setInterval> | null = null;
    let activeTimer: ReturnType<typeof setInterval> | null = null;
    let bookingsTimer: ReturnType<typeof setTimeout> | null = null;
    let langTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const startResponse = () => {
      let phase = 0;
      responseTimer = setInterval(() => {
        phase += 0.4;
        const base = 600 + Math.sin(phase) * 160;
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
  // Pulsing dot fallback: pure tailwind animate-pulse when motion is allowed.

  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-7"
      style={{ minHeight: "240px" }}
      aria-label={t.statusPanel.title}
    >
      <div className="mb-4 flex items-baseline justify-between border-b border-neutral-100 pb-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">
          {t.statusPanel.title}
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-600">
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 ${reduced ? "" : "animate-pulse"}`}
          />
          {t.statusPanel.live}
        </span>
      </div>

      <div className="space-y-2 font-mono text-[13px] leading-7 text-neutral-700">
        <StatusRow
          label={t.statusPanel.active}
          valueDisplay={
            <>
              <span className={busy ? "text-emerald-600" : "text-neutral-400"}>
                {makeBar(active, 6)}
              </span>
              <span className={`ml-2.5 ${busy ? "text-emerald-700" : "text-neutral-900"}`}>
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
              <span className="text-neutral-400">{makeResponseBar(responseMs)}</span>
              <span className="ml-2.5 text-neutral-900">{responseMs} ms</span>
            </>
          }
        />
        <StatusRow
          label={t.statusPanel.bookings}
          valueDisplay={<span className="text-emerald-700">+{bookings}</span>}
        />
        <StatusRow
          label={t.statusPanel.languageRow}
          valueDisplay={
            <span aria-hidden="true">
              {LANGS.map((l, i) => (
                <span key={l}>
                  <span
                    className={
                      l === langPulse
                        ? "font-semibold text-emerald-700"
                        : "text-neutral-400"
                    }
                  >
                    {l.toUpperCase()}
                  </span>
                  {i < LANGS.length - 1 && <span className="text-neutral-300"> · </span>}
                </span>
              ))}
            </span>
          }
        />
      </div>
    </div>
  );
}

function StatusRow({ label, valueDisplay }: { label: string; valueDisplay: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-1">
      <span className="text-neutral-500">{label}</span>
      <span className="whitespace-nowrap">{valueDisplay}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar — ported polish from CD HTML. Recolored to emerald.
// 5 weeks × 7 days = 35 cells. Filled cells use emerald-200 bg, emerald-700 text.
// ---------------------------------------------------------------------------

const CAL_ROWS = 5;
const CAL_COLS = 7;
const CAL_CELLS = CAL_ROWS * CAL_COLS;
const CAL_FILL_THRESHOLD = 0.7;

interface CalCell {
  filled: boolean;
  flashing: boolean;
}

function CalendarFills() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();

  // Deterministic initial pattern so SSR + first client render agree.
  const initialPattern: CalCell[] = useMemo(() => {
    const arr: CalCell[] = new Array(CAL_CELLS).fill(null).map(() => ({
      filled: false,
      flashing: false,
    }));
    // Every 4th cell, biased toward early month.
    for (let i = 0; i < CAL_CELLS; i++) {
      if (i % 4 === 0 && i < 24) arr[i]!.filled = true;
    }
    return arr;
  }, []);

  const [cells, setCells] = useState<CalCell[]>(initialPattern);
  const [counter, setCounter] = useState(12);

  useEffect(() => {
    if (reduced) {
      const half: CalCell[] = new Array(CAL_CELLS).fill(null).map((_, i) => ({
        filled: i % 2 === 0,
        flashing: false,
      }));
      setCells(half);
      setCounter(12);
      return;
    }

    let fillTimer: ReturnType<typeof setTimeout> | null = null;
    let counterTimer: ReturnType<typeof setInterval> | null = null;
    const flashTimers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;

    const scheduleFill = () => {
      const delay = 800 + Math.random() * 1400;
      fillTimer = setTimeout(() => {
        if (stopped) return;
        setCells((prev) => {
          const filledCount = prev.filter((c) => c.filled).length;
          if (filledCount / CAL_CELLS >= CAL_FILL_THRESHOLD) {
            // Reset to seed.
            return initialPattern.map((c) => ({ ...c }));
          }
          const empties: number[] = [];
          for (let i = 0; i < prev.length; i++) if (!prev[i]!.filled) empties.push(i);
          if (empties.length === 0) return initialPattern.map((c) => ({ ...c }));
          const pick = empties[Math.floor(Math.random() * empties.length)]!;
          const next = prev.map((c) => ({ ...c }));
          next[pick] = { filled: true, flashing: true };

          // Clear the flash after the CSS pulse window.
          const tid = setTimeout(() => {
            if (stopped) return;
            setCells((curr) =>
              curr.map((c, i) => (i === pick ? { ...c, flashing: false } : c)),
            );
          }, 900);
          flashTimers.push(tid);
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
          counterTimer = setInterval(() => setCounter((c) => c + 1), 11000);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      if (fillTimer) clearTimeout(fillTimer);
      if (counterTimer) clearInterval(counterTimer);
      flashTimers.forEach((t) => clearTimeout(t));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced, initialPattern]);

  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-7"
      style={{ minHeight: "240px" }}
      aria-label={t.calendar.label}
    >
      <div className="mb-4 border-b border-neutral-100 pb-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">
          {t.calendar.label}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-7 gap-1.5"
        style={{ maxWidth: "260px" }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            className={[
              "aspect-square rounded-sm border transition-colors duration-300 ease-out",
              c.filled
                ? "border-emerald-300 bg-emerald-200"
                : "border-neutral-200 bg-neutral-100",
              c.flashing ? "rcp-cal-flash" : "",
            ].join(" ")}
          />
        ))}
      </div>
      <div className="mt-4 font-mono text-xs text-neutral-500">{t.calendar.counter(counter)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language switcher
// ---------------------------------------------------------------------------

function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <span
      role="group"
      aria-label="Language"
      className="font-mono text-xs"
      style={{ letterSpacing: "0.12em" }}
    >
      {LANGS.map((l, i) => (
        <span key={l}>
          <button
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={[
              "px-1 py-0.5 uppercase transition-colors duration-200",
              lang === l
                ? "font-bold text-emerald-600"
                : "text-neutral-400 hover:text-neutral-700",
            ].join(" ")}
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
          >
            {l}
          </button>
          {i < LANGS.length - 1 && (
            <span aria-hidden="true" className="text-neutral-300">
              {" · "}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const MAILTO_DEMO =
  "mailto:yauheni.futryn@gmail.com?subject=Recepcjonistka%20%E2%80%94%20rozmowa&body=Klinika%3A%20%0AMiasto%3A%20%0ATelefon%3A%20";

function LandingInner() {
  const { t } = useLang();

  return (
    <div
      className="min-h-screen bg-white text-neutral-900"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <style jsx global>{`
        /* Selection — emerald wash, not the default browser blue. */
        ::selection {
          background: rgb(167 243 208); /* emerald-200 */
          color: rgb(6 78 59); /* emerald-900 */
        }
        /* Calendar flash — box-shadow ring fade-out, no layout cost. */
        @keyframes rcp-cal-flash {
          0% {
            box-shadow: 0 0 0 0 rgb(16 185 129 / 0.45);
          }
          100% {
            box-shadow: 0 0 0 8px rgb(16 185 129 / 0);
          }
        }
        .rcp-cal-flash {
          animation: rcp-cal-flash 900ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .rcp-cal-flash {
            animation: none;
          }
        }
        /* Ruled-paper backdrop — very subtle 32px gridlines for the dialogue card. */
        .rcp-ruled {
          background-image: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent calc(2rem - 1px),
            rgba(0, 0, 0, 0.04) calc(2rem - 1px),
            rgba(0, 0, 0, 0.04) 2rem
          );
          background-position: 0 0.5rem;
        }
      `}</style>

      {/* HEADER */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <span className="text-base font-semibold tracking-tight text-neutral-900">
            {t.wordmark}
          </span>
          <div className="flex items-center gap-5">
            <LangSwitcher />
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-px bg-neutral-200"
            />
            <a
              href="/auth/sign-in"
              className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {t.nav.client}
            </a>
            <a
              href="/auth/sign-in"
              className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {t.nav.operator}
            </a>
          </div>
        </div>
      </header>

      {/* HERO — bright white, faint dot grid only on this section. */}
      <section
        className="bg-white"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      >
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
          <HalftoneWaveform />
          <h1 className="mt-10 text-4xl font-bold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl">
            {t.hero.title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-700 sm:text-lg">
            {t.hero.body}
          </p>
        </div>
      </section>

      {/* LIVE STATUS + CALENDAR — neutral-50 band */}
      <section className="bg-neutral-50">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
            <div className="md:col-span-3">
              <LiveStatusPanel />
            </div>
            <div className="md:col-span-2">
              <CalendarFills />
            </div>
          </div>
        </div>
      </section>

      {/* TYPEWRITER DIALOGUE — white band */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <div className="rcp-ruled rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-4 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
              {t.dialoguePanel.eyebrow}
            </div>
            <TypewriterDialogue />
          </div>
        </div>
      </section>

      {/* WHAT IT DOES — neutral-50 band, 2x3 numbered cards */}
      <section className="bg-neutral-50">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="mb-8 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
            {t.whatItDoes.eyebrow}
          </div>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.whatItDoes.items.map((line, i) => (
              <li
                key={line}
                className="group rounded-2xl border border-neutral-200 bg-white p-6 transition-colors duration-200 hover:border-neutral-300 hover:bg-emerald-50/30"
              >
                <div className="font-mono text-xs font-semibold text-emerald-600">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="mt-3 text-[15px] font-medium leading-relaxed text-neutral-900">
                  {line}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA — neutral-50 band (visual rest before footer) */}
      <section className="bg-neutral-50">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
            {t.cta.headline}
          </h2>
          <a
            href={MAILTO_DEMO}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            {t.cta.button} <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-neutral-500">
          <span className="font-semibold tracking-tight text-neutral-700">
            {t.footer.copyright}
          </span>
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
// Outer page
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <LangProvider>
      <LandingInner />
    </LangProvider>
  );
}
