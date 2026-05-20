"use client";

// ============================================================================
// Public landing page v4 — Technical Cinema.
// ----------------------------------------------------------------------------
// Aesthetic direction (locked):
//   - Instrument Serif display headlines, Geist Sans body, Geist Mono labels.
//   - Bright white background, emerald-600 single accent.
//   - Canvas-based hero with 280-320 sinusoidal-current particles.
//   - Six architecture cards, each with a UNIQUE micro-visualization.
//   - Asymmetric grid heights, mono-typed technical eyebrows.
//   - PL / EN / RU. Persisted via `odbiera:lang` localStorage key.
//
// All animation loops respect:
//   - prefers-reduced-motion (render one composed frame, no loops)
//   - document.visibilityState (pause when tab hidden, resume on visible)
// ============================================================================

import Link from "next/link";
import type { Route } from "next";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// useCallback is used in LangProvider's setLang.

// ---------------------------------------------------------------------------
// Language layer
// ---------------------------------------------------------------------------

type Lang = "pl" | "en" | "ru";
const LANG_KEY = "odbiera:lang"; // renamed from recepcjonistka:lang (brand change)
const LANGS: Lang[] = ["pl", "en", "ru"];

interface DialogueLine {
  side: "clinic" | "patient";
  ts: string; // HH:MM:SS — purely cosmetic, but consistent
  line: string;
}

interface LangBundle {
  htmlLang: string;
  wordmark: string;
  nav: { client: string; operator: string };
  hero: {
    line1: string;
    line2: string;
    body: string;
    caption: (count: string) => string;
  };
  illustration: {
    quote: string;
    attribution: string;
    caption: string;
  };
  cards: {
    eyebrow: string; // section eyebrow above the grid
    voice: { eyebrow: string; title: string };
    booking: { eyebrow: string; title: string; counter: (n: number) => string };
    languages: { eyebrow: string; title: string };
    latency: { eyebrow: string; title: string; p95: string };
    sms: { eyebrow: string; title: string };
    memory: { eyebrow: string; title: string; days: [string, string, string, string, string, string, string] };
  };
  ledger: {
    eyebrow: string;
    speakerClinic: string;
    speakerPatient: string;
  };
  cta: {
    headline: string;
    button: string;
    contact: string;
  };
  footer: {
    privacy: string;
    copyright: string;
  };
}

