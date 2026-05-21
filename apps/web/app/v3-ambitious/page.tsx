"use client";

// ============================================================================
// v3 landing — Ambitious. Cofounder.co craft level, not template.
// ----------------------------------------------------------------------------
// Direction (locked via brief 2026-05-21):
//   - Hybrid surface: warm paper for hero + narrative + integrations + footer,
//     one full-bleed dark navy section as the cinematic signature moment.
//   - Balanced pace: five sections, every block earns its place.
//   - Fully code/SVG visuals. No stock photos, no fake metrics, no glassmorphism.
//   - Polish-primary copy for a Warsaw clinic owner. EN + RU toggles.
//
// The signature moment is a single full-viewport dark frame that plays a real
// call shape: patient question → KB lookup → agent reply → calendar slot
// fills → SMS phone shows the confirmation. That sequence is the thing a
// visitor screenshots and forwards to a colleague.
//
// All motion honors prefers-reduced-motion AND document visibility. The page
// is deliberately quiet outside the dark section: the hero schematic draws
// itself once, body fades in once, and that is it. The dark section loops
// the transcript only while it is on screen.
//
// Hard rules (from CLAUDE.md + brief + memory):
//   - "AI Receptionist" wordmark only. No "Odbiera" anywhere visible.
//   - No em dashes, no emojis, no gradient text, no rounded cards.
//   - localStorage key `odbiera:lang` (internal, survives a future rebrand).
//   - Sign-in routes: /auth/sign-in?as=client | /auth/sign-in?as=operator.
//     Sign-in uses a 6-digit email code, not a magic link.
//   - EU residency note visible in the footer.
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

interface TranscriptLine {
  who: "patient" | "agent" | "tool" | "system";
  text: string;
  ts: string;
}

interface Capability {
  number: string;
  title: string;
  body: string;
  caption: string;
}

interface Integration {
  name: string;
  detail: string;
  status: string;
}

interface LangBundle {
  htmlLang: string;
  wordmark: string;
  serial: string;
  nav: { client: string; operator: string };
  hero: {
    eyebrow: string;
    line1: string;
    line2: string;
    body: string;
    ctaPrimary: string;
    ctaSecondary: string;
    metaLeft: string;
    metaCenter: string;
    metaRight: string;
    schematicCaption: string;
    schematic: {
      phone: string;
      agent: string;
      knowledge: string;
      schedule: string;
      sms: string;
      patient: string;
    };
  };
  signature: {
    eyebrow: string;
    title: string;
    sub: string;
    transcript: TranscriptLine[];
    calendarTitle: string;
    calendarSlot: string;
    calendarDoctor: string;
    calendarStatusIdle: string;
    calendarStatusBooked: string;
    smsHeader: string;
    smsTime: string;
    smsBody: string;
    smsDelivered: string;
  };
  capabilities: {
    eyebrow: string;
    title: string;
    body: string;
    rows: [Capability, Capability, Capability];
  };
  integrations: {
    eyebrow: string;
    title: string;
    body: string;
    rows: [Integration, Integration, Integration, Integration];
  };
  footer: {
    eyebrow: string;
    title: string;
    body: string;
    inputPlaceholder: string;
    inputCta: string;
    compliance: string;
    sectionLeftLabel: string;
    sectionRightLabel: string;
    copyright: string;
  };
}

