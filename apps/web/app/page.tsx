"use client";

// ============================================================================
// Public landing page v5 — Operator-dashboard kin.
// ----------------------------------------------------------------------------
// v4 feedback: "ASCII gone, only flying dots, generic, static, boring."
// v5 corrections:
//   - Drop the canvas dot-cloud. Replace with a BIG animated ASCII waveform
//     across the hero, refreshed at 10 Hz.
//   - Drop the 6-up card grid (a v4 generic card grid was the bigger problem
//     than the canvas). Replace with three storytelling feature rows that
//     actually explain what the product does in Polish prose.
//   - New "Jak to działa" section: 5-step animated ASCII flow with a
//     traveling active highlight (one step pulses emerald at a time).
//   - New "Czego nie robimy" honesty section (4 items).
//   - New "Logowanie kodem" note: operator + owner sign-in is a one-time
//     code from email, never a clickable link. Important enough that visitors
//     who land here from a bookmarked sign-in URL see it explained.
//   - Stylistically aligned with the operator dashboard:
//     sans-dominant, neutral-200 borders, neutral-900 primary buttons,
//     emerald-600 as the single accent. Serif used only for one big hero
//     accent line.
//
// All animations honor prefers-reduced-motion + document.visibilityState.
// PL / EN / RU. Persisted via `odbiera:lang` localStorage key.
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

// ---------------------------------------------------------------------------
// Language layer
// ---------------------------------------------------------------------------

type Lang = "pl" | "en" | "ru";
const LANG_KEY = "odbiera:lang";
const LANGS: Lang[] = ["pl", "en", "ru"];

interface DialogueLine {
  side: "clinic" | "patient";
  ts: string;
  line: string;
}

interface FeatureCopy {
  number: string;
  eyebrow: string;
  title: string;
  paragraphs: [string, string];
  bullets: [string, string, string];
}

interface LangBundle {
  htmlLang: string;
  wordmark: string;
  tagline: string;
  nav: { client: string; operator: string };
  hero: {
    line1: string;
    line2: string;
    body: string;
    statusPrefix: string;
    statusCount: (n: string) => string;
    statusLatency: string;
    statusLast: string;
  };
  flow: {
    eyebrow: string;
    title: string;
    body: string;
    steps: [string, string, string, string, string];
    captions: [string, string, string, string, string];
  };
  features: {
    eyebrow: string;
    title: string;
    body: string;
    rows: [FeatureCopy, FeatureCopy, FeatureCopy];
    sampleLabel: string;
    samples: [string, string, string];
    bookingLabel: string;
    smsLabel: string;
  };
  ledger: {
    eyebrow: string;
    title: string;
    speakerClinic: string;
    speakerPatient: string;
  };
  dont: {
    eyebrow: string;
    title: string;
    body: string;
    items: [string, string, string, string];
  };
  signin: {
    eyebrow: string;
    title: string;
    body: string;
    badge: string;
  };
  cta: {
    eyebrow: string;
    headline: string;
    body: string;
    button: string;
    contact: string;
  };
  footer: {
    privacy: string;
    copyright: string;
    region: string;
  };
}

