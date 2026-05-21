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
      ctaPrimary: "Umów demo",
      ctaSecondary: "Zobacz, jak działa",
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
      eyebrow: "KONTAKT",
      title: "Pokażmy to na Twojej klinice.",
      body:
        "30 minut, prywatne demo z agentem skonfigurowanym pod Twój zakres usług, cennik i godziny. Bez umowy, bez konta.",
      inputPlaceholder: "",
      inputCta: "Umów demo",
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
      ctaPrimary: "Book a demo",
      ctaSecondary: "Watch it work",
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
      eyebrow: "CONTACT",
      title: "Let us show you, on your clinic.",
      body:
        "Thirty minutes, a private demo with the agent tuned to your services, pricing and hours. No contract, no account.",
      inputPlaceholder: "",
      inputCta: "Book a demo",
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
      ctaPrimary: "Записаться на демо",
      ctaSecondary: "Посмотреть, как работает",
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
      eyebrow: "КОНТАКТ",
      title: "Покажем на вашей клинике.",
      body:
        "Тридцать минут, приватное демо с агентом, настроенным под ваш перечень услуг, цены и часы. Без договора, без аккаунта.",
      inputPlaceholder: "",
      inputCta: "Записаться на демо",
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
  const pathStyle = (length: number, delay: number): React.CSSProperties => ({
    strokeDasharray: length,
    strokeDashoffset: drawIn ? 0 : length,
    transition: `stroke-dashoffset 1100ms cubic-bezier(0.2,0.7,0.2,1) ${delay}ms`,
  });
  // Three nodes only — patient line, agent, confirmation. Cleaner than a
  // labelled six-node call graph. The fourth element is a faint return arc
  // in blueprint blue that closes the loop visually without adding labels.
  return (
    <figure className="w-full">
      <svg
        viewBox="0 0 600 320"
        className="w-full h-auto"
        role="img"
        aria-label={t.hero.schematicCaption}
      >
        <defs>
          <marker
            id="arrow-v3"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#0F1418" />
          </marker>
        </defs>

        {/* Node 1 — patient line (left) */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <circle cx="80" cy="160" r="36" style={pathStyle(226, 0)} />
        </g>
        {/* Patient → Agent */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <line
            x1="118"
            y1="160"
            x2="232"
            y2="160"
            markerEnd="url(#arrow-v3)"
            style={pathStyle(114, 200)}
          />
        </g>

        {/* Node 2 — agent (center) */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <rect x="232" y="118" width="136" height="84" style={pathStyle(440, 340)} />
        </g>
        {/* internal hairline */}
        <g stroke="#1A4FB8" strokeWidth="1" fill="none">
          <line x1="248" y1="138" x2="352" y2="138" style={pathStyle(104, 480)} />
        </g>

        {/* Agent → Confirmation */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <line
            x1="368"
            y1="160"
            x2="482"
            y2="160"
            markerEnd="url(#arrow-v3)"
            style={pathStyle(114, 620)}
          />
        </g>

        {/* Node 3 — booking + SMS (right) */}
        <g stroke="#0F1418" strokeWidth="1.25" fill="none">
          <rect x="482" y="118" width="80" height="84" style={pathStyle(328, 760)} />
        </g>

        {/* Quiet return arc — booking back to patient, blueprint blue */}
        <g stroke="#1A4FB8" strokeWidth="1" fill="none">
          <path
            d="M 522 202 C 522 270, 80 270, 80 200"
            style={pathStyle(640, 900)}
          />
        </g>

        {/* Labels — mono caption beneath each node */}
        <g
          fontFamily="var(--font-mono), ui-monospace, monospace"
          fontSize="10"
          fill="#0F1418"
          letterSpacing="1.6"
          style={{
            opacity: drawIn ? 1 : 0,
            transition: "opacity 700ms ease 1100ms",
          }}
        >
          <text x="80" y="232" textAnchor="middle">{t.hero.schematic.patient.toUpperCase()}</text>
          <text x="300" y="232" textAnchor="middle">{t.hero.schematic.agent.toUpperCase()}</text>
          <text x="522" y="232" textAnchor="middle">{t.hero.schematic.sms.toUpperCase()}</text>
        </g>
      </svg>
      <figcaption
        className="mt-6 font-mono"
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
              <a
                href="mailto:hello@ai-receptionist.eu?subject=Demo"
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
              </a>
              <a
                href="#signature"
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
            {["15:00", "15:30", "16:00"].map((time) => {
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
    <section id="signature" style={{ backgroundColor: "#0B0F14", color: "#E8E4D8" }}>
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-20 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p
              className="font-mono"
              style={{
                color: "#5D87E8",
                fontSize: "0.6875rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {t.signature.eyebrow}
            </p>
            <h2
              className="mt-5"
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

function CapabilitiesSection() {
  const { t } = useLang();
  return (
    <section style={{ backgroundColor: "#F6F4EE", color: "#0F1418" }}>
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-20 sm:py-28">
        <div className="grid gap-10 md:grid-cols-12 md:items-end">
          <h2
            className="md:col-span-8"
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
            className="md:col-span-4 font-sans"
            style={{
              color: "#4A5358",
              fontSize: "1rem",
              lineHeight: 1.65,
              maxWidth: "36ch",
            }}
          >
            {t.capabilities.body}
          </p>
        </div>

        <ol className="mt-16">
          {t.capabilities.rows.map((row, i) => (
            <li
              key={row.number}
              className="grid gap-6 md:grid-cols-12 py-12 md:py-14"
              style={{
                borderTop: "1px solid #D6D2C8",
                borderBottom:
                  i === t.capabilities.rows.length - 1 ? "1px solid #D6D2C8" : "none",
              }}
            >
              <div className="md:col-span-3">
                <span
                  className="font-mono"
                  style={{
                    color: "#1A4FB8",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.12em",
                  }}
                >
                  {row.number} · {row.caption}
                </span>
              </div>
              <h3
                className="md:col-span-5"
                style={{
                  fontFamily: "var(--font-display), ui-serif, Georgia, serif",
                  fontWeight: 400,
                  fontSize: "clamp(1.5rem, 2.6vw, 2.125rem)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.015em",
                  color: "#0F1418",
                  maxWidth: "22ch",
                }}
              >
                {row.title}
              </h3>
              <p
                className="md:col-span-4 font-sans"
                style={{
                  color: "#4A5358",
                  fontSize: "1rem",
                  lineHeight: 1.65,
                  maxWidth: "44ch",
                }}
              >
                {row.body}
              </p>
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
    <section style={{ backgroundColor: "#EFEBE1", color: "#0F1418" }}>
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-20 sm:py-24">
        <div className="grid gap-10 md:grid-cols-12 md:items-end">
          <h2
            className="md:col-span-8"
            style={{
              fontFamily: "var(--font-display), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(1.75rem, 4vw, 3rem)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              maxWidth: "20ch",
            }}
          >
            {t.integrations.title}
          </h2>
          <p
            className="md:col-span-4 font-sans"
            style={{
              color: "#4A5358",
              fontSize: "1rem",
              lineHeight: 1.65,
              maxWidth: "36ch",
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
                className="col-span-5 sm:col-span-4 md:col-span-3"
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
                className="col-span-7 sm:col-span-8 md:col-span-9 font-sans"
                style={{
                  color: "#4A5358",
                  fontSize: "1rem",
                  lineHeight: 1.55,
                }}
              >
                {row.detail}
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
  return (
    <section style={{ backgroundColor: "#F6F4EE", color: "#0F1418" }}>
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 pt-20 pb-16 sm:pt-28 sm:pb-20">
        <div className="grid gap-10 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <p
              className="font-mono"
              style={{
                color: "#1A4FB8",
                fontSize: "0.6875rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              {t.footer.eyebrow}
            </p>
            <h2
              className="mt-5"
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
          </div>
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
            <a
              href="mailto:hello@ai-receptionist.eu?subject=Demo"
              className="mt-6 inline-flex items-center px-6 py-3 font-mono"
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
            </a>
          </div>
        </div>

        {/* EU compliance pull */}
        <p
          className="mt-20 font-mono"
          style={{
            color: "#1A4FB8",
            fontSize: "0.75rem",
            letterSpacing: "0.06em",
            lineHeight: 1.6,
            maxWidth: "78ch",
            paddingLeft: "1rem",
            borderLeft: "2px solid #1A4FB8",
          }}
        >
          {t.footer.compliance}
        </p>

        {/* Colophon */}
        <div
          className="mt-20 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4 pt-8 font-mono"
          style={{
            borderTop: "1px solid #D6D2C8",
            color: "#8E9499",
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: "#0F1418" }}>{t.wordmark}</span>
          <span>{t.serial}</span>
          <span>{t.footer.copyright}</span>
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