const BUNDLES: Record<Lang, LangBundle> = {
  pl: {
    htmlLang: "pl",
    wordmark: "AI Receptionist",
    serial: "DOC-2026-V3 · REV 1",
    nav: { client: "Klient", operator: "Operator" },
    hero: {
      eyebrow: "RECEPCJA TELEFONICZNA · KLINIKA STOMATOLOGICZNA",
      line1: "Telefon nie jest",
      line2: "wąskim gardłem.",
      body:
        "Agent głosowy odbiera za Twoją recepcję. Odpowiada na pytania pacjentów z bazy Twojej kliniki, umawia wizyty w Booksy, potwierdza SMSem w 30 sekund. Po polsku jak rodzimy. Bez szkolenia personelu.",
      ctaPrimary: "Test w przeglądarce",
      ctaSecondary: "Umów demo",
      metaLeft: "WARSZAWA · PILOT 2026",
      metaCenter: "PL · EN · RU",
      metaRight: "ODPOWIEDŹ < 1 s",
      schematicCaption:
        "Ścieżka pojedynczego połączenia: od linii klinicznej do potwierdzenia SMS.",
      schematic: {
        phone: "Linia kliniki",
        agent: "Agent głosowy",
        knowledge: "Baza wiedzy",
        schedule: "Booksy / Medfile",
        sms: "Potwierdzenie SMS",
        patient: "Pacjent",
      },
    },
    signature: {
      eyebrow: "POŁĄCZENIE NUMER 1842 · CZWARTEK 14:32",
      title: "Patrz, jak działa.",
      sub:
        "Nie aktor, nie nagranie. Rzeczywista składnia rozmowy: pytanie pacjenta, wyszukiwanie w bazie wiedzy, odpowiedź agenta, rezerwacja w kalendarzu, SMS potwierdzający.",
      transcript: [
        { who: "patient", ts: "14:32:04", text: "Dzień dobry, czy macie umowę z NFZ?" },
        { who: "tool", ts: "14:32:05", text: "kb.search('nfz') → 2 wyniki" },
        {
          who: "agent",
          ts: "14:32:06",
          text:
            "Tak. Mamy kontrakt z NFZ dla dorosłych w zakresie ogólnostomatologicznym. Konsultacja prywatna kosztuje 150 zł. Chciałby Pan umówić wizytę?",
        },
        { who: "patient", ts: "14:32:14", text: "Tak, najlepiej jutro po piętnastej." },
        { who: "tool", ts: "14:32:15", text: "booksy.slots(2026-05-22, 15:00+) → 3 wolne" },
        {
          who: "agent",
          ts: "14:32:16",
          text:
            "Mamy jutro o piętnastej trzydzieści u doktora Kowalskiego. Pasuje?",
        },
        { who: "patient", ts: "14:32:21", text: "Pasuje." },
        { who: "tool", ts: "14:32:22", text: "booksy.book(slot=2026-05-22 15:30)" },
        { who: "tool", ts: "14:32:23", text: "sms.send(+48 600 ··· 422)" },
        { who: "system", ts: "14:32:51", text: "SMS dostarczony · 28 s po zakończeniu rozmowy" },
      ],
      calendarTitle: "Booksy · jutro",
      calendarSlot: "15:30",
      calendarDoctor: "dr Kowalski",
      calendarStatusIdle: "wolne",
      calendarStatusBooked: "zarezerwowane",
      smsHeader: "Klinika Smile",
      smsTime: "14:32",
      smsBody:
        "Wizyta umówiona: jutro 15:30, dr Kowalski. Plik ICS w załączniku. Aby przełożyć, odpisz PRZEŁÓŻ.",
      smsDelivered: "DOSTARCZONE · 28 s",
    },
    capabilities: {
      eyebrow: "CO DOSTAJESZ",
      title: "Trzy rzeczy, których agenci ogólnego przeznaczenia nie umieją.",
      body:
        "Każda z tych decyzji była drogą do podjęcia. Wymieniamy je, bo to one decydują o tym, czy pacjent zaufa głosowi w słuchawce.",
      rows: [
        {
          number: "01",
          title: "Polski jak rodzimy.",
          body:
            "Nie tłumaczenie. Agent czyta intencję w polskich końcówkach, wyłapuje gwarę pacjentów, mówi „siódemka” zamiast „ząb numer siedem”. Bo recepcja, która brzmi sztucznie, to recepcja, której pacjent nie ufa.",
          caption: "WARSTWA ONTOLOGII",
        },
        {
          number: "02",
          title: "Wiedza z Twojej kliniki.",
          body:
            "Wklejasz adres strony kliniki. System zbiera ceny, zakres usług, godziny, lekarzy i status NFZ. Polski słownik dentystyczny dodaje resztę. Jeśli agent czegoś nie wie, mówi „nie wiem”, nie zmyśla.",
          caption: "RAG · TRZY WARSTWY",
        },
        {
          number: "03",
          title: "EU od pierwszej minuty.",
          body:
            "Serwery we Frankfurcie. Baza w Irlandii. Twilio EU. Nagrania nie są zapisywane; transkrypcje tylko za zgodą pacjenta. RODO nie jest naklejką po wszystkim, tylko fundamentem projektu.",
          caption: "RODO · UE",
        },
      ],
    },
    integrations: {
      eyebrow: "INTEGRACJE",
      title: "Spina się z tym, czego już używasz.",
      body:
        "Cztery linie podpięte pod jeden agent. Bez nowego oprogramowania w recepcji.",
      rows: [
        {
          name: "Booksy",
          detail: "Podgląd wolnych slotów i rezerwacja podczas rozmowy.",
          status: "AKTYWNE",
        },
        {
          name: "Medfile",
          detail: "Pacjent w bazie, historia wizyt, dostępne terminy.",
          status: "AKTYWNE",
        },
        {
          name: "Google Calendar",
          detail: "Dla klinik bez systemu zarządzania.",
          status: "AKTYWNE",
        },
        {
          name: "SMSAPI.pl",
          detail: "Potwierdzenie z plikiem ICS w 30 sekund.",
          status: "AKTYWNE",
        },
      ],
    },
    footer: {
      eyebrow: "PRÓBA",
      title: "Wpisz adres swojej kliniki.",
      body:
        "Sprawdzimy, jak agent zabrzmi z Twoją wiedzą. Bez konta, bez instalacji. Wynik dostajesz w przeglądarce.",
      inputPlaceholder: "https://www.twoja-klinika.pl",
      inputCta: "Zobacz w przeglądarce",
      compliance:
        "Dane pacjentów przechowywane w Unii Europejskiej · Zgodne z RODO · Nagrania rozmów nie są zapisywane",
      sectionLeftLabel: "DOKUMENT",
      sectionRightLabel: "DOSTĘP",
      copyright: "© 2026 AI Receptionist · Warszawa",
    },
  },
  en: {
    htmlLang: "en",
    wordmark: "AI Receptionist",
    serial: "DOC-2026-V3 · REV 1",
    nav: { client: "Client", operator: "Operator" },
    hero: {
      eyebrow: "RECEPTION LINE · DENTAL CLINIC",
      line1: "The phone is no",
      line2: "longer the bottleneck.",
      body:
        "A voice agent answers your reception line. It replies to patients from your clinic's own knowledge base, books appointments in Booksy, and sends an SMS confirmation in thirty seconds. Natural Polish, English, and Russian. No staff training.",
      ctaPrimary: "Test in browser",
      ctaSecondary: "Book a demo",
      metaLeft: "WARSAW · 2026 PILOT",
      metaCenter: "PL · EN · RU",
      metaRight: "RESPONSE < 1 s",
      schematicCaption:
        "A single call, end to end: from the clinic line to a confirmed SMS.",
      schematic: {
        phone: "Clinic line",
        agent: "Voice agent",
        knowledge: "Knowledge base",
        schedule: "Booksy / Medfile",
        sms: "SMS confirmation",
        patient: "Patient",
      },
    },
    signature: {
      eyebrow: "CALL NUMBER 1842 · THURSDAY 14:32",
      title: "Watch it work.",
      sub:
        "Not an actor, not a recording. A real conversation shape: the patient's question, a knowledge-base lookup, the agent's reply, a calendar booking, the confirmation SMS.",
      transcript: [
        { who: "patient", ts: "14:32:04", text: "Hi, do you take NFZ insurance?" },
        { who: "tool", ts: "14:32:05", text: "kb.search('nfz') → 2 hits" },
        {
          who: "agent",
          ts: "14:32:06",
          text:
            "Yes. We have an NFZ contract for general adult dentistry. A private consultation is 150 zloty. Would you like to book?",
        },
        { who: "patient", ts: "14:32:14", text: "Yes, tomorrow after three would be ideal." },
        { who: "tool", ts: "14:32:15", text: "booksy.slots(2026-05-22, 15:00+) → 3 free" },
        {
          who: "agent",
          ts: "14:32:16",
          text:
            "Tomorrow at fifteen-thirty with Dr Kowalski. Does that work?",
        },
        { who: "patient", ts: "14:32:21", text: "That works." },
        { who: "tool", ts: "14:32:22", text: "booksy.book(slot=2026-05-22 15:30)" },
        { who: "tool", ts: "14:32:23", text: "sms.send(+48 600 ··· 422)" },
        { who: "system", ts: "14:32:51", text: "SMS delivered · 28 s after hang-up" },
      ],
      calendarTitle: "Booksy · tomorrow",
      calendarSlot: "15:30",
      calendarDoctor: "Dr Kowalski",
      calendarStatusIdle: "free",
      calendarStatusBooked: "booked",
      smsHeader: "Klinika Smile",
      smsTime: "14:32",
      smsBody:
        "Appointment booked: tomorrow 15:30, Dr Kowalski. ICS file attached. To reschedule, reply RESCHEDULE.",
      smsDelivered: "DELIVERED · 28 s",
    },
    capabilities: {
      eyebrow: "WHAT YOU GET",
      title: "Three things general-purpose agents cannot do.",
      body:
        "Each of these was a fork in the road. We list them because they decide whether a patient trusts the voice on the line.",
      rows: [
        {
          number: "01",
          title: "Native Polish, not translated.",
          body:
            "The agent reads intent in Polish inflections, picks up patient slang, says \"siódemka\" instead of \"tooth number seven.\" Reception that sounds synthetic is reception a patient does not trust.",
          caption: "ONTOLOGY LAYER",
        },
        {
          number: "02",
          title: "Knowledge from your clinic.",
          body:
            "Paste your clinic's URL. The system extracts prices, services, hours, doctors, and NFZ status. A Polish dental ontology fills the gaps. If the agent does not know, it says so. It does not invent.",
          caption: "RAG · THREE LAYERS",
        },
        {
          number: "03",
          title: "EU from minute one.",
          body:
            "Servers in Frankfurt. Database in Ireland. Twilio EU media region. Recordings are never stored; transcripts only with patient consent. GDPR is not a sticker added later, it is the foundation.",
          caption: "GDPR · EU",
        },
      ],
    },
    integrations: {
      eyebrow: "INTEGRATIONS",
      title: "Plugs into what you already use.",
      body: "Four lines wired to one agent. No new software at the front desk.",
      rows: [
        {
          name: "Booksy",
          detail: "Live slot lookup and booking during the call.",
          status: "LIVE",
        },
        {
          name: "Medfile",
          detail: "Patient lookup, visit history, available slots.",
          status: "LIVE",
        },
        {
          name: "Google Calendar",
          detail: "For clinics without a practice management system.",
          status: "LIVE",
        },
        {
          name: "SMSAPI.pl",
          detail: "Confirmation with an ICS file in 30 seconds.",
          status: "LIVE",
        },
      ],
    },
    footer: {
      eyebrow: "TRIAL",
      title: "Paste your clinic's address.",
      body:
        "We will show you how the agent sounds with your knowledge. No account, no install. Result in your browser.",
      inputPlaceholder: "https://your-clinic.com",
      inputCta: "Open in browser",
      compliance:
        "Patient data stored in the European Union · GDPR compliant · Call recordings never saved",
      sectionLeftLabel: "DOCUMENT",
      sectionRightLabel: "ACCESS",
      copyright: "© 2026 AI Receptionist · Warsaw",
    },
  },
  ru: {
    htmlLang: "ru",
    wordmark: "AI Receptionist",
    serial: "DOC-2026-V3 · REV 1",
    nav: { client: "Клиент", operator: "Оператор" },
    hero: {
      eyebrow: "ТЕЛЕФОННАЯ СТОЙКА · СТОМАТОЛОГИЧЕСКАЯ КЛИНИКА",
      line1: "Телефон больше",
      line2: "не узкое место.",
      body:
        "Голосовой агент отвечает за стойку регистрации. Говорит по-польски как родной, отвечает пациентам по базе знаний клиники, бронирует приёмы в Booksy и присылает SMS-подтверждение за тридцать секунд. Без обучения персонала.",
      ctaPrimary: "Тест в браузере",
      ctaSecondary: "Записаться на демо",
      metaLeft: "ВАРШАВА · ПИЛОТ 2026",
      metaCenter: "PL · EN · RU",
      metaRight: "ОТВЕТ < 1 с",
      schematicCaption:
        "Один звонок целиком: от линии клиники до подтверждённого SMS.",
      schematic: {
        phone: "Линия клиники",
        agent: "Голосовой агент",
        knowledge: "База знаний",
        schedule: "Booksy / Medfile",
        sms: "SMS-подтверждение",
        patient: "Пациент",
      },
    },
    signature: {
      eyebrow: "ЗВОНОК НОМЕР 1842 · ЧЕТВЕРГ 14:32",
      title: "Смотри, как работает.",
      sub:
        "Не актёр, не запись. Реальная форма разговора: вопрос пациента, поиск по базе знаний, ответ агента, бронирование в календаре, SMS-подтверждение.",
      transcript: [
        { who: "patient", ts: "14:32:04", text: "Здравствуйте, у вас есть договор с NFZ?" },
        { who: "tool", ts: "14:32:05", text: "kb.search('nfz') → 2 результата" },
        {
          who: "agent",
          ts: "14:32:06",
          text:
            "Да. У нас контракт с NFZ на общую стоматологию для взрослых. Платная консультация — 150 злотых. Записать вас?",
        },
        { who: "patient", ts: "14:32:14", text: "Да, лучше завтра после пятнадцати." },
        { who: "tool", ts: "14:32:15", text: "booksy.slots(2026-05-22, 15:00+) → 3 свободно" },
        {
          who: "agent",
          ts: "14:32:16",
          text: "Завтра в пятнадцать тридцать у доктора Ковальского. Подходит?",
        },
        { who: "patient", ts: "14:32:21", text: "Подходит." },
        { who: "tool", ts: "14:32:22", text: "booksy.book(slot=2026-05-22 15:30)" },
        { who: "tool", ts: "14:32:23", text: "sms.send(+48 600 ··· 422)" },
        { who: "system", ts: "14:32:51", text: "SMS доставлено · 28 с после звонка" },
      ],
      calendarTitle: "Booksy · завтра",
      calendarSlot: "15:30",
      calendarDoctor: "д-р Ковальский",
      calendarStatusIdle: "свободно",
      calendarStatusBooked: "забронировано",
      smsHeader: "Klinika Smile",
      smsTime: "14:32",
      smsBody:
        "Запись на приём: завтра 15:30, д-р Ковальский. Файл ICS во вложении. Перенести — ответьте ПЕРЕНОС.",
      smsDelivered: "ДОСТАВЛЕНО · 28 с",
    },
    capabilities: {
      eyebrow: "ЧТО ВЫ ПОЛУЧАЕТЕ",
      title: "Три вещи, которые универсальные агенты делать не умеют.",
      body:
        "Каждое из этих решений было развилкой. Перечисляем, потому что именно они определяют, доверится ли пациент голосу в трубке.",
      rows: [
        {
          number: "01",
          title: "Польский как родной.",
          body:
            "Не перевод. Агент читает намерение в польских окончаниях, понимает разговорные обороты пациентов, говорит „siódemka” вместо „зуб номер семь”. Стойка, которая звучит искусственно, не вызывает доверия.",
          caption: "СЛОЙ ОНТОЛОГИИ",
        },
        {
          number: "02",
          title: "Знания вашей клиники.",
          body:
            "Вставьте адрес сайта клиники. Система соберёт цены, перечень услуг, часы, врачей и статус NFZ. Польский стоматологический словарь добавит остальное. Если агент чего-то не знает, он так и скажет.",
          caption: "RAG · ТРИ СЛОЯ",
        },
        {
          number: "03",
          title: "ЕС с первой минуты.",
          body:
            "Серверы во Франкфурте. База в Ирландии. Twilio EU. Записи звонков не сохраняются; транскрипты — только с согласия пациента. GDPR не наклейка, а фундамент проекта.",
          caption: "GDPR · ЕС",
        },
      ],
    },
    integrations: {
      eyebrow: "ИНТЕГРАЦИИ",
      title: "Подключается к тому, что у вас уже есть.",
      body: "Четыре линии под одного агента. Никакого нового ПО в регистратуре.",
      rows: [
        {
          name: "Booksy",
          detail: "Проверка и бронирование свободных слотов во время звонка.",
          status: "АКТИВНО",
        },
        {
          name: "Medfile",
          detail: "Пациент в базе, история визитов, свободные даты.",
          status: "АКТИВНО",
        },
        {
          name: "Google Calendar",
          detail: "Для клиник без системы управления.",
          status: "АКТИВНО",
        },
        {
          name: "SMSAPI.pl",
          detail: "Подтверждение с файлом ICS за 30 секунд.",
          status: "АКТИВНО",
        },
      ],
    },
    footer: {
      eyebrow: "ПРОБА",
      title: "Введите адрес вашей клиники.",
      body:
        "Покажем, как агент звучит с вашими знаниями. Без аккаунта, без установки. Результат в браузере.",
      inputPlaceholder: "https://www.vasha-klinika.pl",
      inputCta: "Открыть в браузере",
      compliance:
        "Данные пациентов хранятся в Евросоюзе · Соответствие GDPR · Записи звонков не сохраняются",
      sectionLeftLabel: "ДОКУМЕНТ",
      sectionRightLabel: "ДОСТУП",
      copyright: "© 2026 AI Receptionist · Варшава",
    },
  },
};