const STRINGS: Record<Lang, LangBundle> = {
  pl: {
    htmlLang: "pl",
    wordmark: "Odbiera",
    tagline: "recepcja telefoniczna · 24 h",
    nav: { client: "Klient", operator: "Operator" },
    hero: {
      line1: "Telefon dzwoni.",
      line2: "Ktoś odbiera.",
      body: "Polskojęzyczna recepcja dla kliniki stomatologicznej. Odpowiada po polsku, angielsku i rosyjsku. Umawia wizyty, potwierdza SMSem, pracuje również wtedy, gdy klinika jest zamknięta. Bez nagrywania bez zgody, bez sprzedaży danych, bez improwizacji w sprawach medycznych.",
      statusPrefix: "AKTYWNY",
      statusCount: (n) => `${n} ROZMÓW · 14 DNI`,
      statusLatency: "ODPOWIEDŹ < 1 s",
      statusLast: "OSTATNIA: 12 s",
    },
    flow: {
      eyebrow: "JAK TO DZIAŁA",
      title: "Pięć kroków, mniej niż jedna rozmowa.",
      body: "Pacjent dzwoni, system rozumie, sprawdza grafik, rezerwuje termin, potwierdza SMSem. Bez menu, bez „naciśnij jeden\", bez automatycznej kolejki.",
      steps: [
        "ZADZWONIENIE",
        "ROZUMIENIE",
        "SPRAWDZENIE GRAFIKU",
        "REZERWACJA",
        "SMS POTWIERDZAJĄCY",
      ],
      captions: [
        "+48 22 ...",
        "„chciałbym się umówić\"",
        "czwartek 10:00 — wolne",
        "booking_id #4521",
        "wysłano do +48 501 ··· 12",
      ],
    },
    features: {
      eyebrow: "MOŻLIWOŚCI",
      title: "Trzy rzeczy, które naprawdę musi umieć recepcja.",
      body: "Reszta to detale. Najpierw musi się dogadać. Potem nie pomylić terminu. Potem przypomnieć pacjentowi.",
      rows: [
        {
          number: "01",
          eyebrow: "JĘZYK",
          title: "Mówi po polsku jak człowiek. Po angielsku i rosyjsku tak samo.",
          paragraphs: [
            "Pacjent nie musi przełączać języka. Recepcjonistka rozpoznaje, w jakim języku zaczęto rozmowę, i odpowiada w tym samym. Polski jako pierwszy, angielski i rosyjski równolegle.",
            "Nie używa drętwych zwrotów typu „proszę powtórzyć\". Jeśli czegoś nie rozumie, dopytuje naturalnie, dokładnie tak, jak zrobiłaby to żywa osoba przy słuchawce.",
          ],
          bullets: [
            "Naturalna polszczyzna, nie tłumaczenie z angielskiego.",
            "Przełączenie języka w trakcie rozmowy bez utraty kontekstu.",
            "Akcent uznawany przez native speakerów.",
          ],
        },
        {
          number: "02",
          eyebrow: "REZERWACJE",
          title: "Pyta o dogodny termin, sprawdza grafik, rezerwuje od razu.",
          paragraphs: [
            "Bez kartki, bez „zadzwonię z grafikem później\". System widzi wolne sloty w czasie rzeczywistym i potwierdza termin w trakcie tej samej rozmowy.",
            "Działa o trzeciej w nocy tak samo jak o jedenastej rano. Recepcjonistka nie chodzi na lunch i nie zapomina, że pan Kowalski prosił o godzinę po szesnastej.",
          ],
          bullets: [
            "Integracja z Booksy, Medfile, Google Calendar.",
            "Konflikt slotu wykryty zanim trafi do grafika.",
            "Pełne logi rezerwacji widoczne w panelu właściciela.",
          ],
        },
        {
          number: "03",
          eyebrow: "POTWIERDZENIE",
          title: "SMS leci w 30 sekund od zakończenia rozmowy.",
          paragraphs: [
            "Pacjent dostaje wiadomość z datą, godziną, lekarzem i adresem kliniki. Z linkiem do ICS, żeby od razu dodać do kalendarza. Z numerem do zmiany terminu, jeśli coś wypadnie.",
            "Bez podpisywania się pod kogoś innego. Wiadomość wychodzi z nadawcy „Odbiera\" albo, w pakiecie premium, spod marki kliniki.",
          ],
          bullets: [
            "Treść po polsku, kulturalna, krótka.",
            "Plik .ics dla iPhone i Androida.",
            "Numer zwrotny na zmianę lub odwołanie.",
          ],
        },
      ],
      sampleLabel: "PRZYKŁAD",
      samples: [
        "Dzień dobry, klinika Odbiera, w czym mogę pomóc?",
        "Good evening, Odbiera clinic, how can I help?",
        "Добрый вечер, клиника Odbiera, чем могу помочь?",
      ],
      bookingLabel: "GRAFIK · CZWARTEK",
      smsLabel: "SMS · 19:23:48",
    },
    ledger: {
      eyebrow: "LIVE · POLSKI · 19:23",
      title: "Tak to brzmi w praktyce.",
      speakerClinic: "Klinika",
      speakerPatient: "Pacjent",
    },
    dont: {
      eyebrow: "CZEGO NIE ROBIMY",
      title: "Świadome ograniczenia.",
      body: "Recepcjonistka, która próbuje robić wszystko, kończy źle. Nasza wie, czego nie ruszać.",
      items: [
        "Nie udziela porad medycznych. Konsultacje, diagnozy, leki — pacjent zostaje z konkretnym lekarzem.",
        "Nie nagrywa audio bez wyraźnej zgody pacjenta. Domyślnie audio nie jest zapisywane.",
        "Nie zbiera adresu e-mail w trakcie rozmowy. Tylko numer telefonu, na który leci potwierdzenie.",
        "Nie obsługuje skarg, zwrotów, ani spraw rozliczeniowych. Eskaluje do żywego pracownika.",
      ],
    },
    signin: {
      eyebrow: "LOGOWANIE",
      title: "Bez haseł. Bez linków do klikania. Kod z e-maila.",
      body: "Operator klikający „Operator\" oraz właściciel kliniki klikający „Klient\" trafią do tego samego formularza. Wpisujesz adres e-mail, dostajesz sześciocyfrowy kod, wklejasz go w formularz. Tyle. Linki z e-maila bywały blokowane przez Safari ITP, więc się ich pozbyliśmy.",
      badge: "KOD JEDNORAZOWY · 1 H",
    },
    cta: {
      eyebrow: "NASTĘPNY KROK",
      headline: "Posłuchaj, jak brzmi w Twojej klinice.",
      body: "15 minut, rozmowa wideo, na żywo testujemy recepcjonistkę dla Twojej kliniki. Bez handlowca, bez slajdów.",
      button: "Umów rozmowę →",
      contact: "kontakt@odbiera.com · Warszawa",
    },
    footer: {
      privacy: "Dane pacjentów przechowywane w Unii Europejskiej.",
      copyright: "Odbiera",
      region: "Frankfurt · Irlandia · UE",
    },
  },
  en: {
    htmlLang: "en",
    wordmark: "Odbiera",
    tagline: "phone reception · 24 h",
    nav: { client: "Client", operator: "Operator" },
    hero: {
      line1: "The phone rings.",
      line2: "Someone answers.",
      body: "A Polish-speaking receptionist for dental practices. Speaks Polish, English, and Russian. Books appointments, confirms by SMS, works the hours your clinic is closed. No recording without consent, no data resale, no improvising on anything medical.",
      statusPrefix: "ACTIVE",
      statusCount: (n) => `${n} CALLS · 14 DAYS`,
      statusLatency: "RESPONSE < 1 s",
      statusLast: "LAST: 12 s",
    },
    flow: {
      eyebrow: "HOW IT WORKS",
      title: "Five steps, less than one conversation.",
      body: "Patient calls, system understands, checks the schedule, books the slot, confirms by SMS. No menus, no \"press 1\", no automated queue.",
      steps: [
        "CALL",
        "UNDERSTANDING",
        "SCHEDULE CHECK",
        "RESERVATION",
        "CONFIRMATION SMS",
      ],
      captions: [
        "+48 22 ...",
        "\"I'd like to book\"",
        "Thursday 10:00 — free",
        "booking_id #4521",
        "sent to +48 501 ··· 12",
      ],
    },
    features: {
      eyebrow: "CAPABILITIES",
      title: "Three things a reception desk has to actually do.",
      body: "Everything else is detail. First it has to understand. Then it has to not screw up the date. Then it has to remind the patient.",
      rows: [
        {
          number: "01",
          eyebrow: "LANGUAGE",
          title: "Speaks Polish like a person. English and Russian, equally.",
          paragraphs: [
            "Patients don't switch language. The receptionist detects the language a call opens in and stays there. Polish first; English and Russian on parity, not as a translation layer.",
            "No stilted phrasing, no \"please repeat that.\" If something isn't clear, it asks back naturally, exactly the way a person at the desk would.",
          ],
          bullets: [
            "Native Polish, not translated from English.",
            "Mid-call language switch without losing context.",
            "Accent recognised by native speakers.",
          ],
        },
        {
          number: "02",
          eyebrow: "BOOKINGS",
          title: "Asks for a time, checks the schedule, books on the spot.",
          paragraphs: [
            "No callbacks, no \"I'll get back to you with the schedule.\" The system reads live availability and confirms a slot during the same call.",
            "Works at 03:00 the same way it works at 11:00. It doesn't take lunch and doesn't forget that Mr Kowalski asked for after four.",
          ],
          bullets: [
            "Booksy, Medfile, Google Calendar.",
            "Conflicts caught before they reach the diary.",
            "Full booking log in the clinic owner panel.",
          ],
        },
        {
          number: "03",
          eyebrow: "CONFIRMATION",
          title: "SMS goes out within 30 seconds of hangup.",
          paragraphs: [
            "Date, time, doctor, address. ICS link to add to a calendar. Callback number to reschedule. No spam, no marketing footer.",
            "No impersonation. Sender is \"Odbiera\" by default, or your clinic's brand on the premium tier.",
          ],
          bullets: [
            "Polish copy, short, polite.",
            ".ics for iPhone and Android.",
            "Reply number for changes or cancellations.",
          ],
        },
      ],
      sampleLabel: "SAMPLE",
      samples: [
        "Good evening, Odbiera clinic, how can I help?",
        "Dzień dobry, klinika Odbiera, w czym mogę pomóc?",
        "Добрый вечер, клиника Odbiera, чем могу помочь?",
      ],
      bookingLabel: "SCHEDULE · THURSDAY",
      smsLabel: "SMS · 19:23:48",
    },
    ledger: {
      eyebrow: "LIVE · POLISH · 19:23",
      title: "This is what it sounds like.",
      speakerClinic: "Clinic",
      speakerPatient: "Patient",
    },
    dont: {
      eyebrow: "WHAT WE DO NOT DO",
      title: "Deliberate limits.",
      body: "A receptionist that tries to do everything ends badly. Ours knows what to leave alone.",
      items: [
        "Does not give medical advice. Consultations, diagnoses, prescriptions stay with an actual doctor.",
        "Does not record audio without explicit consent. Audio is not stored by default.",
        "Does not collect email addresses during the call. Only the phone number for the confirmation SMS.",
        "Does not handle complaints, refunds, or billing disputes. Escalates to a human.",
      ],
    },
    signin: {
      eyebrow: "SIGN-IN",
      title: "No passwords. No clickable links. Code from email.",
      body: "Both \"Operator\" and \"Client\" buttons lead to the same form. You enter your email, receive a six-digit code, paste it in. That's it. Email links kept getting blocked by Safari ITP, so we removed them entirely.",
      badge: "ONE-TIME CODE · 1 H",
    },
    cta: {
      eyebrow: "NEXT STEP",
      headline: "Hear how it sounds inside your practice.",
      body: "15 minutes, video call, we run the receptionist live against your clinic's details. No salesperson, no slides.",
      button: "Book a call →",
      contact: "kontakt@odbiera.com · Warsaw",
    },
    footer: {
      privacy: "Patient data stored within the European Union.",
      copyright: "Odbiera",
      region: "Frankfurt · Ireland · EU",
    },
  },
  ru: {
    htmlLang: "ru",
    wordmark: "Odbiera",
    tagline: "приём звонков · 24 ч",
    nav: { client: "Клиент", operator: "Оператор" },
    hero: {
      line1: "Телефон звонит.",
      line2: "Кто-то отвечает.",
      body: "Польскоязычный администратор для стоматологической клиники. Говорит по-польски, по-английски и по-русски. Записывает на приём, подтверждает SMS, работает и тогда, когда клиника закрыта. Без записи без согласия, без перепродажи данных, без импровизаций в медицинских вопросах.",
      statusPrefix: "АКТИВНО",
      statusCount: (n) => `${n} ЗВОНКОВ · 14 ДН.`,
      statusLatency: "ОТВЕТ < 1 с",
      statusLast: "ПОСЛ.: 12 с",
    },
    flow: {
      eyebrow: "КАК ЭТО РАБОТАЕТ",
      title: "Пять шагов, меньше одного разговора.",
      body: "Пациент звонит, система понимает, проверяет график, бронирует слот, подтверждает SMS. Без меню, без «нажмите 1», без автоматической очереди.",
      steps: [
        "ЗВОНОК",
        "ПОНИМАНИЕ",
        "ПРОВЕРКА ГРАФИКА",
        "БРОНИРОВАНИЕ",
        "SMS С ПОДТВЕРЖДЕНИЕМ",
      ],
      captions: [
        "+48 22 ...",
        "«хочу записаться»",
        "четверг 10:00 — свободно",
        "booking_id #4521",
        "отправлено на +48 501 ··· 12",
      ],
    },
    features: {
      eyebrow: "ВОЗМОЖНОСТИ",
      title: "Три вещи, которые администратор обязан уметь.",
      body: "Остальное — детали. Сначала договориться. Потом не перепутать дату. Потом напомнить пациенту.",
      rows: [
        {
          number: "01",
          eyebrow: "ЯЗЫК",
          title: "Говорит по-польски как человек. Английский и русский — на том же уровне.",
          paragraphs: [
            "Пациент не переключает язык. Администратор определяет язык по первым словам и отвечает в нём же. Польский — основной; английский и русский — без перевода.",
            "Без шаблонных фраз. Если что-то неясно, переспрашивает естественно, ровно так, как сделал бы живой человек.",
          ],
          bullets: [
            "Естественная польская речь, не калька с английского.",
            "Смена языка по ходу разговора, без потери контекста.",
            "Акцент, который носители принимают за свой.",
          ],
        },
        {
          number: "02",
          eyebrow: "БРОНИРОВАНИЕ",
          title: "Спрашивает удобное время, сверяется с графиком, сразу бронирует.",
          paragraphs: [
            "Без перезвонов, без «уточню график и наберу». Система видит свободные слоты в реальном времени и подтверждает приём в той же беседе.",
            "В три ночи работает так же, как в одиннадцать утра. Не уходит на обед и не забывает, что пациент просил после шестнадцати.",
          ],
          bullets: [
            "Booksy, Medfile, Google Calendar.",
            "Конфликт слота отлавливается до записи в журнал.",
            "Полный лог броней в панели владельца клиники.",
          ],
        },
        {
          number: "03",
          eyebrow: "ПОДТВЕРЖДЕНИЕ",
          title: "SMS уходит в течение 30 секунд после звонка.",
          paragraphs: [
            "Дата, время, врач, адрес. Ссылка ICS, чтобы добавить в календарь. Обратный номер для переноса. Без спама и маркетинговых подписей.",
            "Без подделки отправителя. По умолчанию «Odbiera», в премиум-пакете — бренд клиники.",
          ],
          bullets: [
            "Текст по-польски, короткий, вежливый.",
            ".ics для iPhone и Android.",
            "Обратный номер для отмены или переноса.",
          ],
        },
      ],
      sampleLabel: "ПРИМЕР",
      samples: [
        "Добрый вечер, клиника Odbiera, чем могу помочь?",
        "Dzień dobry, klinika Odbiera, w czym mogę pomóc?",
        "Good evening, Odbiera clinic, how can I help?",
      ],
      bookingLabel: "ГРАФИК · ЧЕТВЕРГ",
      smsLabel: "SMS · 19:23:48",
    },
    ledger: {
      eyebrow: "LIVE · РУССКИЙ · 19:23",
      title: "Вот как это звучит.",
      speakerClinic: "Клиника",
      speakerPatient: "Пациент",
    },
    dont: {
      eyebrow: "ЧЕГО МЫ НЕ ДЕЛАЕМ",
      title: "Сознательные ограничения.",
      body: "Администратор, который пытается делать всё, заканчивает плохо. Наш знает, чего не трогать.",
      items: [
        "Не даёт медицинских советов. Консультации, диагнозы, лекарства — это к живому врачу.",
        "Не записывает аудио без явного согласия. По умолчанию аудио не сохраняется.",
        "Не собирает e-mail во время звонка. Только номер телефона для подтверждения.",
        "Не разбирается с жалобами, возвратами и оплатой. Передаёт живому сотруднику.",
      ],
    },
    signin: {
      eyebrow: "ВХОД",
      title: "Без паролей. Без ссылок. Код из письма.",
      body: "И «Оператор», и «Клиент» ведут на одну форму. Вводите e-mail, получаете шестизначный код, вставляете обратно в форму. Всё. Ссылки из писем регулярно блокировались Safari ITP, поэтому мы их убрали.",
      badge: "РАЗОВЫЙ КОД · 1 Ч",
    },
    cta: {
      eyebrow: "СЛЕДУЮЩИЙ ШАГ",
      headline: "Послушайте, как это звучит у вас в клинике.",
      body: "15 минут, видеозвонок, прогон администратора по реальным данным вашей клиники. Без продавцов и слайдов.",
      button: "Заказать звонок →",
      contact: "kontakt@odbiera.com · Варшава",
    },
    footer: {
      privacy: "Данные пациентов хранятся в пределах Европейского союза.",
      copyright: "Odbiera",
      region: "Франкфурт · Ирландия · ЕС",
    },
  },
};