const STRINGS: Record<Lang, LangBundle> = {
  pl: {
    htmlLang: "pl",
    wordmark: "Odbiera",
    nav: { client: "Klient", operator: "Operator" },
    hero: {
      line1: "Telefon dzwoni.",
      line2: "Ktoś odbiera.",
      body: "Recepcjonistka, która nie chodzi na lunch, nie idzie spać i nie pomyli nazwiska pacjenta. Odpowiada po polsku, angielsku, rosyjsku. Umawia wizyty, potwierdza SMSem, działa w klinice stomatologicznej którą prowadzisz.",
      caption: (count) => `SYSTEM · 14 dni · 23 klinik · ${count} rozmów odebranych`,
    },
    illustration: {
      quote: "Klinika zamknięta. Linia nigdy nie.",
      attribution: "Z dziennika systemu · 02:14:33",
      caption: "Pierwsza rozmowa odebrana o 03:17",
    },
    cards: {
      eyebrow: "ARCHITEKTURA · SZEŚĆ MODUŁÓW",
      voice: { eyebrow: "VOICE / GŁOS", title: "Audio" },
      booking: {
        eyebrow: "BOOKING / KALENDARZ",
        title: "Sloty",
        counter: (n) => `${n} z 24`,
      },
      languages: { eyebrow: "LANGUAGES / JĘZYKI", title: "Polski · English · Русский" },
      latency: { eyebrow: "LATENCY / OPÓŹNIENIE", title: "Odpowiedź < 1 s", p95: "p95 · 812 ms" },
      sms: { eyebrow: "SMS · CONFIRMATIONS", title: "Potwierdzenie" },
      memory: {
        eyebrow: "MEMORY / PAMIĘĆ",
        title: "Tydzień",
        days: ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"],
      },
    },
    ledger: {
      eyebrow: "LIVE · 19:23 · POLSKI",
      speakerClinic: "Klinika",
      speakerPatient: "Pacjent",
    },
    cta: {
      headline: "Chcesz zobaczyć, jak to brzmi w Twojej klinice?",
      button: "Umów rozmowę →",
      contact: "kontakt@odbiera.com · +48 22 000 00 00",
    },
    footer: {
      privacy: "Dane przechowywane w UE.",
      copyright: "Odbiera",
    },
  },
  en: {
    htmlLang: "en",
    wordmark: "Odbiera",
    nav: { client: "Client", operator: "Operator" },
    hero: {
      line1: "The phone rings.",
      line2: "Someone answers.",
      body: "A receptionist who never takes lunch, never goes to sleep, and never misspells a patient's name. Speaks Polish, English, and Russian. Books appointments, confirms by SMS, works inside the dental practice you already run.",
      caption: (count) => `SYSTEM · 14 days · 23 clinics · ${count} calls answered`,
    },
    illustration: {
      quote: "The clinic closes. The line never does.",
      attribution: "From the system log · 02:14:33",
      caption: "First call answered at 03:17",
    },
    cards: {
      eyebrow: "ARCHITECTURE · SIX MODULES",
      voice: { eyebrow: "VOICE", title: "Audio" },
      booking: {
        eyebrow: "BOOKING / CALENDAR",
        title: "Slots",
        counter: (n) => `${n} of 24`,
      },
      languages: { eyebrow: "LANGUAGES", title: "Polski · English · Русский" },
      latency: { eyebrow: "LATENCY", title: "Response < 1 s", p95: "p95 · 812 ms" },
      sms: { eyebrow: "SMS · CONFIRMATIONS", title: "Confirmation" },
      memory: {
        eyebrow: "MEMORY",
        title: "Week",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
    },
    ledger: {
      eyebrow: "LIVE · 19:23 · POLISH",
      speakerClinic: "Clinic",
      speakerPatient: "Patient",
    },
    cta: {
      headline: "Want to hear how it sounds inside your clinic?",
      button: "Book a call →",
      contact: "kontakt@odbiera.com · +48 22 000 00 00",
    },
    footer: {
      privacy: "Data stored in the EU.",
      copyright: "Odbiera",
    },
  },
  ru: {
    htmlLang: "ru",
    wordmark: "Odbiera",
    nav: { client: "Клиент", operator: "Оператор" },
    hero: {
      line1: "Телефон звонит.",
      line2: "Кто-то отвечает.",
      body: "Администратор, который не уходит на обед, не ложится спать и не путает фамилию пациента. Говорит по-польски, по-английски, по-русски. Записывает на приём, подтверждает SMS, работает в стоматологической клинике, которой вы управляете.",
      caption: (count) => `SYSTEM · 14 дней · 23 клиник · ${count} принятых звонков`,
    },
    illustration: {
      quote: "Клиника закрывается. Линия — никогда.",
      attribution: "Из журнала системы · 02:14:33",
      caption: "Первый звонок принят в 03:17",
    },
    cards: {
      eyebrow: "АРХИТЕКТУРА · ШЕСТЬ МОДУЛЕЙ",
      voice: { eyebrow: "VOICE / ГОЛОС", title: "Аудио" },
      booking: {
        eyebrow: "BOOKING / КАЛЕНДАРЬ",
        title: "Слоты",
        counter: (n) => `${n} из 24`,
      },
      languages: {
        eyebrow: "LANGUAGES / ЯЗЫКИ",
        title: "Polski · English · Русский",
      },
      latency: {
        eyebrow: "LATENCY / ЗАДЕРЖКА",
        title: "Ответ < 1 с",
        p95: "p95 · 812 мс",
      },
      sms: { eyebrow: "SMS · ПОДТВЕРЖДЕНИЯ", title: "Подтверждение" },
      memory: {
        eyebrow: "MEMORY / ПАМЯТЬ",
        title: "Неделя",
        days: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
      },
    },
    ledger: {
      eyebrow: "LIVE · 19:23 · РУССКИЙ",
      speakerClinic: "Клиника",
      speakerPatient: "Пациент",
    },
    cta: {
      headline: "Хотите услышать, как это звучит в вашей клинике?",
      button: "Заказать звонок →",
      contact: "kontakt@odbiera.com · +48 22 000 00 00",
    },
    footer: {
      privacy: "Данные хранятся в ЕС.",
      copyright: "Odbiera",
    },
  },
};

// Live transcript dialogue with stable HH:MM:SS timestamps per language.
const DIALOGUES: Record<Lang, DialogueLine[]> = {
  pl: [
    { side: "clinic", ts: "19:23:04", line: "Dzień dobry, klinika Odbiera." },
    { side: "patient", ts: "19:23:07", line: "Dobry, chciałbym się umówić na konsultację." },
    { side: "clinic", ts: "19:23:11", line: "Mam wolny termin w czwartek o dziesiątej, pasuje?" },
    { side: "patient", ts: "19:23:15", line: "Tak, świetnie." },
    { side: "clinic", ts: "19:23:18", line: "Potwierdzę SMSem. Do zobaczenia w czwartek." },
  ],
  en: [
    { side: "clinic", ts: "19:23:04", line: "Good evening, Odbiera clinic." },
    { side: "patient", ts: "19:23:07", line: "Hi, I'd like to book a consultation." },
    { side: "clinic", ts: "19:23:11", line: "I have Thursday at ten free, does that work?" },
    { side: "patient", ts: "19:23:15", line: "Yes, perfect." },
    { side: "clinic", ts: "19:23:18", line: "I'll confirm by SMS. See you Thursday." },
  ],
  ru: [
    { side: "clinic", ts: "19:23:04", line: "Добрый вечер, клиника Odbiera." },
    { side: "patient", ts: "19:23:07", line: "Здравствуйте, хочу записаться на консультацию." },
    { side: "clinic", ts: "19:23:11", line: "Четверг в десять свободен, подходит?" },
    { side: "patient", ts: "19:23:15", line: "Да, отлично." },
    { side: "clinic", ts: "19:23:18", line: "Подтвержу SMS. До встречи в четверг." },
  ],
};

// ---------------------------------------------------------------------------
// LangContext + provider
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
  const [lang, setLangState] = useState<Lang>("pl");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === "pl" || stored === "en" || stored === "ru") setLangState(stored);
    } catch {
      // private mode, SSR — ignore.
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = STRINGS[lang].htmlLang;
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<LangCtxValue>(() => ({ lang, setLang, t: STRINGS[lang] }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

// ---------------------------------------------------------------------------
// Shared hooks: prefers-reduced-motion + page-visible
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

function usePageVisible(): boolean {
  // SSR + first render: assume visible. Subscribe on mount.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setVisible(!document.hidden);
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

// ---------------------------------------------------------------------------
// Sticky header
// ---------------------------------------------------------------------------

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div role="group" aria-label="Language" className="flex items-center gap-2 font-mono text-xs">
      {LANGS.map((l, i) => (
        <span key={l} className="flex items-center">
          <button
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={
              lang === l
                ? "uppercase font-medium text-emerald-600"
                : "uppercase text-neutral-400 transition-colors duration-200 hover:text-neutral-700"
            }
          >
            {l}
          </button>
          {i < LANGS.length - 1 && (
            <span aria-hidden="true" className="ml-2 text-neutral-300">
              ·
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function Header() {
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-4">
        <span className="font-serif text-xl italic text-neutral-900">{t.wordmark}</span>
        <div className="justify-self-center">
          <LangToggle />
        </div>
        <nav className="flex items-center justify-end gap-5 text-sm">
          <Link
            href={"/auth/sign-in?as=client" as Route}
            className="text-neutral-600 transition-colors duration-200 hover:text-neutral-900"
          >
            {t.nav.client}
          </Link>
          <Link
            href={"/auth/sign-in?as=operator" as Route}
            className="text-neutral-600 transition-colors duration-200 hover:text-neutral-900"
          >
            {t.nav.operator}
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// HERO — canvas of sinusoidal particles + display headline + caption counter
// ---------------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  baseY: number;
  amplitude: number;
  freq: number;
  phase: number;
  vx: number;
  opacity: number;
  size: number;
  flare: boolean;
}

function buildParticles(width: number, height: number, count: number): Particle[] {
  // Halftone density: at low x, particles are sparse; at high x, dense.
  // We sample candidate xs against a density curve until we have `count` particles.
  const particles: Particle[] = [];
  let safety = 0;
  while (particles.length < count && safety < count * 8) {
    safety++;
    const x = Math.random() * width;
    // Density rises sigmoid-like from left to right.
    const u = x / width;
    const density = 0.18 + Math.pow(u, 1.6) * 0.82; // [0.18 ... 1]
    if (Math.random() > density) continue;

    const baseY = height * (0.2 + Math.random() * 0.6);
    particles.push({
      x,
      y: baseY,
      baseY,
      amplitude: 6 + Math.random() * 18,
      freq: 0.0008 + Math.random() * 0.0014,
      phase: Math.random() * Math.PI * 2,
      vx: 0.2 + Math.random() * 0.2, // ~0.3 px/frame average
      opacity: 0.35 + Math.random() * 0.65,
      size: 0.7 + Math.random() * 1.6,
      flare: false,
    });
  }
  // Promote 5-8 random particles into flares.
  const flareCount = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < flareCount && i < particles.length; i++) {
    const idx = Math.floor(Math.random() * particles.length);
    particles[idx]!.flare = true;
    particles[idx]!.size = 1.6 + Math.random() * 1.4;
  }
  return particles;
}

function HeroCanvas() {
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const dimsRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });

  // Resize observer: recompute particle list whenever the box changes size.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const compute = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      dimsRef.current = { w, h, dpr };

      // Mobile: scale down to ~180 particles to keep fps OK.
      const targetCount = w < 640 ? 180 : 300;
      particlesRef.current = buildParticles(w, h, targetCount);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Animation loop. Draw logic is inlined into the effect so the React
  // Compiler doesn't flag ref-content mutations inside a memoized callback.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawFrame = (t: number) => {
      const { w, h } = dimsRef.current;
      ctx.clearRect(0, 0, w, h);
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        p.y = p.baseY + p.amplitude * Math.sin(t * p.freq + p.x * 0.01 + p.phase);
        if (p.flare) {
          const pulse = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.002 + p.phase));
          ctx.fillStyle = `rgba(5, 150, 105, ${0.5 * pulse + 0.2})`;
        } else {
          ctx.fillStyle = `rgba(16, 185, 129, ${0.18 * p.opacity})`;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reduced) {
      drawFrame(0);
      return;
    }
    if (!visible) {
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      const particles = particlesRef.current;
      const w = dimsRef.current.w;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        p.x += p.vx;
        if (p.x > w + 6) p.x = -6;
      }
      drawFrame(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [reduced, visible]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="relative w-full"
      // 60vh is the hero spec. Floor at 360px so phones don't get a sliver.
      style={{ height: "60vh", minHeight: "360px" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

// Tabular counter: animates +1 every 5-8s. Renders 2 847 with NBSP separator.
function formatThousandsNBSP(n: number): string {
  // Polish convention: space as thousands separator. We use a non-breaking
  // space so the number never wraps mid-digit-group.
  const s = String(n);
  // Insert NBSP ( ) every 3 digits from the right.
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function HeroCaptionCounter() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [n, setN] = useState(2847);

  useEffect(() => {
    if (reduced || !visible) return;
    let cancelled = false;

    const scheduleNext = () => {
      const delay = 5000 + Math.random() * 3000; // 5-8s
      const id = window.setTimeout(() => {
        if (cancelled) return;
        setN((v) => v + 1);
        scheduleNext();
      }, delay);
      return id;
    };
    const id = scheduleNext();
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [reduced, visible]);

  return (
    <p className="mt-6 font-mono text-xs uppercase tracking-wider tabular-nums text-neutral-500">
      {t.hero.caption(formatThousandsNBSP(n))}
    </p>
  );
}

function Hero() {
  const { t } = useLang();
  // Fade-in stagger for the two display lines. Opacity transitions only —
  // never transform, so there's zero layout cost.
  const [shown, setShown] = useState({ a: false, b: false });
  useEffect(() => {
    const t1 = window.setTimeout(() => setShown((s) => ({ ...s, a: true })), 0);
    const t2 = window.setTimeout(() => setShown((s) => ({ ...s, b: true })), 120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <section className="relative overflow-hidden bg-white">
      <HeroCanvas />
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-8 sm:pb-24">
        <h1 className="text-7xl font-serif leading-[0.95] tracking-tight text-neutral-900 md:text-8xl">
          <span
            className="block transition-opacity duration-700 ease-out"
            style={{ opacity: shown.a ? 1 : 0 }}
          >
            {t.hero.line1}
          </span>
          <span
            className="block transition-opacity duration-700 ease-out"
            style={{ opacity: shown.b ? 1 : 0 }}
          >
            {t.hero.line2}
          </span>
        </h1>
        <p className="mt-10 max-w-prose text-lg leading-relaxed text-neutral-700">{t.hero.body}</p>
        <HeroCaptionCounter />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SVG illustration block + italic quote
// ---------------------------------------------------------------------------

function PhoneIllustration() {
  // Isometric phone receiver hovering above a printed booking schedule.
  // Thin emerald-600 strokes, white fills, neutral-300 hatch background.
  return (
    <svg
      viewBox="0 0 600 450"
      role="img"
      aria-label="Isometric phone receiver above a booking schedule"
      className="h-auto w-full max-w-xl"
    >
      {/* Background hatch — neutral-300 thin diagonals */}
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(40)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#d4d4d4" strokeWidth="0.8" />
        </pattern>
        <radialGradient id="beam" cx="50%" cy="20%" r="60%">
          <stop offset="0%" stopColor="rgba(16,185,129,0.32)" />
          <stop offset="100%" stopColor="rgba(16,185,129,0)" />
        </radialGradient>
      </defs>
      <rect x="0" y="320" width="600" height="130" fill="url(#hatch)" opacity="0.55" />

      {/* Light beams from receiver */}
      <g opacity="0.7">
        <polygon points="280,140 240,330 340,330" fill="url(#beam)" />
        <polygon points="320,140 290,330 380,330" fill="url(#beam)" opacity="0.7" />
        <polygon points="260,140 200,330 280,330" fill="url(#beam)" opacity="0.55" />
      </g>

      {/* Booking schedule sheet (isometric, ~20° tilt) */}
      <g transform="translate(120,250) skewX(-12)">
        <rect x="0" y="0" width="340" height="170" fill="#ffffff" stroke="#059669" strokeWidth="1.5" />
        {/* Header band */}
        <line x1="0" y1="28" x2="340" y2="28" stroke="#059669" strokeWidth="1.5" />
        {/* Row lines */}
        {[56, 84, 112, 140].map((y) => (
          <line key={y} x1="0" y1={y} x2="340" y2={y} stroke="#e5e7eb" strokeWidth="1" />
        ))}
        {/* Column markers */}
        <line x1="80" y1="0" x2="80" y2="170" stroke="#e5e7eb" strokeWidth="1" />
        <line x1="200" y1="0" x2="200" y2="170" stroke="#e5e7eb" strokeWidth="1" />

        {/* Filled cells (booked) */}
        <rect x="84" y="32" width="112" height="20" fill="#a7f3d0" opacity="0.85" />
        <rect x="204" y="60" width="112" height="20" fill="#a7f3d0" opacity="0.7" />
        <rect x="84" y="88" width="112" height="20" fill="#a7f3d0" opacity="0.55" />
        <rect x="204" y="116" width="112" height="20" fill="#a7f3d0" opacity="0.6" />

        {/* Header dashes */}
        <line x1="12" y1="16" x2="60" y2="16" stroke="#525252" strokeWidth="1.2" />
        <line x1="96" y1="16" x2="180" y2="16" stroke="#525252" strokeWidth="1.2" />
        <line x1="216" y1="16" x2="300" y2="16" stroke="#525252" strokeWidth="1.2" />
      </g>

      {/* Isometric phone receiver */}
      <g transform="translate(300,80) rotate(-12)">
        <rect x="-60" y="-20" width="120" height="40" rx="20" fill="#ffffff" stroke="#059669" strokeWidth="2" />
        <rect x="-86" y="-10" width="30" height="20" rx="6" fill="#ffffff" stroke="#059669" strokeWidth="2" />
        <rect x="56" y="-10" width="30" height="20" rx="6" fill="#ffffff" stroke="#059669" strokeWidth="2" />
        {/* Speaker dots */}
        <circle cx="-66" cy="0" r="1.6" fill="#059669" />
        <circle cx="-72" cy="0" r="1.6" fill="#059669" />
        <circle cx="66" cy="0" r="1.6" fill="#059669" />
        <circle cx="72" cy="0" r="1.6" fill="#059669" />
      </g>

      {/* Hairline shadow under the phone, sells the "hover" */}
      <ellipse cx="320" cy="190" rx="60" ry="6" fill="#059669" opacity="0.08" />
    </svg>
  );
}

function IllustrationBlock() {
  const { t } = useLang();
  return (
    <section
      className="relative bg-white"
      style={{
        // Halftone dot overlay.
        backgroundImage:
          "radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)",
        backgroundSize: "8px 8px",
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-5 md:items-center md:gap-10">
          <div className="md:col-span-3">
            <PhoneIllustration />
            <p className="mt-4 font-mono text-xs text-neutral-500">{t.illustration.caption}</p>
          </div>
          <div className="md:col-span-2">
            <blockquote className="font-serif text-3xl italic leading-snug text-neutral-800 md:text-4xl">
              {t.illustration.quote}
            </blockquote>
            <p className="mt-6 font-mono text-xs text-neutral-500">{t.illustration.attribution}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ARCHITECTURE CARDS — six unique micro-visualizations
// ---------------------------------------------------------------------------

// Each card is wrapped in this shell to keep eyebrow + title consistent.
function CardShell({
  eyebrow,
  title,
  height,
  children,
}: {
  eyebrow: string;
  title: string;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 transition-colors duration-200 hover:border-neutral-300 md:p-7"
      style={{ minHeight: `${height}px` }}
    >
      <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">{eyebrow}</div>
      <div className="mt-1 font-serif text-2xl text-neutral-900">{title}</div>
      <div className="mt-auto flex flex-1 flex-col justify-end pt-4">{children}</div>
    </div>
  );
}

// --- A. Voice ---------------------------------------------------------------
const WAVE_WIDTH = 24;
const WAVE_GLYPHS = [".", ":", "+", "*", "o", "O", "#"];
function buildWaveLine(t: number): string {
  const out: string[] = new Array(WAVE_WIDTH);
  for (let i = 0; i < WAVE_WIDTH; i++) {
    const v =
      Math.sin(i * 0.45 + t * 0.004) * 0.5 +
      Math.sin(i * 0.93 + t * 0.0023) * 0.3 +
      Math.sin(i * 0.21 - t * 0.0017) * 0.2;
    const d = Math.max(0, Math.min(1, (v + 1) / 2));
    out[i] = WAVE_GLYPHS[Math.min(WAVE_GLYPHS.length - 1, Math.floor(d * WAVE_GLYPHS.length))]!;
  }
  return out.join("");
}

function VoiceCard() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [line, setLine] = useState(() => buildWaveLine(0));

  useEffect(() => {
    if (reduced) {
      setLine(buildWaveLine(0));
      return;
    }
    if (!visible) return;
    let start = performance.now();
    const id = window.setInterval(() => {
      setLine(buildWaveLine(performance.now() - start));
    }, 200);
    return () => window.clearInterval(id);
  }, [reduced, visible]);

  return (
    <CardShell eyebrow={t.cards.voice.eyebrow} title={t.cards.voice.title} height={220}>
      <pre
        aria-hidden="true"
        className="select-none whitespace-pre font-mono text-xs leading-snug tracking-widest text-emerald-600"
      >
        {line}
      </pre>
    </CardShell>
  );
}

// --- B. Booking -------------------------------------------------------------
function BookingCard() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  // 24-hour timeline.
  const [slots, setSlots] = useState<boolean[]>(() => {
    const arr = new Array(24).fill(false) as boolean[];
    // Seed with a believable filled pattern (mornings + late afternoon).
    [9, 10, 11, 13, 14, 16, 17, 18].forEach((i) => (arr[i] = true));
    return arr;
  });

  useEffect(() => {
    if (reduced || !visible) return;
    let cancelled = false;
    const tick = () => {
      const delay = 800 + Math.random() * 700;
      window.setTimeout(() => {
        if (cancelled) return;
        setSlots((prev) => {
          const filledCount = prev.filter(Boolean).length;
          if (filledCount >= 18) {
            // Reset partially.
            const arr = new Array(24).fill(false) as boolean[];
            [9, 10, 13, 16, 17].forEach((i) => (arr[i] = true));
            return arr;
          }
          const empties: number[] = [];
          for (let i = 0; i < 24; i++) if (!prev[i] && i >= 8 && i <= 20) empties.push(i);
          if (empties.length === 0) return prev;
          const pick = empties[Math.floor(Math.random() * empties.length)]!;
          const next = prev.slice();
          next[pick] = true;
          return next;
        });
        if (!cancelled) tick();
      }, delay);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [reduced, visible]);

  const filled = slots.filter(Boolean).length;

  return (
    <CardShell eyebrow={t.cards.booking.eyebrow} title={t.cards.booking.title} height={180}>
      <div className="flex items-end gap-[3px]">
        {slots.map((on, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`block h-6 w-2 rounded-sm transition-colors duration-500 ${on ? "bg-emerald-200" : "bg-neutral-100"}`}
          />
        ))}
      </div>
      <div className="mt-3 font-mono text-xs tabular-nums text-neutral-500">
        {t.cards.booking.counter(filled)}
      </div>
    </CardShell>
  );
}

// --- C. Languages -----------------------------------------------------------
function LanguagesCard() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [active, setActive] = useState(0);
  const [pulse, setPulse] = useState(0); // 0..1, cycles 2s

  useEffect(() => {
    if (reduced || !visible) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % 3), 3000);
    return () => window.clearInterval(id);
  }, [reduced, visible]);

  useEffect(() => {
    if (reduced || !visible) return;
    let start = performance.now();
    let raf: number;
    const tick = () => {
      const t2 = (performance.now() - start) % 2000;
      // 0 -> 1 -> 0 sine over 2s
      setPulse(0.5 + 0.5 * Math.sin((t2 / 2000) * Math.PI * 2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, visible]);

  const pills: Array<{ code: string }> = [{ code: "PL" }, { code: "EN" }, { code: "RU" }];

  return (
    <CardShell eyebrow={t.cards.languages.eyebrow} title={t.cards.languages.title} height={220}>
      <div className="flex flex-wrap items-center gap-2">
        {pills.map((p, i) => {
          const isActive = i === active;
          // Pulse bg between emerald-50 and emerald-100 by alpha-mixing.
          const bg = isActive
            ? `rgba(16, 185, 129, ${0.08 + 0.18 * pulse})`
            : "transparent";
          return (
            <span
              key={p.code}
              className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors duration-200 ${
                isActive ? "border-emerald-200 text-emerald-700" : "border-neutral-200 text-neutral-500"
              }`}
              style={{ background: bg }}
            >
              {p.code}
            </span>
          );
        })}
      </div>
    </CardShell>
  );
}

// --- D. Latency -------------------------------------------------------------
interface ScatterDot {
  x: number;
  y: number;
  opacity: number;
}

function LatencyCard() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();

  // Initialize 30 seeded dots so SSR + first render agree.
  const initialDots = useMemo<ScatterDot[]>(() => {
    const arr: ScatterDot[] = [];
    // Deterministic pseudo-random by index.
    for (let i = 0; i < 30; i++) {
      const x = ((i * 7) % 30) / 30; // 0..1
      const yBase = 0.3 + ((i * 13) % 100) / 250; // 0.3..0.7
      arr.push({ x, y: yBase, opacity: 1 });
    }
    return arr;
  }, []);
  const [dots, setDots] = useState<ScatterDot[]>(initialDots);

  useEffect(() => {
    if (reduced || !visible) return;
    const id = window.setInterval(() => {
      setDots((prev) => {
        const next = prev.slice(1);
        next.push({
          x: 1,
          y: 0.25 + Math.random() * 0.6,
          opacity: 0,
        });
        // Shift every dot leftwards by 1/30 and fade the oldest.
        return next.map((d, i) => ({
          x: i / (next.length - 1),
          y: d.y,
          opacity: i === next.length - 1 ? Math.min(1, d.opacity + 0.4) : i === 0 ? 0.3 : 1,
        }));
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [reduced, visible]);

  const W = 200;
  const H = 60;

  return (
    <CardShell eyebrow={t.cards.latency.eyebrow} title={t.cards.latency.title} height={200}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" aria-hidden="true">
        {/* p95 reference line */}
        <line
          x1="0"
          x2={W}
          y1={H * 0.28}
          y2={H * 0.28}
          stroke="#059669"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.7"
        />
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x * W}
            cy={d.y * H}
            r={1.4}
            fill="#059669"
            opacity={d.opacity}
          />
        ))}
      </svg>
      <div className="mt-2 font-mono text-xs tabular-nums text-neutral-500">{t.cards.latency.p95}</div>
    </CardShell>
  );
}

// --- E. SMS -----------------------------------------------------------------
function SmsCard() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [progress, setProgress] = useState(reduced ? 1 : 0); // 0..1

  useEffect(() => {
    if (reduced || !visible) return;
    let start = performance.now();
    let raf: number;
    const tick = () => {
      const elapsed = (performance.now() - start) % 4000;
      setProgress(elapsed / 4000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, visible]);

  return (
    <CardShell eyebrow={t.cards.sms.eyebrow} title={t.cards.sms.title} height={240}>
      <div className="relative w-full max-w-[200px]">
        <svg viewBox="0 0 160 60" className="h-14 w-full" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="158"
            height="58"
            rx="10"
            ry="10"
            fill="#ffffff"
            stroke="#d4d4d4"
            strokeWidth="1.2"
          />
          {/* Speaker slit */}
          <line x1="64" y1="10" x2="96" y2="10" stroke="#d4d4d4" strokeWidth="1" />
          {/* Progress bar — clipPath via foreignObject would over-engineer; rect width interpolates. */}
          <rect
            x="6"
            y="22"
            width={progress * 148}
            height="16"
            rx="4"
            fill="#a7f3d0"
          />
          <rect x="6" y="22" width="148" height="16" rx="4" fill="none" stroke="#d4d4d4" strokeWidth="0.6" />
        </svg>
        <span className="mt-2 block font-mono text-xs text-neutral-700">
          +48 501 ••• ••• 12
        </span>
      </div>
    </CardShell>
  );
}

// --- F. Memory --------------------------------------------------------------
function MemoryCard() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  // Believable shape: peak Wed/Thu.
  const seed = useMemo(() => [0.45, 0.6, 0.85, 0.95, 0.7, 0.5, 0.35], []);
  const [heights, setHeights] = useState<number[]>(seed);

  useEffect(() => {
    if (reduced || !visible) return;
    const id = window.setInterval(() => {
      setHeights((prev) =>
        prev.map((h, i) => {
          const base = seed[i]!;
          const jitter = (Math.random() - 0.5) * 0.18;
          return Math.max(0.15, Math.min(1, base + jitter));
        }),
      );
    }, 4000);
    return () => window.clearInterval(id);
  }, [reduced, visible, seed]);

  return (
    <CardShell eyebrow={t.cards.memory.eyebrow} title={t.cards.memory.title} height={200}>
      <div className="flex h-16 items-end gap-2">
        {heights.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              aria-hidden="true"
              className="w-full rounded-sm bg-emerald-500 transition-all duration-700 ease-out"
              style={{
                height: `${h * 100}%`,
                opacity: 0.3,
              }}
            />
            <span className="font-mono text-[10px] text-neutral-400">{t.cards.memory.days[i]}</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// --- Grid container ---------------------------------------------------------
function ArchitectureCards() {
  const { t } = useLang();
  return (
    <section className="bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mb-10 font-mono text-xs uppercase tracking-wider text-neutral-500">
          {t.cards.eyebrow}
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <VoiceCard />
          <BookingCard />
          <LanguagesCard />
          <LatencyCard />
          <SmsCard />
          <MemoryCard />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// LIVE TRANSCRIPT LEDGER — ruled-paper card, typewriter cadence
// ---------------------------------------------------------------------------

const LEDGER_TYPE_MS_PER_CHAR = 32;
const LEDGER_PAUSE_MS = 700;
const LEDGER_RESTART_MS = 5000;

interface RenderedLedgerLine {
  side: "clinic" | "patient";
  ts: string;
  text: string;
  done: boolean;
}

function renderLedger(elapsedMs: number, dialogue: DialogueLine[]): RenderedLedgerLine[] {
  let cursor = 0;
  const out: RenderedLedgerLine[] = [];
  for (const { side, ts, line } of dialogue) {
    const typeMs = line.length * LEDGER_TYPE_MS_PER_CHAR;
    const start = cursor;
    const end = cursor + typeMs;
    if (elapsedMs <= start) {
      out.push({ side, ts, text: "", done: false });
    } else if (elapsedMs >= end) {
      out.push({ side, ts, text: line, done: true });
    } else {
      const frac = (elapsedMs - start) / typeMs;
      out.push({ side, ts, text: line.slice(0, Math.max(0, Math.floor(line.length * frac))), done: false });
    }
    cursor = end + LEDGER_PAUSE_MS;
  }
  return out;
}

function totalLedgerMs(dialogue: DialogueLine[]): number {
  return dialogue.reduce((sum, d) => sum + d.line.length * LEDGER_TYPE_MS_PER_CHAR + LEDGER_PAUSE_MS, 0);
}

function LiveLedger() {
  const { t, lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const dialogue = DIALOGUES[lang];
  const [lines, setLines] = useState<RenderedLedgerLine[]>(() =>
    dialogue.map((d) => ({ side: d.side, ts: d.ts, text: "", done: false })),
  );
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setLines(dialogue.map((d) => ({ side: d.side, ts: d.ts, text: d.line, done: true })));
      return;
    }
    if (!visible) return;
    const fullCycle = totalLedgerMs(dialogue) + LEDGER_RESTART_MS;
    let start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) % fullCycle;
      setLines(renderLedger(elapsed, dialogue));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [reduced, visible, dialogue]);

  return (
    <section className="bg-neutral-50">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
        <div
          className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm"
          style={{
            // Ruled-paper backdrop: 2rem horizontal rules.
            backgroundImage:
              "linear-gradient(to bottom, transparent 0, transparent calc(2rem - 1px), rgba(0,0,0,0.04) calc(2rem - 1px), rgba(0,0,0,0.04) 2rem)",
            backgroundSize: "100% 2rem",
            backgroundPosition: "0 1.25rem",
          }}
        >
          <div className="mb-6 font-mono text-xs uppercase tracking-wider text-neutral-500">
            {t.ledger.eyebrow}
          </div>
          <div className="flex flex-col gap-3" style={{ minHeight: `${dialogue.length * 40}px` }}>
            {lines.map((l, i) => (
              <div key={i} className="flex items-baseline gap-4">
                <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-neutral-400">
                  {l.ts}
                </span>
                <span
                  className={
                    l.side === "clinic"
                      ? "min-w-[64px] shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-center font-mono text-xs text-emerald-700"
                      : "min-w-[64px] shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-center font-mono text-xs text-neutral-600"
                  }
                >
                  {l.side === "clinic" ? t.ledger.speakerClinic : t.ledger.speakerPatient}
                </span>
                <span className="min-w-0 flex-1 break-words font-sans text-base text-neutral-800">
                  {l.text}
                  {!l.done && l.text.length > 0 && (
                    <span
                      aria-hidden="true"
                      className="ml-[2px] inline-block h-[1em] w-[6px] translate-y-[2px] animate-pulse bg-emerald-600 align-middle"
                    />
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA + Footer
// ---------------------------------------------------------------------------

const MAILTO_DEMO =
  "mailto:kontakt@odbiera.com?subject=Odbiera%20%E2%80%94%20rozmowa&body=Klinika%3A%20%0AMiasto%3A%20%0ATelefon%3A%20";

function CtaSection() {
  const { t } = useLang();
  return (
    <section
      className="relative bg-white"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)",
        backgroundSize: "8px 8px",
      }}
    >
      <div className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <h2 className="text-5xl font-serif tracking-tight text-neutral-900 md:text-6xl">
          {t.cta.headline}
        </h2>
        <a
          href={MAILTO_DEMO}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-7 py-3.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-emerald-700"
        >
          {t.cta.button}
        </a>
        <p className="mt-6 font-mono text-xs text-neutral-500">{t.cta.contact}</p>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useLang();
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-8">
        <span className="font-serif text-base italic text-neutral-900">{t.footer.copyright}</span>
        <span className="font-mono text-xs text-neutral-500">
          {t.footer.privacy} · &copy; {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page composition
// ---------------------------------------------------------------------------

function LandingInner() {
  return (
    <div className="min-h-screen bg-white font-sans text-neutral-900">
      <Header />
      <main>
        <Hero />
        <IllustrationBlock />
        <ArchitectureCards />
        <LiveLedger />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}

export default function HomePage() {
  return (
    <LangProvider>
      <LandingInner />
    </LangProvider>
  );
}