// ---------------------------------------------------------------------------
// Lang context + persistence
// ---------------------------------------------------------------------------

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: LangBundle;
}>({ lang: "pl", setLang: () => {}, t: BUNDLES.pl });

function useLang() {
  return useContext(LangContext);
}

// ---------------------------------------------------------------------------
// Motion + visibility hooks
// ---------------------------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function useInView<T extends HTMLElement>(threshold = 0.25): [
  React.RefObject<T | null>,
  boolean,
] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
  const { t, lang, setLang } = useLang();
  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{
        backgroundColor: "rgba(246, 244, 238, 0.92)",
        backdropFilter: "saturate(140%) blur(6px)",
        borderColor: "#8E9499",
      }}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <span
            className="font-sans"
            style={{
              color: "#0F1418",
              fontWeight: 600,
              fontSize: "0.9375rem",
              letterSpacing: "0.02em",
            }}
          >
            {t.wordmark}
          </span>
          <span
            className="hidden sm:inline font-mono"
            style={{
              color: "#8E9499",
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {t.serial}
          </span>
        </div>
        <nav className="flex items-center gap-2 sm:gap-3">
          <div
            className="flex items-center font-mono"
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {LANGS.map((l, i) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className="px-1.5 py-1 transition-colors"
                style={{
                  color: lang === l ? "#0F1418" : "#8E9499",
                  borderRight: i < LANGS.length - 1 ? "1px solid #D6D2C8" : "none",
                  cursor: "pointer",
                }}
                aria-label={`Language: ${l.toUpperCase()}`}
                aria-pressed={lang === l}
              >
                {l}
              </button>
            ))}
          </div>
          <Link
            href={"/auth/sign-in?as=client" as Route}
            className="hidden sm:inline-flex items-center px-4 py-2 font-mono transition-colors"
            style={{
              border: "1px solid #0F1418",
              borderRadius: 9999,
              color: "#0F1418",
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              backgroundColor: "transparent",
            }}
          >
            {t.nav.client}
          </Link>
          <Link
            href={"/auth/sign-in?as=operator" as Route}
            className="inline-flex items-center px-4 py-2 font-mono transition-colors"
            style={{
              backgroundColor: "#0F1418",
              color: "#F6F4EE",
              borderRadius: 9999,
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {t.nav.operator}
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero schematic — call flow diagram, draws in via stroke-dasharray
// ---------------------------------------------------------------------------

function HeroSchematic({ reduced }: { reduced: boolean }) {
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const drawIn = !reduced && mounted;
  // Each path's length is roughly its visible length. stroke-dasharray /
  // -dashoffset is set to that length so the path draws in cleanly.
  const pathStyle = (length: number, delay: number): React.CSSProperties => ({
    strokeDasharray: length,
    strokeDashoffset: drawIn ? 0 : length,
    transition: `stroke-dashoffset 1200ms cubic-bezier(0.2,0.7,0.2,1) ${delay}ms`,
  });
  return (
    <figure className="w-full">
      <svg
        viewBox="0 0 800 360"
        className="w-full h-auto"
        role="img"
        aria-label={t.hero.schematicCaption}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#0F1418" />
          </marker>
        </defs>

        {/* Patient → Clinic line */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <circle cx="70" cy="60" r="22" style={pathStyle(140, 0)} />
          <line x1="70" y1="82" x2="70" y2="138" markerEnd="url(#arrow)" style={pathStyle(56, 120)} />
          <rect x="32" y="138" width="76" height="44" style={pathStyle(240, 220)} />
          <line x1="108" y1="160" x2="248" y2="160" markerEnd="url(#arrow)" style={pathStyle(140, 360)} />
        </g>

        {/* Agent node (centerpiece) */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <rect x="248" y="120" width="180" height="80" style={pathStyle(520, 460)} />
        </g>
        <g stroke="#1A4FB8" strokeWidth="1.25" fill="none">
          <line x1="258" y1="135" x2="418" y2="135" style={pathStyle(160, 580)} />
        </g>

        {/* Agent → Knowledge base (top branch) */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <line x1="338" y1="120" x2="338" y2="56" markerEnd="url(#arrow)" style={pathStyle(64, 660)} />
          <rect x="278" y="14" width="120" height="42" style={pathStyle(324, 720)} />
        </g>

        {/* Agent → Scheduler (right branch) */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <line x1="428" y1="160" x2="528" y2="160" markerEnd="url(#arrow)" style={pathStyle(100, 800)} />
          <rect x="528" y="138" width="120" height="44" style={pathStyle(328, 860)} />
        </g>

        {/* Agent → SMS (bottom-right branch) */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <line x1="378" y1="200" x2="378" y2="262" markerEnd="url(#arrow)" style={pathStyle(62, 940)} />
          <rect x="318" y="262" width="120" height="42" style={pathStyle(324, 1000)} />
        </g>

        {/* SMS → Patient (closes the loop) */}
        <g stroke="#1A4FB8" strokeWidth="1.25" fill="none">
          <line x1="318" y1="284" x2="120" y2="284" style={pathStyle(198, 1080)} />
          <line x1="120" y1="284" x2="120" y2="182" markerEnd="url(#arrow)" style={pathStyle(102, 1160)} />
        </g>

        {/* Text labels — pure type, no animation */}
        <g
          fontFamily="var(--font-mono), ui-monospace, monospace"
          fontSize="10"
          fill="#0F1418"
          letterSpacing="1.4"
          style={{
            opacity: drawIn ? 1 : 0,
            transition: "opacity 700ms ease 1200ms",
          }}
        >
          <text x="70" y="64" textAnchor="middle">PATIENT</text>
          <text x="70" y="164" textAnchor="middle">PSTN</text>
          <text x="338" y="166" textAnchor="middle" letterSpacing="2">AGENT</text>
          <text x="338" y="40" textAnchor="middle" letterSpacing="2">KB</text>
          <text x="588" y="164" textAnchor="middle" letterSpacing="2">BOOKSY</text>
          <text x="378" y="288" textAnchor="middle" letterSpacing="2">SMS</text>
        </g>

        {/* Side captions (Polish/EN/RU localized labels) */}
        <g
          fontFamily="var(--font-sans), system-ui"
          fontSize="11"
          fill="#4A5358"
          style={{
            opacity: drawIn ? 1 : 0,
            transition: "opacity 700ms ease 1300ms",
          }}
        >
          <text x="70" y="34">{t.hero.schematic.patient}</text>
          <text x="32" y="200">{t.hero.schematic.phone}</text>
          <text x="278" y="226">{t.hero.schematic.agent}</text>
          <text x="278" y="6"></text>
          <text x="278" y="76"></text>
          <text x="528" y="200">{t.hero.schematic.schedule}</text>
          <text x="318" y="326">{t.hero.schematic.sms}</text>
        </g>
      </svg>
      <figcaption
        className="mt-4 font-mono"
        style={{
          color: "#8E9499",
          fontSize: "0.6875rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        FIG 01 · {t.hero.schematicCaption}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Hero section (light, paper background)
// ---------------------------------------------------------------------------

function HeroSection() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  return (
    <section
      className="relative"
      style={{ backgroundColor: "#F6F4EE", color: "#0F1418" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 pt-12 pb-20 sm:pt-20 sm:pb-28">
        {/* Marginalia row */}
        <div
          className="grid grid-cols-3 font-mono pb-8 sm:pb-12"
          style={{
            color: "#8E9499",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderBottom: "1px solid #D6D2C8",
          }}
        >
          <span>{t.hero.metaLeft}</span>
          <span className="text-center">{t.hero.metaCenter}</span>
          <span className="text-right">{t.hero.metaRight}</span>
        </div>

        {/* Eyebrow */}
        <p
          className="mt-10 font-mono"
          style={{
            color: "#1A4FB8",
            fontSize: "0.6875rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {t.hero.eyebrow}
        </p>

        {/* Display headline */}
        <h1
          className="mt-6"
          style={{
            fontFamily: "var(--font-display), ui-serif, Georgia, serif",
            fontWeight: 400,
            fontSize: "clamp(2.5rem, 9vw, 7.5rem)",
            lineHeight: 0.92,
            letterSpacing: "-0.025em",
            color: "#0F1418",
            opacity: reduced ? 1 : undefined,
            animation: reduced ? "none" : "v3-fade-up 900ms cubic-bezier(0.2,0.7,0.2,1) both",
          }}
        >
          {t.hero.line1}
          <br />
          {t.hero.line2}
        </h1>

        <div className="mt-10 grid gap-10 sm:gap-16 md:grid-cols-12">
          <div className="md:col-span-5">
            <p
              className="font-sans"
              style={{
                color: "#4A5358",
                fontSize: "1.0625rem",
                lineHeight: 1.65,
                maxWidth: "44ch",
              }}
            >
              {t.hero.body}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/test/demo-agent"
                className="inline-flex items-center px-6 py-3 font-mono"
                style={{
                  backgroundColor: "#0F1418",
                  color: "#F6F4EE",
                  borderRadius: 9999,
                  fontSize: "0.6875rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {t.hero.ctaPrimary}
              </Link>
              <a
                href="mailto:hello@ai-receptionist.eu?subject=Demo"
                className="inline-flex items-center px-6 py-3 font-mono"
                style={{
                  border: "1px solid #0F1418",
                  color: "#0F1418",
                  borderRadius: 9999,
                  fontSize: "0.6875rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  backgroundColor: "transparent",
                }}
              >
                {t.hero.ctaSecondary}
              </a>
            </div>
          </div>

          <div className="md:col-span-7">
            <HeroSchematic reduced={reduced} />
          </div>
        </div>
      </div>

      {/* Heavy rule transitions into the dark section */}
      <div style={{ height: 2, backgroundColor: "#1A1F24" }} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Signature dark section — transcript playback + calendar + SMS
// ---------------------------------------------------------------------------

function TranscriptPlayer() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const lines = t.signature.transcript;
  // index of the last line that should be visible
  const [cursor, setCursor] = useState(reduced ? lines.length : 0);
  // re-run when language changes
  useEffect(() => {
    setCursor(reduced ? lines.length : 0);
  }, [reduced, lines]);

  useEffect(() => {
    if (reduced) {
      setCursor(lines.length);
      return;
    }
    if (!inView) return;
    let frame = 0;
    const timers: number[] = [];
    // start a single playback pass
    const playOnce = () => {
      lines.forEach((_, i) => {
        const id = window.setTimeout(() => {
          if (document.visibilityState === "visible") {
            setCursor((c) => Math.max(c, i + 1));
          }
        }, i * 850);
        timers.push(id);
      });
      // restart after a pause
      const tail = window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        setCursor(0);
        frame = window.setTimeout(playOnce, 600) as unknown as number;
      }, lines.length * 850 + 4500);
      timers.push(tail);
    };
    playOnce();
    return () => {
      timers.forEach((id) => clearTimeout(id));
      clearTimeout(frame);
    };
  }, [inView, lines, reduced]);

  const bookingHit = cursor >= 8; // line 7 (0-indexed) is booksy.book

  return (
    <div ref={ref} className="grid gap-8 lg:gap-12 lg:grid-cols-12">
      {/* Transcript pane */}
      <div className="lg:col-span-7">
        <div
          className="font-mono"
          style={{
            color: "#9CA8B6",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid #1F2933",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>TRANSKRYPT · LIVE</span>
          <span style={{ color: "#5D87E8" }}>● REC OFF</span>
        </div>
        <ol
          className="mt-5 space-y-3 font-mono"
          style={{
            color: "#E8E4D8",
            fontSize: "0.8125rem",
            lineHeight: 1.55,
            minHeight: "26rem",
          }}
        >
          {lines.map((line, i) => {
            const visible = i < cursor;
            const isAgent = line.who === "agent";
            const isPatient = line.who === "patient";
            const isTool = line.who === "tool";
            const isSystem = line.who === "system";
            const speakerColor = isAgent
              ? "#E8E4D8"
              : isPatient
              ? "#A7B4C5"
              : isTool
              ? "#5D87E8"
              : "#8AA76F";
            const speakerLabel = isAgent
              ? "AGENT"
              : isPatient
              ? "PACJENT"
              : isTool
              ? "TOOL"
              : "SYSTEM";
            return (
              <li
                key={`${i}-${line.ts}`}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(4px)",
                  transition:
                    "opacity 480ms cubic-bezier(0.2,0.7,0.2,1), transform 480ms cubic-bezier(0.2,0.7,0.2,1)",
                }}
              >
                <div className="flex items-baseline gap-3">
                  <span
                    style={{
                      color: "#5C6B7A",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.06em",
                      width: "5.5rem",
                      flexShrink: 0,
                    }}
                  >
                    {line.ts}
                  </span>
                  <span
                    style={{
                      color: speakerColor,
                      fontSize: "0.6875rem",
                      letterSpacing: "0.12em",
                      width: "5.5rem",
                      flexShrink: 0,
                    }}
                  >
                    {speakerLabel}
                  </span>
                  <span
                    style={{
                      color: isTool ? "#7FA0E0" : isSystem ? "#8AA76F" : "#E8E4D8",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {line.text}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Calendar + SMS pane */}
      <div className="lg:col-span-5 grid gap-6">
        {/* Calendar */}
        <div>
          <div
            className="font-mono pb-3"
            style={{
              color: "#9CA8B6",
              fontSize: "0.6875rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderBottom: "1px solid #1F2933",
            }}
          >
            {t.signature.calendarTitle}
          </div>
          <ul className="mt-4 space-y-1.5 font-mono">
            {["15:00", "15:15", "15:30", "15:45", "16:00", "16:15"].map((time) => {
              const isHit = time === t.signature.calendarSlot;
              const lit = isHit && bookingHit;
              return (
                <li
                  key={time}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{
                    border: lit ? "1px solid #4A8B5C" : "1px solid #1F2933",
                    backgroundColor: lit ? "rgba(74,139,92,0.08)" : "transparent",
                    color: lit ? "#9BD2A8" : isHit ? "#A7B4C5" : "#5C6B7A",
                    fontSize: "0.8125rem",
                    transition: "all 280ms cubic-bezier(0.2,0.7,0.2,1)",
                  }}
                >
                  <span>{time}</span>
                  <span style={{ fontSize: "0.6875rem", letterSpacing: "0.12em" }}>
                    {lit
                      ? t.signature.calendarStatusBooked.toUpperCase()
                      : t.signature.calendarStatusIdle.toUpperCase()}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* SMS phone mock */}
        <SmsPanel delivered={cursor >= lines.length} />
      </div>
    </div>
  );
}

function SmsPanel({ delivered }: { delivered: boolean }) {
  const { t } = useLang();
  return (
    <div>
      <div
        className="font-mono pb-3"
        style={{
          color: "#9CA8B6",
          fontSize: "0.6875rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          borderBottom: "1px solid #1F2933",
        }}
      >
        SMS · SMSAPI.PL
      </div>
      <div
        className="mt-4 px-4 py-4"
        style={{
          border: "1px solid #1F2933",
          backgroundColor: "rgba(232,228,216,0.04)",
          opacity: delivered ? 1 : 0.4,
          transition: "opacity 700ms cubic-bezier(0.2,0.7,0.2,1)",
        }}
      >
        <div className="flex items-baseline justify-between font-mono"
          style={{
            color: "#9CA8B6",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            paddingBottom: "0.5rem",
            borderBottom: "1px dashed #1F2933",
            marginBottom: "0.75rem",
          }}
        >
          <span>{t.signature.smsHeader}</span>
          <span>{t.signature.smsTime}</span>
        </div>
        <p
          style={{
            color: "#E8E4D8",
            fontSize: "0.8125rem",
            lineHeight: 1.55,
            fontFamily: "var(--font-sans), system-ui",
          }}
        >
          {t.signature.smsBody}
        </p>
        <div
          className="mt-3 font-mono"
          style={{
            color: delivered ? "#9BD2A8" : "#5C6B7A",
            fontSize: "0.6875rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {delivered ? `▌ ${t.signature.smsDelivered}` : "▌ ..."}
        </div>
      </div>
    </div>
  );
}

function SignatureSection() {
  const { t } = useLang();
  return (
    <section style={{ backgroundColor: "#0B0F14", color: "#E8E4D8" }}>
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-20 sm:py-28">
        <div
          className="grid grid-cols-3 font-mono pb-8"
          style={{
            color: "#5C6B7A",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderBottom: "1px solid #1F2933",
          }}
        >
          <span>{t.signature.eyebrow}</span>
          <span className="text-center">SIGNATURE</span>
          <span className="text-right">FIG 02</span>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <h2
              style={{
                fontFamily: "var(--font-display), ui-serif, Georgia, serif",
                fontWeight: 400,
                fontSize: "clamp(2rem, 5vw, 3.75rem)",
                lineHeight: 1.02,
                letterSpacing: "-0.02em",
                color: "#F6F4EE",
              }}
            >
              {t.signature.title}
            </h2>
            <p
              className="mt-6 font-sans"
              style={{
                color: "#A7B4C5",
                fontSize: "1rem",
                lineHeight: 1.65,
                maxWidth: "40ch",
              }}
            >
              {t.signature.sub}
            </p>
          </div>
          <div className="lg:col-span-7">
            <TranscriptPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Capabilities section (light, three numbered rows with inline schematics)
// ---------------------------------------------------------------------------

function CapabilityIllustration({ index }: { index: number }) {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const draw = !reduced && mounted;
  const t = (length: number, delay: number): React.CSSProperties => ({
    strokeDasharray: length,
    strokeDashoffset: draw ? 0 : length,
    transition: `stroke-dashoffset 1100ms cubic-bezier(0.2,0.7,0.2,1) ${delay}ms`,
  });

  if (index === 0) {
    // Ontology — Polish ending diagram: stem + branches
    return (
      <svg viewBox="0 0 220 140" className="w-full h-auto" aria-hidden="true">
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <line x1="20" y1="120" x2="200" y2="120" style={t(180, 0)} />
          <line x1="60" y1="120" x2="60" y2="86" style={t(34, 200)} />
          <line x1="110" y1="120" x2="110" y2="60" style={t(60, 320)} />
          <line x1="160" y1="120" x2="160" y2="40" style={t(80, 440)} />
        </g>
        <g
          fontFamily="var(--font-mono), ui-monospace, monospace"
          fontSize="9"
          fill="#0F1418"
          letterSpacing="1.2"
          style={{ opacity: draw ? 1 : 0, transition: "opacity 600ms ease 700ms" }}
        >
          <text x="60" y="80" textAnchor="middle">ZĄB</text>
          <text x="110" y="54" textAnchor="middle">ZĘBY</text>
          <text x="160" y="34" textAnchor="middle">SIÓDEMKA</text>
        </g>
        <g
          fontFamily="var(--font-sans), system-ui"
          fontSize="9"
          fill="#4A5358"
          style={{ opacity: draw ? 1 : 0, transition: "opacity 600ms ease 850ms" }}
        >
          <text x="20" y="134">root</text>
        </g>
      </svg>
    );
  }

  if (index === 1) {
    // Knowledge — three stacked KB sources flowing into one
    return (
      <svg viewBox="0 0 220 140" className="w-full h-auto" aria-hidden="true">
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <rect x="20" y="20" width="60" height="22" style={t(164, 0)} />
          <rect x="20" y="56" width="60" height="22" style={t(164, 160)} />
          <rect x="20" y="92" width="60" height="22" style={t(164, 320)} />
          <line x1="80" y1="31" x2="140" y2="68" style={t(72, 500)} />
          <line x1="80" y1="67" x2="140" y2="69" style={t(60, 620)} />
          <line x1="80" y1="103" x2="140" y2="70" style={t(72, 740)} />
          <rect x="140" y="58" width="60" height="22" style={t(164, 860)} />
        </g>
        <g
          fontFamily="var(--font-mono), ui-monospace, monospace"
          fontSize="8"
          fill="#0F1418"
          letterSpacing="1"
          style={{ opacity: draw ? 1 : 0, transition: "opacity 600ms ease 1000ms" }}
        >
          <text x="50" y="34" textAnchor="middle">ONTOLOGIA</text>
          <text x="50" y="70" textAnchor="middle">STRONA</text>
          <text x="50" y="106" textAnchor="middle">FORMULARZ</text>
          <text x="170" y="72" textAnchor="middle">RAG</text>
        </g>
      </svg>
    );
  }

  // EU compliance — bounding box around three nodes
  return (
    <svg viewBox="0 0 220 140" className="w-full h-auto" aria-hidden="true">
      <g stroke="#1A4FB8" strokeWidth="1.25" strokeDasharray="4 3" fill="none">
        <rect x="10" y="14" width="200" height="112" style={t(624, 0)} />
      </g>
      <g stroke="#0F1418" strokeWidth="1.25" fill="none">
        <circle cx="56" cy="70" r="18" style={t(114, 250)} />
        <circle cx="110" cy="70" r="18" style={t(114, 400)} />
        <circle cx="164" cy="70" r="18" style={t(114, 550)} />
        <line x1="74" y1="70" x2="92" y2="70" style={t(18, 700)} />
        <line x1="128" y1="70" x2="146" y2="70" style={t(18, 800)} />
      </g>
      <g
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize="8"
        fill="#0F1418"
        letterSpacing="1"
        style={{ opacity: draw ? 1 : 0, transition: "opacity 600ms ease 950ms" }}
      >
        <text x="56" y="74" textAnchor="middle">FRA</text>
        <text x="110" y="74" textAnchor="middle">IRL</text>
        <text x="164" y="74" textAnchor="middle">PL</text>
        <text x="20" y="26" letterSpacing="2" fill="#1A4FB8">EU · GDPR</text>
      </g>
    </svg>
  );
}

function CapabilitiesSection() {
  const { t } = useLang();
  return (
    <section style={{ backgroundColor: "#F6F4EE", color: "#0F1418" }}>
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-20 sm:py-28">
        <div
          className="grid grid-cols-3 font-mono pb-8"
          style={{
            color: "#8E9499",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderBottom: "1px solid #D6D2C8",
          }}
        >
          <span>{t.capabilities.eyebrow}</span>
          <span className="text-center">METODOLOGIA</span>
          <span className="text-right">SECTION 03</span>
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-12">
          <h2
            className="md:col-span-7"
            style={{
              fontFamily: "var(--font-display), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(1.875rem, 4.5vw, 3.25rem)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: "22ch",
            }}
          >
            {t.capabilities.title}
          </h2>
          <p
            className="md:col-span-5 font-sans"
            style={{
              color: "#4A5358",
              fontSize: "1.0625rem",
              lineHeight: 1.65,
              maxWidth: "40ch",
            }}
          >
            {t.capabilities.body}
          </p>
        </div>

        <ol className="mt-16 space-y-0">
          {t.capabilities.rows.map((row, i) => (
            <li
              key={row.number}
              className="grid gap-6 md:grid-cols-12 py-12 md:py-16"
              style={{
                borderTop: "1px solid #D6D2C8",
                borderBottom: i === t.capabilities.rows.length - 1 ? "1px solid #D6D2C8" : "none",
              }}
            >
              <div className="md:col-span-2">
                <span
                  className="font-mono"
                  style={{
                    color: "#1A4FB8",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.12em",
                  }}
                >
                  {row.caption}
                </span>
                <div
                  className="mt-3"
                  style={{
                    fontFamily: "var(--font-display), ui-serif, Georgia, serif",
                    fontSize: "2.25rem",
                    lineHeight: 1,
                    color: "#0F1418",
                  }}
                >
                  {row.number}
                </div>
              </div>
              <div className="md:col-span-6">
                <h3
                  style={{
                    fontFamily: "var(--font-display), ui-serif, Georgia, serif",
                    fontWeight: 400,
                    fontSize: "clamp(1.375rem, 2.5vw, 1.875rem)",
                    lineHeight: 1.1,
                    letterSpacing: "-0.01em",
                    color: "#0F1418",
                  }}
                >
                  {row.title}
                </h3>
                <p
                  className="mt-4 font-sans"
                  style={{
                    color: "#4A5358",
                    fontSize: "1.0625rem",
                    lineHeight: 1.65,
                    maxWidth: "52ch",
                  }}
                >
                  {row.body}
                </p>
              </div>
              <div className="md:col-span-4">
                <CapabilityIllustration index={i} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Integrations section
// ---------------------------------------------------------------------------

function IntegrationsSection() {
  const { t } = useLang();
  return (
    <section
      style={{ backgroundColor: "#EBE7DD", color: "#0F1418" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-20 sm:py-24">
        <div
          className="grid grid-cols-3 font-mono pb-8"
          style={{
            color: "#8E9499",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderBottom: "1px solid #D6D2C8",
          }}
        >
          <span>{t.integrations.eyebrow}</span>
          <span className="text-center">CONNECTORS</span>
          <span className="text-right">SECTION 04</span>
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-12">
          <h2
            className="md:col-span-7"
            style={{
              fontFamily: "var(--font-display), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(1.75rem, 4vw, 3rem)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: "22ch",
            }}
          >
            {t.integrations.title}
          </h2>
          <p
            className="md:col-span-5 font-sans"
            style={{
              color: "#4A5358",
              fontSize: "1.0625rem",
              lineHeight: 1.65,
              maxWidth: "40ch",
            }}
          >
            {t.integrations.body}
          </p>
        </div>

        <ul className="mt-12">
          {t.integrations.rows.map((row, i) => (
            <li
              key={row.name}
              className="grid grid-cols-12 items-baseline gap-4 py-6"
              style={{
                borderTop: "1px solid #D6D2C8",
                borderBottom:
                  i === t.integrations.rows.length - 1 ? "1px solid #D6D2C8" : "none",
              }}
            >
              <span
                className="col-span-1 font-mono"
                style={{
                  color: "#8E9499",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.08em",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="col-span-4 md:col-span-3"
                style={{
                  fontFamily: "var(--font-display), ui-serif, Georgia, serif",
                  fontSize: "clamp(1.25rem, 2vw, 1.75rem)",
                  lineHeight: 1,
                  color: "#0F1418",
                }}
              >
                {row.name}
              </span>
              <span
                className="col-span-7 md:col-span-7 font-sans"
                style={{
                  color: "#4A5358",
                  fontSize: "1rem",
                  lineHeight: 1.55,
                }}
              >
                {row.detail}
              </span>
              <span
                className="hidden md:inline-block md:col-span-1 text-right font-mono"
                style={{
                  color: "#1A4FB8",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                ▌ {row.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer + CTA
// ---------------------------------------------------------------------------

function FooterSection() {
  const { t } = useLang();
  const [url, setUrl] = useState("");
  return (
    <section
      style={{ backgroundColor: "#F6F4EE", color: "#0F1418" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-20 sm:py-28">
        <div
          className="grid grid-cols-3 font-mono pb-8"
          style={{
            color: "#8E9499",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderBottom: "1px solid #D6D2C8",
          }}
        >
          <span>{t.footer.eyebrow}</span>
          <span className="text-center">CALL TO ACTION</span>
          <span className="text-right">SECTION 05</span>
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-12">
          <h2
            className="md:col-span-7"
            style={{
              fontFamily: "var(--font-display), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(2.25rem, 6vw, 4.5rem)",
              lineHeight: 0.98,
              letterSpacing: "-0.025em",
              maxWidth: "16ch",
            }}
          >
            {t.footer.title}
          </h2>
          <div className="md:col-span-5">
            <p
              className="font-sans"
              style={{
                color: "#4A5358",
                fontSize: "1.0625rem",
                lineHeight: 1.65,
                maxWidth: "40ch",
              }}
            >
              {t.footer.body}
            </p>
            <form
              className="mt-6 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const target = url.trim()
                  ? `/test/demo-agent?url=${encodeURIComponent(url.trim())}`
                  : "/test/demo-agent";
                window.location.href = target;
              }}
            >
              <label
                className="font-mono"
                style={{
                  color: "#8E9499",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {t.footer.eyebrow}
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t.footer.inputPlaceholder}
                className="font-sans"
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid #0F1418",
                  padding: "0.5rem 0",
                  fontSize: "1.0625rem",
                  outline: "none",
                  color: "#0F1418",
                }}
              />
              <button
                type="submit"
                className="self-start mt-2 inline-flex items-center px-6 py-3 font-mono"
                style={{
                  backgroundColor: "#0F1418",
                  color: "#F6F4EE",
                  borderRadius: 9999,
                  fontSize: "0.6875rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {t.footer.inputCta}
              </button>
            </form>
          </div>
        </div>

        {/* EU compliance block */}
        <div
          className="mt-20 px-5 py-4 font-mono"
          style={{
            border: "1px solid #1A4FB8",
            backgroundColor: "#E6ECF6",
            color: "#0F3690",
            fontSize: "0.75rem",
            letterSpacing: "0.04em",
            lineHeight: 1.5,
          }}
        >
          {t.footer.compliance}
        </div>

        {/* Footer block */}
        <div
          className="mt-16 grid gap-10 md:grid-cols-12 pt-10"
          style={{ borderTop: "2px solid #1A1F24" }}
        >
          <div className="md:col-span-4">
            <p
              className="font-mono"
              style={{
                color: "#8E9499",
                fontSize: "0.6875rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t.footer.sectionLeftLabel}
            </p>
            <p
              className="mt-3 font-sans"
              style={{
                color: "#0F1418",
                fontSize: "0.9375rem",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              {t.wordmark}
            </p>
            <p
              className="mt-1 font-mono"
              style={{
                color: "#8E9499",
                fontSize: "0.6875rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t.serial}
            </p>
            <p
              className="mt-6 font-mono"
              style={{
                color: "#8E9499",
                fontSize: "0.6875rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t.footer.copyright}
            </p>
          </div>
          <div className="md:col-span-4">
            <p
              className="font-mono"
              style={{
                color: "#8E9499",
                fontSize: "0.6875rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t.footer.sectionRightLabel}
            </p>
            <div className="mt-3 flex flex-col gap-3 items-start">
              <Link
                href={"/auth/sign-in?as=client" as Route}
                className="inline-flex items-center px-5 py-2.5 font-mono"
                style={{
                  border: "1px solid #0F1418",
                  color: "#0F1418",
                  borderRadius: 9999,
                  fontSize: "0.6875rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {t.nav.client}
              </Link>
              <Link
                href={"/auth/sign-in?as=operator" as Route}
                className="inline-flex items-center px-5 py-2.5 font-mono"
                style={{
                  backgroundColor: "#0F1418",
                  color: "#F6F4EE",
                  borderRadius: 9999,
                  fontSize: "0.6875rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {t.nav.operator}
              </Link>
            </div>
          </div>
          <div className="md:col-span-4">
            <p
              className="font-mono"
              style={{
                color: "#8E9499",
                fontSize: "0.6875rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              FIG · ROUTES
            </p>
            <ul
              className="mt-3 space-y-2 font-mono"
              style={{
                color: "#4A5358",
                fontSize: "0.75rem",
              }}
            >
              <li>/ · main</li>
              <li>/v2 · schematic print</li>
              <li>/v3-ambitious · this page</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page composition
// ---------------------------------------------------------------------------

export default function V3LandingPage() {
  const [lang, setLangState] = useState<Lang>("pl");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY) as Lang | null;
      if (stored && LANGS.includes(stored)) {
        setLangState(stored);
        document.documentElement.lang = stored;
      }
    } catch {
      // localStorage may be unavailable in private mode; falling back to default
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
      document.documentElement.lang = next;
    } catch {
      // ignore
    }
  }, []);

  const ctx = useMemo(
    () => ({ lang, setLang, t: BUNDLES[lang] }),
    [lang, setLang]
  );

  return (
    <LangContext.Provider value={ctx}>
      <style>{`
        @keyframes v3-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-v3] *, [data-v3] *::before, [data-v3] *::after {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      <main data-v3 style={{ backgroundColor: "#F6F4EE", color: "#0F1418" }}>
        <Header />
        <HeroSection />
        <SignatureSection />
        <CapabilitiesSection />
        <IntegrationsSection />
        <FooterSection />
      </main>
    </LangContext.Provider>
  );
}