// Live transcript dialogue (typewriter-rendered in LiveLedger).
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
      // SSR / private mode — ignore.
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
// Header — wordmark, lang toggle, sign-in nav
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
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-semibold tracking-tight text-neutral-900">{t.wordmark}</span>
          <span className="hidden font-mono text-[11px] uppercase tracking-wider text-neutral-400 sm:inline">
            {t.tagline}
          </span>
        </div>
        <div className="justify-self-center">
          <LangToggle />
        </div>
        <nav className="flex items-center justify-end gap-2 text-sm">
          <Link
            href={"/auth/sign-in?as=client" as Route}
            className="rounded-full border border-neutral-200 px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-neutral-700 transition-colors duration-200 hover:border-neutral-300 hover:text-neutral-900"
          >
            {t.nav.client}
          </Link>
          <Link
            href={"/auth/sign-in?as=operator" as Route}
            className="rounded-full bg-neutral-900 px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-white transition-colors duration-200 hover:bg-neutral-800"
          >
            {t.nav.operator}
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// HERO — sans headline + BIG animated ASCII waveform + status strip
// ---------------------------------------------------------------------------

// Build a 9-line ASCII waveform across `width` characters.
// Uses a tight density ramp from " " (silence) to "█" (peak).
const WAVE_RAMP = " ·:+*xX#█";
const WAVE_WIDTH = 80;
const WAVE_ROWS = 9;

function buildWaveFrame(t: number, width: number, rows: number): string[] {
  const out: string[] = [];
  const centre = (rows - 1) / 2;
  // Per-column amplitude is a sum of three sinusoids — produces a believable
  // breathing waveform that never feels purely periodic.
  for (let r = 0; r < rows; r++) {
    const row = new Array<string>(width);
    for (let c = 0; c < width; c++) {
      const x = c / width;
      const env =
        0.6 * Math.sin(x * Math.PI) + // overall envelope, peaks at centre
        0.25 * Math.sin(x * Math.PI * 3 + t * 0.0018) +
        0.15 * Math.sin(x * Math.PI * 7 - t * 0.0023);
      const amp = Math.max(0, env) * (rows - 1);
      const dist = Math.abs(r - centre);
      // Each row's density = 1 where amp >= dist, fading at the edge.
      const d = Math.max(0, Math.min(1, (amp - dist + 0.6) * 0.75));
      const idx = Math.floor(d * (WAVE_RAMP.length - 1));
      row[c] = WAVE_RAMP[idx] ?? " ";
    }
    out.push(row.join(""));
  }
  return out;
}

function HeroWave() {
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [frame, setFrame] = useState<string[]>(() =>
    buildWaveFrame(0, WAVE_WIDTH, WAVE_ROWS),
  );

  useEffect(() => {
    if (reduced) {
      setFrame(buildWaveFrame(0, WAVE_WIDTH, WAVE_ROWS));
      return;
    }
    if (!visible) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      setFrame(buildWaveFrame(performance.now() - start, WAVE_WIDTH, WAVE_ROWS));
    }, 100);
    return () => window.clearInterval(id);
  }, [reduced, visible]);

  return (
    <pre
      aria-hidden="true"
      className="select-none overflow-x-hidden whitespace-pre font-mono text-[9px] leading-[1.05] tracking-tight text-emerald-600/80 sm:text-[10px] md:text-[11px] lg:text-xs"
    >
      {frame.join("\n")}
    </pre>
  );
}

function formatThousandsNBSP(n: number): string {
  // Polish convention: NBSP as thousands separator.
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function HeroStatusStrip() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [count, setCount] = useState(2847);
  const [last, setLast] = useState(12);

  useEffect(() => {
    if (reduced || !visible) return;
    let cancelled = false;
    const scheduleCount = () => {
      const id = window.setTimeout(() => {
        if (cancelled) return;
        setCount((v) => v + 1);
        setLast(0);
        scheduleCount();
      }, 5000 + Math.random() * 3000);
      return id;
    };
    const id = scheduleCount();
    const tickLast = window.setInterval(() => {
      if (cancelled) return;
      setLast((v) => v + 1);
    }, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      window.clearInterval(tickLast);
    };
  }, [reduced, visible]);

  // Heartbeat dot opacity oscillates 0.3 → 1 → 0.3 every 2s.
  const [pulse, setPulse] = useState(1);
  useEffect(() => {
    if (reduced || !visible) return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t2 = (performance.now() - start) % 2000;
      setPulse(0.3 + 0.7 * (0.5 + 0.5 * Math.sin((t2 / 2000) * Math.PI * 2)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, visible]);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-neutral-600 sm:text-xs">
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full bg-emerald-500"
          style={{ opacity: pulse }}
        />
        {t.hero.statusPrefix}
      </span>
      <span className="tabular-nums">{t.hero.statusCount(formatThousandsNBSP(count))}</span>
      <span>{t.hero.statusLatency}</span>
      <span className="tabular-nums">
        {t.hero.statusLast.replace("12", String(last))}
      </span>
    </div>
  );
}

function Hero() {
  const { t } = useLang();
  const [shown, setShown] = useState({ a: false, b: false });
  useEffect(() => {
    const t1 = window.setTimeout(() => setShown((s) => ({ ...s, a: true })), 0);
    const t2 = window.setTimeout(() => setShown((s) => ({ ...s, b: true })), 140);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <section className="relative overflow-hidden border-b border-neutral-200 bg-white">
      {/* Subtle dot grid background, very low contrast. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(0,0,0,0.045) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-6 pb-12 pt-16 sm:pt-20">
        <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight text-neutral-900 sm:text-6xl md:text-7xl">
          <span
            className="block transition-opacity duration-700 ease-out"
            style={{ opacity: shown.a ? 1 : 0 }}
          >
            {t.hero.line1}
          </span>
          <span
            className="block text-neutral-400 transition-opacity duration-700 ease-out"
            style={{ opacity: shown.b ? 1 : 0 }}
          >
            {t.hero.line2}
          </span>
        </h1>
        <p className="mt-8 max-w-2xl text-base leading-relaxed text-neutral-700 sm:text-lg">
          {t.hero.body}
        </p>
        <HeroStatusStrip />
        <div className="mt-10 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-neutral-500 sm:text-xs">
            <span>WAVEFORM · LIVE</span>
            <span className="tabular-nums">48 kHz · mono · 16 bit</span>
          </div>
          <HeroWave />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// HOW IT WORKS — 5-step animated ASCII flow with traveling active highlight
// ---------------------------------------------------------------------------

function FlowSection() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced || !visible) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % 5);
    }, 2200);
    return () => window.clearInterval(id);
  }, [reduced, visible]);

  return (
    <section className="border-b border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-5">
            <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
              {t.flow.eyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              {t.flow.title}
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-neutral-700">
              {t.flow.body}
            </p>
          </div>

          <ol className="md:col-span-7 md:pl-4">
            {t.flow.steps.map((step, i) => {
              const isActive = i === active;
              const isPast = i < active;
              return (
                <li key={i} className="grid grid-cols-[44px_24px_1fr] items-stretch">
                  {/* index column */}
                  <div className="flex items-start pt-3 font-mono text-[10px] uppercase tracking-wider text-neutral-400 tabular-nums">
                    0{i + 1}
                  </div>
                  {/* rail column */}
                  <div className="relative flex flex-col items-center">
                    <span
                      aria-hidden="true"
                      className={`mt-3 inline-block h-3 w-3 rounded-full border transition-colors duration-300 ${
                        isActive
                          ? "border-emerald-500 bg-emerald-500"
                          : isPast
                            ? "border-emerald-200 bg-emerald-100"
                            : "border-neutral-300 bg-white"
                      }`}
                    />
                    {i < t.flow.steps.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={`mt-1 flex-1 w-px transition-colors duration-300 ${
                          isPast || isActive ? "bg-emerald-200" : "bg-neutral-200"
                        }`}
                      />
                    )}
                  </div>
                  {/* content column */}
                  <div className={`pb-8 pt-2 transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-70"}`}>
                    <div
                      className={`text-lg font-semibold tracking-tight transition-colors duration-300 ${
                        isActive ? "text-emerald-700" : "text-neutral-900"
                      }`}
                    >
                      {step}
                    </div>
                    <pre
                      aria-hidden="true"
                      className={`mt-2 select-none whitespace-pre font-mono text-xs tracking-tight transition-colors duration-300 ${
                        isActive ? "text-emerald-700" : "text-neutral-500"
                      }`}
                    >
                      {">  "}
                      {t.flow.captions[i]}
                    </pre>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FEATURES — three storytelling rows, alternating image/text orientation
// ---------------------------------------------------------------------------

// --- Feature 1 visual: language pill rotation + sample phrase typewriter ---

function LanguageVisual() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const samples = t.features.samples;
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(samples[0] ?? "");

  useEffect(() => {
    if (reduced) {
      setIdx(0);
      setTyped(samples[0] ?? "");
      return;
    }
    if (!visible) return;
    let cancelled = false;
    let timeout: number | undefined;
    let i = 0;

    const cycle = () => {
      const current = samples[i % samples.length] ?? "";
      setIdx(i % samples.length);
      // Type forward over 1.6s.
      const totalMs = 1600;
      const charDelay = totalMs / Math.max(1, current.length);
      let charPos = 0;
      setTyped("");
      const typeStep = () => {
        if (cancelled) return;
        charPos++;
        setTyped(current.slice(0, charPos));
        if (charPos < current.length) {
          timeout = window.setTimeout(typeStep, charDelay);
        } else {
          // Hold then advance.
          timeout = window.setTimeout(() => {
            if (cancelled) return;
            i++;
            cycle();
          }, 2200);
        }
      };
      typeStep();
    };
    cycle();

    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [reduced, visible, samples]);

  const pills: { code: string; lang: Lang }[] = [
    { code: "PL", lang: "pl" },
    { code: "EN", lang: "en" },
    { code: "RU", lang: "ru" },
  ];
  // Which pill matches the currently displayed phrase?
  // The samples array's index 0 is the user's current lang, then the
  // remaining two in arbitrary order. We highlight based on `idx` semantically
  // by mapping current sample text back to a language guess via the prefix.
  const currentPrefix = samples[idx]?.slice(0, 6) ?? "";
  let highlighted: Lang = "pl";
  if (currentPrefix.startsWith("Good") || currentPrefix.startsWith("Hi")) highlighted = "en";
  else if (currentPrefix.startsWith("Добр")) highlighted = "ru";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-7">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pills.map((p) => {
          const on = p.lang === highlighted;
          return (
            <span
              key={p.code}
              className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors duration-300 ${
                on
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-neutral-200 bg-white text-neutral-500"
              }`}
            >
              {p.code}
            </span>
          );
        })}
      </div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
        {t.features.sampleLabel}
      </div>
      <div className="min-h-[3.5em] text-lg leading-relaxed text-neutral-900 sm:text-xl">
        {typed}
        <span
          aria-hidden="true"
          className="ml-[2px] inline-block h-[1em] w-[6px] translate-y-[3px] bg-emerald-600 align-middle"
          style={{
            opacity: typed.length > 0 && typed.length < (samples[idx]?.length ?? 0) ? 1 : 0.25,
          }}
        />
      </div>
    </div>
  );
}

// --- Feature 2 visual: ASCII calendar grid filling slot-by-slot ---

const BOOKING_HOURS: string[] = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
];

function BookingVisual() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  // Seed: morning busy, afternoon partially open.
  const seed = useMemo<boolean[]>(
    () => BOOKING_HOURS.map((_, i) => i < 6 || (i > 9 && i % 2 === 0)),
    [],
  );
  const [slots, setSlots] = useState<boolean[]>(seed);
  // Highlighted slot index: the one that just got booked. -1 means none.
  const [justBooked, setJustBooked] = useState<number>(-1);

  useEffect(() => {
    if (reduced || !visible) return;
    let cancelled = false;
    const tick = () => {
      const delay = 1400 + Math.random() * 1100;
      window.setTimeout(() => {
        if (cancelled) return;
        setSlots((prev) => {
          const empties: number[] = [];
          for (let i = 0; i < prev.length; i++) if (!prev[i]) empties.push(i);
          if (empties.length === 0) {
            // Reset to seed gradually so it feels alive.
            setJustBooked(-1);
            return seed.slice();
          }
          const pick = empties[Math.floor(Math.random() * empties.length)] ?? 0;
          const next = prev.slice();
          next[pick] = true;
          setJustBooked(pick);
          window.setTimeout(() => {
            if (!cancelled) setJustBooked(-1);
          }, 900);
          return next;
        });
        if (!cancelled) tick();
      }, delay);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [reduced, visible, seed]);

  const filled = slots.filter(Boolean).length;
  const free = slots.length - filled;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-7">
      <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        <span>{t.features.bookingLabel}</span>
        <span className="tabular-nums">
          {free} <span className="text-neutral-400">wolnych</span>
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {slots.map((on, i) => {
          const isHighlight = i === justBooked;
          return (
            <div
              key={i}
              className={`rounded-md border px-1.5 py-2 text-center font-mono text-[10px] tabular-nums transition-colors duration-500 ${
                isHighlight
                  ? "border-emerald-400 bg-emerald-500 text-white"
                  : on
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "border-neutral-200 bg-white text-neutral-400"
              }`}
            >
              {BOOKING_HOURS[i]}
            </div>
          );
        })}
      </div>
      <div className="mt-4 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        ✓ booked &nbsp;·&nbsp; ○ free
      </div>
    </div>
  );
}

// --- Feature 3 visual: SMS ASCII phone with arriving message ---

function SmsVisual() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  // Cycle: empty 0-1s, typing 1-3s, delivered 3-7s, fade 7-8s, repeat.
  const [phase, setPhase] = useState<"empty" | "typing" | "delivered">("empty");
  const [typed, setTyped] = useState("");

  const fullMsg = useMemo(() => {
    // language-aware short SMS body.
    return {
      pl: "Czwartek 10:00, dr Kowalska. ICS w wiadomości.",
      en: "Thursday 10:00, dr Kowalska. ICS in the SMS.",
      ru: "Четверг 10:00, др Ковальская. ICS в сообщении.",
    };
  }, []);
  const { t: tBundle } = useLang();
  const langCode: Lang = tBundle.htmlLang === "pl" ? "pl" : tBundle.htmlLang === "ru" ? "ru" : "en";
  const msg = fullMsg[langCode];

  useEffect(() => {
    if (reduced) {
      setPhase("delivered");
      setTyped(msg);
      return;
    }
    if (!visible) return;
    let cancelled = false;
    const run = () => {
      setPhase("empty");
      setTyped("");
      const t1 = window.setTimeout(() => {
        if (cancelled) return;
        setPhase("typing");
        const totalMs = 1400;
        const step = totalMs / Math.max(1, msg.length);
        let i = 0;
        const tick = () => {
          if (cancelled) return;
          i++;
          setTyped(msg.slice(0, i));
          if (i < msg.length) {
            window.setTimeout(tick, step);
          } else {
            setPhase("delivered");
            window.setTimeout(() => {
              if (!cancelled) run();
            }, 4000);
          }
        };
        tick();
      }, 800);
      return () => window.clearTimeout(t1);
    };
    const cleanup = run();
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [reduced, visible, msg]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-7">
      <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        <span>{t.features.smsLabel}</span>
        <span className="tabular-nums">
          {phase === "delivered" ? "DELIVERED" : phase === "typing" ? "SENDING…" : "QUEUED"}
        </span>
      </div>
      {/* ASCII phone outline */}
      <pre
        aria-hidden="true"
        className="select-none whitespace-pre font-mono text-[10px] leading-tight text-neutral-400 sm:text-xs"
      >
{`  ╭──────────────────────────────╮
  │  ───                          │
  │                               │
  │  +48 22 ...                   │`}
      </pre>
      <div className="border-x border-neutral-300 bg-neutral-50 px-3 py-3 font-mono text-[11px] leading-snug text-neutral-800 sm:text-xs">
        {typed || <span className="text-neutral-300">…</span>}
        {phase === "typing" && (
          <span
            aria-hidden="true"
            className="ml-[2px] inline-block h-[1em] w-[5px] translate-y-[2px] animate-pulse bg-emerald-600 align-middle"
          />
        )}
      </div>
      <pre
        aria-hidden="true"
        className="select-none whitespace-pre font-mono text-[10px] leading-tight text-neutral-400 sm:text-xs"
      >
{`  │                               │
  │                               │
  │                ○              │
  ╰──────────────────────────────╯`}
      </pre>
    </div>
  );
}

// --- Feature row shell -----------------------------------------------------

function FeatureRow({
  copy,
  visual,
  reverse,
}: {
  copy: FeatureCopy;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-10 md:grid-cols-12 md:items-center md:gap-12 ${
        reverse ? "md:[&>div:first-child]:order-2" : ""
      }`}
    >
      <div className="md:col-span-6">
        <div className="flex items-baseline gap-3 font-mono text-xs uppercase tracking-wider text-neutral-500">
          <span className="text-neutral-300">{copy.number}</span>
          <span>{copy.eyebrow}</span>
        </div>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          {copy.title}
        </h3>
        <p className="mt-5 text-base leading-relaxed text-neutral-700">{copy.paragraphs[0]}</p>
        <p className="mt-3 text-base leading-relaxed text-neutral-700">{copy.paragraphs[1]}</p>
        <ul className="mt-6 space-y-2 text-sm text-neutral-700">
          {copy.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="md:col-span-6">{visual}</div>
    </div>
  );
}

function FeaturesSection() {
  const { t } = useLang();
  return (
    <section className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mb-16 max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
            {t.features.eyebrow}
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            {t.features.title}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-neutral-700">{t.features.body}</p>
        </div>
        <div className="space-y-20 sm:space-y-24">
          <FeatureRow copy={t.features.rows[0]} visual={<LanguageVisual />} />
          <FeatureRow copy={t.features.rows[1]} visual={<BookingVisual />} reverse />
          <FeatureRow copy={t.features.rows[2]} visual={<SmsVisual />} />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// LIVE TRANSCRIPT LEDGER — typewriter cadence, ruled paper card
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
    const start = performance.now();
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
    <section className="border-b border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28">
        <div className="mb-8 max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
            {t.ledger.eyebrow}
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            {t.ledger.title}
          </h2>
        </div>
        <div
          className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, transparent 0, transparent calc(2rem - 1px), rgba(0,0,0,0.04) calc(2rem - 1px), rgba(0,0,0,0.04) 2rem)",
            backgroundSize: "100% 2rem",
            backgroundPosition: "0 1.25rem",
          }}
        >
          <div className="flex flex-col gap-3" style={{ minHeight: `${dialogue.length * 40}px` }}>
            {lines.map((l, i) => (
              <div key={i} className="flex items-baseline gap-4">
                <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-neutral-400">
                  {l.ts}
                </span>
                <span
                  className={
                    l.side === "clinic"
                      ? "min-w-[72px] shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-center font-mono text-xs text-emerald-700"
                      : "min-w-[72px] shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-center font-mono text-xs text-neutral-600"
                  }
                >
                  {l.side === "clinic" ? t.ledger.speakerClinic : t.ledger.speakerPatient}
                </span>
                <span className="min-w-0 flex-1 break-words text-base text-neutral-800">
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
// "WHAT WE DO NOT DO" honesty section
// ---------------------------------------------------------------------------

function DontSection() {
  const { t } = useLang();
  return (
    <section className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-5">
            <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
              {t.dont.eyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
              {t.dont.title}
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-neutral-700">{t.dont.body}</p>
          </div>
          <ul className="md:col-span-7">
            {t.dont.items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-5 border-t border-neutral-200 py-5 first:border-t-0 first:pt-0"
              >
                <span className="mt-1 font-mono text-xs uppercase tracking-wider text-neutral-400 tabular-nums">
                  ✕ 0{i + 1}
                </span>
                <span className="text-base leading-relaxed text-neutral-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sign-in note — code, not link
// ---------------------------------------------------------------------------

function SignInNote() {
  const { t } = useLang();
  // Six-digit code display, animated to swap one digit every ~600ms — purely
  // illustrative, makes clear it's a numeric code not a link.
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [digits, setDigits] = useState<number[]>([3, 9, 1, 4, 7, 2]);

  useEffect(() => {
    if (reduced || !visible) return;
    const id = window.setInterval(() => {
      setDigits((prev) => {
        const next = prev.slice();
        const i = Math.floor(Math.random() * 6);
        next[i] = (next[i]! + 1 + Math.floor(Math.random() * 8)) % 10;
        return next;
      });
    }, 600);
    return () => window.clearInterval(id);
  }, [reduced, visible]);

  return (
    <section className="border-b border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-4xl px-6 py-20 sm:py-24">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 sm:p-10">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
              {t.signin.eyebrow}
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-700">
              {t.signin.badge}
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            {t.signin.title}
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-700">
            {t.signin.body}
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 font-mono text-2xl tabular-nums tracking-[0.4em] text-neutral-900">
            {digits.map((d, i) => (
              <span key={i} className="transition-opacity duration-200">
                {d}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={"/auth/sign-in?as=client" as Route}
              className="rounded-full border border-neutral-200 px-5 py-2 font-mono text-xs uppercase tracking-wider text-neutral-700 transition-colors duration-200 hover:border-neutral-300 hover:text-neutral-900"
            >
              {t.nav.client} →
            </Link>
            <Link
              href={"/auth/sign-in?as=operator" as Route}
              className="rounded-full bg-neutral-900 px-5 py-2 font-mono text-xs uppercase tracking-wider text-white transition-colors duration-200 hover:bg-neutral-800"
            >
              {t.nav.operator} →
            </Link>
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
    <section className="bg-white">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
          {t.cta.eyebrow}
        </div>
        <h2 className="mt-4 text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
          {t.cta.headline}
        </h2>
        <p className="mt-6 text-base leading-relaxed text-neutral-700 sm:text-lg">{t.cta.body}</p>
        <a
          href={MAILTO_DEMO}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-neutral-800"
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
        <span className="text-base font-semibold tracking-tight text-neutral-900">
          {t.footer.copyright}
        </span>
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-neutral-500">
          <span>{t.footer.privacy}</span>
          <span aria-hidden="true" className="text-neutral-300">
            ·
          </span>
          <span>{t.footer.region}</span>
          <span aria-hidden="true" className="text-neutral-300">
            ·
          </span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
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
        <FlowSection />
        <FeaturesSection />
        <LiveLedger />
        <DontSection />
        <SignInNote />
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
