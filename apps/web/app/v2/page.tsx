"use client";

// ============================================================================
// Alternative landing — Schematic Print direction.
// ----------------------------------------------------------------------------
// Implements the design tokens from /design.md (Google design.md format).
// Lives at /v2 so it can ship beside the main / landing for direct comparison
// without the risk of breaking the current public face. If it wins, we promote
// it; if not, we delete the route in one commit.
//
// Direction summary:
//   - Warm off-white paper bg (#F6F4EE), deep cool ink (#0F1418), one
//     blueprint-blue accent (#1A4FB8). No emerald, no rounded cards.
//   - Massive Instrument Serif display, Geist body, Geist Mono labels only.
//   - Heavy 2px rules as section separators, hairlines elsewhere. Sharp
//     corners on every block except the two pill buttons.
//   - Single hero schematic that draws itself via stroke-dasharray on mount.
//     No other looping animation. Honors prefers-reduced-motion as a single
//     static frame.
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
// Language layer (shares the odbiera:lang key with the main landing so a
// visitor's language choice survives a route swap)
// ---------------------------------------------------------------------------

type Lang = "pl" | "en" | "ru";
const LANG_KEY = "odbiera:lang";
const LANGS: Lang[] = ["pl", "en", "ru"];

interface ScriptLine {
  who: "clinic" | "patient" | "system";
  text: string;
}

interface CapabilityRow {
  question: string;
  source: string;
  answer: string;
}

interface MethodStep {
  number: string;
  title: string;
  body: string;
  marginalia: string;
}

interface LangBundle {
  htmlLang: string;
  serial: string;
  wordmark: string;
  nav: { client: string; operator: string };
  hero: {
    line1: string;
    line2: string;
    body: string;
    schematicCaption: string;
    schematicLabels: {
      phone: string;
      agent: string;
      knowledge: string;
      schedule: string;
      sms: string;
      patient: string;
    };
  };
  methodology: {
    eyebrow: string;
    title: string;
    intro: string;
    steps: [MethodStep, MethodStep, MethodStep, MethodStep];
  };
  specimen: {
    eyebrow: string;
    title: string;
    scene: string;
    speakerClinic: string;
    speakerPatient: string;
    speakerSystem: string;
    lines: ScriptLine[];
    closer: string;
  };
  capabilities: {
    eyebrow: string;
    title: string;
    intro: string;
    headers: { question: string; source: string; answer: string };
    rows: [CapabilityRow, CapabilityRow, CapabilityRow, CapabilityRow];
  };
  restrictions: {
    eyebrow: string;
    title: string;
    items: [string, string, string, string];
  };
  signin: {
    eyebrow: string;
    title: string;
    body: string;
  };
  cta: {
    eyebrow: string;
    headline: string;
    button: string;
    contact: string;
  };
  imprint: {
    title: string;
    privacy: string;
    region: string;
  };
}

const STRINGS: Record<Lang, LangBundle> = {
  pl: {
    htmlLang: "pl",
    serial: "DOC-2026-001 · REV α",
    wordmark: "AI Receptionist",
    nav: { client: "Klient", operator: "Operator" },
    hero: {
      line1: "Telefon dzwoni.",
      line2: "Ktoś odbiera.",
      body: "Recepcja telefoniczna dla kliniki stomatologicznej. Odpowiada na pytania pacjentów na żywo z bazy wiedzy o klinice, umawia wizyty, wysyła SMS z potwierdzeniem. Polski, angielski, rosyjski. Pracuje też wtedy, gdy klinika jest zamknięta.",
      schematicCaption: "FIG. 01 · Przepływ rozmowy przychodzącej",
      schematicLabels: {
        phone: "TELEFON",
        agent: "AGENT",
        knowledge: "BAZA WIEDZY",
        schedule: "GRAFIK",
        sms: "SMS",
        patient: "PACJENT",
      },
    },
    methodology: {
      eyebrow: "METODA · IV ROZDZIAŁY",
      title: "Cztery rzeczy, które naprawdę musi umieć recepcja.",
      intro: "Reszta to detale. Każdy z poniższych kroków działa od dnia, w którym podpinasz klinikę. Bez briefingu personelu, bez nagrywania bazy odpowiedzi.",
      steps: [
        {
          number: "I",
          title: "Odpowiada na pytania o klinikę.",
          body: "Strona kliniki przechodzi przez nasz scraper. Połączona z polską ontologią stomatologiczną, którą piszemy ręcznie, staje się bazą RAG, z której recepcjonistka korzysta na żywo. NFZ, cennik implantów, godziny w sobotę, doktor Nowak nowych pacjentów. Jeśli czegoś nie wie, mówi to wprost.",
          marginalia: "źródła: klinika.pl + ontology/*.md",
        },
        {
          number: "II",
          title: "Mówi po polsku jak człowiek.",
          body: "Rozpoznaje język, w którym pacjent zaczyna rozmowę, i odpowiada w tym samym. Polski, angielski, rosyjski równolegle. Bez drętwych tłumaczeń, bez „proszę powtórzyć\". Dopytuje naturalnie, kiedy czegoś nie zrozumie.",
          marginalia: "PL · EN · RU",
        },
        {
          number: "III",
          title: "Pyta o termin, sprawdza grafik, rezerwuje od razu.",
          body: "Bez „zadzwonię z grafikem później\". System widzi wolne sloty w czasie rzeczywistym i potwierdza termin w trakcie tej samej rozmowy. Działa o trzeciej w nocy tak samo jak o jedenastej rano.",
          marginalia: "Booksy · Medfile · GCal",
        },
        {
          number: "IV",
          title: "SMS leci w 30 sekund od zakończenia rozmowy.",
          body: "Pacjent dostaje wiadomość z datą, godziną, lekarzem, adresem i linkiem do ICS. Z numerem zwrotnym do zmiany terminu. Bez maila, bez spamu, bez marketingowego podpisu.",
          marginalia: "ICS · SMSAPI · UE",
        },
      ],
    },
    specimen: {
      eyebrow: "PRÓBKA · ROZMOWA NA ŻYWO",
      title: "Tak to brzmi w czwartek wieczorem o dwudziestej trzeciej.",
      scene: "Klinika zamknięta od osiemnastej. Telefon kliniki przekierowany na recepcjonistkę.",
      speakerClinic: "KLINIKA",
      speakerPatient: "PACJENT",
      speakerSystem: "SYSTEM",
      lines: [
        { who: "clinic", text: "Dzień dobry, w czym mogę pomóc?" },
        { who: "patient", text: "Dobry, chciałbym się umówić na konsultację." },
        { who: "clinic", text: "Mam wolny termin w czwartek o dziesiątej, pasuje?" },
        { who: "patient", text: "Tak, świetnie." },
        { who: "clinic", text: "Potwierdzę SMSem. Do zobaczenia w czwartek." },
        { who: "system", text: "Booking #4521 utworzony. SMS wysłany na +48 501 ··· 12. Plik ICS dołączony." },
      ],
      closer: "Czas rozmowy: 47 sekund. Średnia latencja odpowiedzi: 812 ms.",
    },
    capabilities: {
      eyebrow: "ZDOLNOŚCI · MATRYCA Q & A",
      title: "Tylko źródło i odpowiedź. Bez wymyślania.",
      intro: "Recepcjonistka odpowiada wyłącznie na podstawie udokumentowanych źródeł. Jeśli źródła brak, komunikuje to wprost i proponuje kontakt z osobą.",
      headers: { question: "PYTANIE", source: "ŹRÓDŁO", answer: "ODPOWIEDŹ" },
      rows: [
        {
          question: "Czy przyjmujecie NFZ?",
          source: "ontology/services.md",
          answer: "Nie, wszystkie usługi prywatne. Pełny cennik na klinika.pl/cennik.",
        },
        {
          question: "Ile kosztuje implant?",
          source: "klinika.pl/cennik",
          answer: "Implant Straumann od 4 800 PLN, dr Nowak. Konsultacja gratis przy decyzji o leczeniu.",
        },
        {
          question: "Czy jesteście otwarci w sobotę?",
          source: "klinika.pl/godziny",
          answer: "Sobota 9:00–14:00. Niedziele zamknięte.",
        },
        {
          question: "Czy doktor Nowak przyjmuje nowych pacjentów?",
          source: "klinika.pl/lekarze",
          answer: "Tak, dr Nowak przyjmuje nowych pacjentów. Najbliższy wolny termin: czwartek 10:00.",
        },
      ],
    },
    restrictions: {
      eyebrow: "OGRANICZENIA · ŚWIADOME",
      title: "Czego nie robi.",
      items: [
        "Nie udziela porad medycznych. Konsultacje, diagnozy, leki — pacjent zostaje z konkretnym lekarzem.",
        "Nie nagrywa audio bez wyraźnej zgody pacjenta. Domyślnie audio nie jest zapisywane.",
        "Nie zbiera adresu e-mail w trakcie rozmowy. Tylko numer telefonu, na który leci potwierdzenie.",
        "Nie obsługuje skarg, zwrotów ani spraw rozliczeniowych. Eskaluje do żywego pracownika.",
      ],
    },
    signin: {
      eyebrow: "LOGOWANIE · KOD JEDNORAZOWY",
      title: "Bez haseł, bez linków. Kod z e-maila.",
      body: "Operator i właściciel kliniki logują się przez ten sam formularz. Adres e-mail wpisujesz, kod sześciocyfrowy dostajesz w wiadomości, wklejasz go w formularz. Bez linków do klikania, ponieważ Safari je blokuje.",
    },
    cta: {
      eyebrow: "ODSŁUCH",
      headline: "Posłuchaj, jak brzmi w Twojej klinice.",
      button: "Umów rozmowę",
      contact: "Warszawa · 2026",
    },
    imprint: {
      title: "AI Receptionist",
      privacy: "Dane pacjentów w Unii Europejskiej.",
      region: "Frankfurt · Irlandia",
    },
  },
  en: {
    htmlLang: "en",
    serial: "DOC-2026-001 · REV α",
    wordmark: "AI Receptionist",
    nav: { client: "Client", operator: "Operator" },
    hero: {
      line1: "The phone rings.",
      line2: "Someone answers.",
      body: "Phone reception for dental practices. Answers patient questions live from a knowledge base built around the clinic, books appointments, sends a confirmation SMS. Polish, English, Russian. Works the hours your clinic is closed too.",
      schematicCaption: "FIG. 01 · Inbound call flow",
      schematicLabels: {
        phone: "PHONE",
        agent: "AGENT",
        knowledge: "KNOWLEDGE",
        schedule: "SCHEDULE",
        sms: "SMS",
        patient: "PATIENT",
      },
    },
    methodology: {
      eyebrow: "METHOD · IV CHAPTERS",
      title: "Four things a reception desk has to actually do.",
      intro: "Everything else is detail. Each step below works from the day you connect a clinic. No staff briefing, no manual answer-base authoring.",
      steps: [
        {
          number: "I",
          title: "Answers questions about the clinic.",
          body: "The clinic website is run through our scraper. Combined with our Polish dental ontology, which we author by hand, it becomes the RAG base the receptionist consults live. Insurance, implant prices, Saturday hours, whether Dr Nowak is taking new patients. If it doesn't know, it says so explicitly.",
          marginalia: "sources: klinika.pl + ontology/*.md",
        },
        {
          number: "II",
          title: "Speaks Polish like a person.",
          body: "Detects the language a call opens in and stays there. Polish, English, Russian in parallel. No stilted phrasing, no \"please repeat.\" Asks back naturally when something is unclear.",
          marginalia: "PL · EN · RU",
        },
        {
          number: "III",
          title: "Asks for a time, checks the schedule, books on the spot.",
          body: "No \"I'll call back with the schedule.\" The system reads live availability and confirms a slot during the same call. Works at 03:00 the same as at 11:00.",
          marginalia: "Booksy · Medfile · GCal",
        },
        {
          number: "IV",
          title: "SMS goes out within 30 seconds of hangup.",
          body: "Date, time, doctor, address, ICS link. Reply number to reschedule. No email collection, no spam, no marketing footer.",
          marginalia: "ICS · SMSAPI · EU",
        },
      ],
    },
    specimen: {
      eyebrow: "SPECIMEN · LIVE CALL",
      title: "This is what it sounds like on a Thursday at eleven at night.",
      scene: "Clinic closed since 18:00. The clinic line is forwarded to the receptionist.",
      speakerClinic: "CLINIC",
      speakerPatient: "PATIENT",
      speakerSystem: "SYSTEM",
      lines: [
        { who: "clinic", text: "Good evening, how can I help you?" },
        { who: "patient", text: "Hi, I'd like to book a consultation." },
        { who: "clinic", text: "I have Thursday at ten free. Does that work?" },
        { who: "patient", text: "Yes, perfect." },
        { who: "clinic", text: "I'll confirm by SMS. See you on Thursday." },
        { who: "system", text: "Booking #4521 created. SMS sent to +48 501 ··· 12. ICS file attached." },
      ],
      closer: "Call duration: 47 seconds. Mean response latency: 812 ms.",
    },
    capabilities: {
      eyebrow: "CAPABILITIES · Q & A MATRIX",
      title: "Only source and answer. No invention.",
      intro: "The receptionist only answers from documented sources. If the source is missing, it says so and offers a callback.",
      headers: { question: "QUESTION", source: "SOURCE", answer: "ANSWER" },
      rows: [
        {
          question: "Do you accept public insurance?",
          source: "ontology/services.md",
          answer: "No, all services are private. Full price list at klinika.pl/cennik.",
        },
        {
          question: "How much is an implant?",
          source: "klinika.pl/cennik",
          answer: "Straumann implant from 4,800 PLN, Dr Nowak. Free consultation when treatment is booked.",
        },
        {
          question: "Are you open on Saturday?",
          source: "klinika.pl/godziny",
          answer: "Saturday 9:00–14:00. Closed Sundays.",
        },
        {
          question: "Is Dr Nowak taking new patients?",
          source: "klinika.pl/lekarze",
          answer: "Yes, Dr Nowak is taking new patients. Next free slot: Thursday at 10:00.",
        },
      ],
    },
    restrictions: {
      eyebrow: "RESTRICTIONS · DELIBERATE",
      title: "What it does not do.",
      items: [
        "Does not give medical advice. Consultations, diagnoses, prescriptions stay with an actual doctor.",
        "Does not record audio without explicit consent. Audio is not stored by default.",
        "Does not collect email addresses during the call. Only the phone number for the confirmation SMS.",
        "Does not handle complaints, refunds, or billing disputes. Escalates to a human.",
      ],
    },
    signin: {
      eyebrow: "SIGN-IN · ONE-TIME CODE",
      title: "No passwords, no links. Code from email.",
      body: "Operator and clinic owner sign in through the same form. You enter the email, you receive a six-digit code, you paste it back. No clickable links, because Safari blocks them.",
    },
    cta: {
      eyebrow: "AUDITION",
      headline: "Hear how it sounds inside your practice.",
      button: "Book a call",
      contact: "Warsaw · 2026",
    },
    imprint: {
      title: "AI Receptionist",
      privacy: "Patient data within the European Union.",
      region: "Frankfurt · Ireland",
    },
  },
  ru: {
    htmlLang: "ru",
    serial: "DOC-2026-001 · REV α",
    wordmark: "AI Receptionist",
    nav: { client: "Клиент", operator: "Оператор" },
    hero: {
      line1: "Телефон звонит.",
      line2: "Кто-то отвечает.",
      body: "Приём звонков для стоматологической клиники. Отвечает на вопросы пациентов вживую из базы знаний о клинике, записывает на приём, отправляет SMS с подтверждением. Польский, английский, русский. Работает и в часы, когда клиника закрыта.",
      schematicCaption: "РИС. 01 · Поток входящего звонка",
      schematicLabels: {
        phone: "ТЕЛЕФОН",
        agent: "АГЕНТ",
        knowledge: "БАЗА ЗНАНИЙ",
        schedule: "ГРАФИК",
        sms: "SMS",
        patient: "ПАЦИЕНТ",
      },
    },
    methodology: {
      eyebrow: "МЕТОД · IV ГЛАВЫ",
      title: "Четыре вещи, которые администратор обязан уметь.",
      intro: "Остальное — детали. Каждый шаг ниже работает с первого дня подключения клиники. Без брифинга персонала, без ручного написания базы ответов.",
      steps: [
        {
          number: "I",
          title: "Отвечает на вопросы о клинике.",
          body: "Сайт клиники проходит через наш скрапер. Объединённый с польской стоматологической онтологией, которую мы пишем вручную, он становится RAG-базой, к которой администратор обращается вживую. Госстраховка, цены имплантов, часы по субботам, принимает ли доктор Новак новых пациентов. Если не знает, говорит об этом прямо.",
          marginalia: "источники: klinika.pl + ontology/*.md",
        },
        {
          number: "II",
          title: "Говорит по-польски как человек.",
          body: "Определяет язык по первым словам и отвечает в нём же. Польский, английский, русский — равноценно. Без шаблонных фраз. Если что-то неясно, переспрашивает естественно.",
          marginalia: "PL · EN · RU",
        },
        {
          number: "III",
          title: "Спрашивает время, сверяется с графиком, сразу бронирует.",
          body: "Без «уточню график и наберу». Система видит свободные слоты в реальном времени и подтверждает приём в той же беседе. В три ночи работает так же, как в одиннадцать утра.",
          marginalia: "Booksy · Medfile · GCal",
        },
        {
          number: "IV",
          title: "SMS уходит в течение 30 секунд после звонка.",
          body: "Дата, время, врач, адрес, ссылка ICS. Обратный номер для переноса. Без сбора e-mail, без спама, без маркетинговых подписей.",
          marginalia: "ICS · SMSAPI · ЕС",
        },
      ],
    },
    specimen: {
      eyebrow: "ОБРАЗЕЦ · ЖИВОЙ ЗВОНОК",
      title: "Вот как это звучит в четверг в одиннадцать вечера.",
      scene: "Клиника закрыта с 18:00. Номер клиники переадресован на администратора.",
      speakerClinic: "КЛИНИКА",
      speakerPatient: "ПАЦИЕНТ",
      speakerSystem: "СИСТЕМА",
      lines: [
        { who: "clinic", text: "Добрый вечер, чем могу помочь?" },
        { who: "patient", text: "Здравствуйте, хочу записаться на консультацию." },
        { who: "clinic", text: "Четверг в десять свободен. Подходит?" },
        { who: "patient", text: "Да, отлично." },
        { who: "clinic", text: "Подтвержу SMS. До встречи в четверг." },
        { who: "system", text: "Бронь #4521 создана. SMS отправлено на +48 501 ··· 12. Файл ICS вложен." },
      ],
      closer: "Длительность звонка: 47 секунд. Средняя задержка ответа: 812 мс.",
    },
    capabilities: {
      eyebrow: "ВОЗМОЖНОСТИ · МАТРИЦА Q & A",
      title: "Только источник и ответ. Без выдумывания.",
      intro: "Администратор отвечает только из задокументированных источников. Если источника нет, он сообщает об этом и предлагает обратный звонок.",
      headers: { question: "ВОПРОС", source: "ИСТОЧНИК", answer: "ОТВЕТ" },
      rows: [
        {
          question: "Вы принимаете по госстраховке?",
          source: "ontology/services.md",
          answer: "Нет, все услуги платные. Полный прейскурант на klinika.pl/cennik.",
        },
        {
          question: "Сколько стоит имплант?",
          source: "klinika.pl/cennik",
          answer: "Имплант Straumann от 4 800 PLN, доктор Новак. Консультация бесплатно при записи на лечение.",
        },
        {
          question: "В субботу работаете?",
          source: "klinika.pl/godziny",
          answer: "Суббота 9:00–14:00. Воскресенье — закрыто.",
        },
        {
          question: "Доктор Новак принимает новых пациентов?",
          source: "klinika.pl/lekarze",
          answer: "Да, доктор Новак принимает новых пациентов. Ближайший свободный слот: четверг 10:00.",
        },
      ],
    },
    restrictions: {
      eyebrow: "ОГРАНИЧЕНИЯ · СОЗНАТЕЛЬНЫЕ",
      title: "Чего не делает.",
      items: [
        "Не даёт медицинских советов. Консультации, диагнозы, лекарства — это к живому врачу.",
        "Не записывает аудио без явного согласия. По умолчанию аудио не сохраняется.",
        "Не собирает e-mail во время звонка. Только номер телефона для подтверждения.",
        "Не разбирается с жалобами, возвратами и оплатой. Передаёт живому сотруднику.",
      ],
    },
    signin: {
      eyebrow: "ВХОД · РАЗОВЫЙ КОД",
      title: "Без паролей, без ссылок. Код из письма.",
      body: "Оператор и владелец клиники входят через одну форму. Вводите e-mail, получаете шестизначный код, вставляете обратно. Без кликабельных ссылок, потому что Safari их блокирует.",
    },
    cta: {
      eyebrow: "ПРОСЛУШИВАНИЕ",
      headline: "Послушайте, как это звучит у вас в клинике.",
      button: "Заказать звонок",
      contact: "Варшава · 2026",
    },
    imprint: {
      title: "AI Receptionist",
      privacy: "Данные пациентов в пределах Европейского союза.",
      region: "Франкфурт · Ирландия",
    },
  },
};

// ---------------------------------------------------------------------------
// Context + hooks
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
      // ignore
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
// Header — wordmark + serial + lang + sign-in
// ---------------------------------------------------------------------------

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div role="group" aria-label="Language" className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]">
      {LANGS.map((l, i) => (
        <span key={l} className="flex items-center">
          <button
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={lang === l ? "text-[#1A4FB8] font-medium" : "text-[#8E9499] hover:text-[#0F1418]"}
            style={{ transition: "color 200ms" }}
          >
            {l}
          </button>
          {i < LANGS.length - 1 && (
            <span aria-hidden="true" className="ml-2 text-[#EBE7DD]">·</span>
          )}
        </span>
      ))}
    </div>
  );
}

function Header() {
  const { t } = useLang();
  return (
    <header className="border-b border-[#EBE7DD] bg-[#F6F4EE]">
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4 sm:px-8">
        <div className="flex flex-col min-w-0">
          <span className="truncate font-sans text-[15px] font-semibold tracking-[0.02em] text-[#0F1418]">
            {t.wordmark}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8E9499]">
            {t.serial}
          </span>
        </div>
        <div className="justify-self-center">
          <LangToggle />
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href={"/auth/sign-in?as=client" as Route}
            className="rounded-full border border-[#8E9499] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#0F1418] hover:border-[#0F1418] sm:px-4"
            style={{ transition: "border-color 200ms" }}
          >
            {t.nav.client}
          </Link>
          <Link
            href={"/auth/sign-in?as=operator" as Route}
            className="rounded-full bg-[#0F1418] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#F6F4EE] hover:bg-[#000] sm:px-4"
            style={{ transition: "background-color 200ms" }}
          >
            {t.nav.operator}
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// SVG schematic — stroke-dasharray draw-in on mount
// ---------------------------------------------------------------------------

function CallFlowSchematic() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const [drawn, setDrawn] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setDrawn(true);
      return;
    }
    const id = window.setTimeout(() => setDrawn(true), 100);
    return () => window.clearTimeout(id);
  }, [reduced]);

  const labels = t.hero.schematicLabels;

  // Common style for the draw-in transition. We pre-set stroke-dashoffset to
  // the path length, then transition it to zero. pathLength="1" lets us use
  // 1/0 instead of computing actual lengths per-path.
  const drawStyle = (delay: number): React.CSSProperties => ({
    strokeDasharray: 1,
    strokeDashoffset: drawn ? 0 : 1,
    transition: `stroke-dashoffset 1200ms cubic-bezier(0.2,0.7,0.2,1) ${delay}ms`,
  });

  const fadeStyle = (delay: number): React.CSSProperties => ({
    opacity: drawn ? 1 : 0,
    transition: `opacity 600ms ease-out ${delay}ms`,
  });

  return (
    <figure className="font-mono">
      <svg
        viewBox="0 0 600 360"
        role="img"
        aria-label={t.hero.schematicCaption}
        className="h-auto w-full max-w-[640px]"
      >
        {/* Background grid (light) */}
        <defs>
          <pattern id="schematic-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#EBE7DD" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="600" height="360" fill="url(#schematic-grid)" />

        {/* PHONE box */}
        <g style={fadeStyle(200)}>
          <rect x="20" y="150" width="100" height="60" fill="#F6F4EE" stroke="#0F1418" strokeWidth="1.25" />
          <text x="70" y="185" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1.2" fill="#0F1418">
            {labels.phone}
          </text>
          <text x="70" y="225" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#8E9499">
            +48 22 ...
          </text>
        </g>

        {/* Arrow phone → agent */}
        <g fill="none" stroke="#0F1418" strokeWidth="1.25" pathLength="1" style={drawStyle(600)}>
          <path d="M 120 180 L 230 180" />
          <path d="M 224 175 L 232 180 L 224 185" />
        </g>

        {/* AGENT central box */}
        <g style={fadeStyle(1000)}>
          <rect x="230" y="100" width="160" height="160" fill="#F6F4EE" stroke="#0F1418" strokeWidth="1.5" />
          <text x="310" y="135" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="1.5" fill="#0F1418">
            {labels.agent}
          </text>
          {/* Inner three rows: KB / SCHEDULE / SMS */}
          <line x1="240" y1="150" x2="380" y2="150" stroke="#EBE7DD" strokeWidth="1" />
          <text x="250" y="170" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="0.8" fill="#1A4FB8">
            ▸ {labels.knowledge}
          </text>
          <text x="250" y="195" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="0.8" fill="#0F1418">
            ○ {labels.schedule}
          </text>
          <text x="250" y="220" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="0.8" fill="#0F1418">
            ○ {labels.sms}
          </text>
          <line x1="240" y1="240" x2="380" y2="240" stroke="#EBE7DD" strokeWidth="1" />
        </g>

        {/* Arrow agent → sms gateway → patient */}
        <g fill="none" stroke="#0F1418" strokeWidth="1.25" pathLength="1" style={drawStyle(1400)}>
          <path d="M 390 180 L 460 180" />
          <path d="M 454 175 L 462 180 L 454 185" />
        </g>

        {/* PATIENT box */}
        <g style={fadeStyle(1800)}>
          <rect x="460" y="150" width="120" height="60" fill="#E6ECF6" stroke="#1A4FB8" strokeWidth="1.25" />
          <text x="520" y="185" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1.2" fill="#1A4FB8">
            {labels.patient}
          </text>
          <text x="520" y="225" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#8E9499">
            SMS · ICS
          </text>
        </g>

        {/* Small annotation marks (compass-rose style) */}
        <g style={fadeStyle(2200)}>
          <text x="540" y="20" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1" fill="#8E9499">
            FIG. 01
          </text>
          <text x="20" y="345" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1" fill="#8E9499">
            t = 0
          </text>
          <text x="290" y="345" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1" fill="#8E9499">
            t ≈ 0.8 s
          </text>
          <text x="520" y="345" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1" fill="#8E9499">
            t ≈ 30 s
          </text>
        </g>
      </svg>
      <figcaption className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8E9499]">
        {t.hero.schematicCaption}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState({ a: reduced, b: reduced, body: reduced });
  useEffect(() => {
    if (reduced) return;
    const t1 = window.setTimeout(() => setShown((s) => ({ ...s, a: true })), 0);
    const t2 = window.setTimeout(() => setShown((s) => ({ ...s, b: true })), 220);
    const t3 = window.setTimeout(() => setShown((s) => ({ ...s, body: true })), 540);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [reduced]);

  return (
    <section className="border-b-2 border-[#1A1F24] bg-[#F6F4EE]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <h1
              className="font-serif text-[clamp(3rem,9vw,7.5rem)] leading-[0.92] tracking-[-0.025em] text-[#0F1418]"
              style={{ wordBreak: "break-word" }}
            >
              <span
                className="block"
                style={{ opacity: shown.a ? 1 : 0, transition: "opacity 800ms ease-out" }}
              >
                {t.hero.line1}
              </span>
              <span
                className="block text-[#8E9499]"
                style={{ opacity: shown.b ? 1 : 0, transition: "opacity 800ms ease-out" }}
              >
                {t.hero.line2}
              </span>
            </h1>
            <p
              className="mt-10 max-w-[60ch] font-sans text-[17px] leading-[1.65] text-[#4A5358]"
              style={{ opacity: shown.body ? 1 : 0, transition: "opacity 700ms ease-out" }}
            >
              {t.hero.body}
            </p>
          </div>
          <div className="lg:col-span-5 lg:pt-4">
            <CallFlowSchematic />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Methodology — 4 numbered statements, editorial column with marginalia
// ---------------------------------------------------------------------------

function Methodology() {
  const { t } = useLang();
  return (
    <section className="border-b-2 border-[#1A1F24] bg-[#F6F4EE]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-16 max-w-3xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8E9499]">
            {t.methodology.eyebrow}
          </div>
          <h2 className="mt-4 font-serif text-[clamp(2rem,5vw,3.5rem)] leading-[1.02] tracking-[-0.02em] text-[#0F1418]">
            {t.methodology.title}
          </h2>
          <p className="mt-6 max-w-[60ch] font-sans text-[17px] leading-[1.65] text-[#4A5358]">
            {t.methodology.intro}
          </p>
        </div>

        <ol className="space-y-12 sm:space-y-16">
          {t.methodology.steps.map((step) => (
            <li
              key={step.number}
              className="grid grid-cols-1 gap-6 border-t border-[#EBE7DD] pt-8 md:grid-cols-12 md:gap-10"
            >
              <div className="md:col-span-2">
                <div className="font-serif text-5xl leading-none text-[#1A4FB8]">
                  {step.number}
                </div>
                <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8E9499]">
                  {step.marginalia}
                </div>
              </div>
              <div className="md:col-span-10">
                <h3 className="font-serif text-[clamp(1.5rem,2.5vw,2rem)] leading-[1.1] tracking-[-0.015em] text-[#0F1418]">
                  {step.title}
                </h3>
                <p className="mt-4 max-w-[60ch] font-sans text-[17px] leading-[1.65] text-[#4A5358]">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Specimen — printed dialogue script
// ---------------------------------------------------------------------------

function Specimen() {
  const { t } = useLang();
  const speakerLabel = (who: "clinic" | "patient" | "system") =>
    who === "clinic"
      ? t.specimen.speakerClinic
      : who === "patient"
        ? t.specimen.speakerPatient
        : t.specimen.speakerSystem;

  return (
    <section className="border-b-2 border-[#1A1F24] bg-[#EBE7DD]">
      <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-12 max-w-2xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8E9499]">
            {t.specimen.eyebrow}
          </div>
          <h2 className="mt-4 font-serif text-[clamp(2rem,5vw,3.5rem)] leading-[1.02] tracking-[-0.02em] text-[#0F1418]">
            {t.specimen.title}
          </h2>
          <p className="mt-6 font-sans text-[15px] italic leading-[1.55] text-[#4A5358]">
            {t.specimen.scene}
          </p>
        </div>

        <div className="border border-[#8E9499] bg-[#F6F4EE] px-6 py-10 sm:px-12 sm:py-14">
          {t.specimen.lines.map((line, i) => {
            const isSystem = line.who === "system";
            return (
              <div
                key={i}
                className={`grid grid-cols-[88px_1fr] gap-5 sm:grid-cols-[120px_1fr] ${i > 0 ? "mt-5" : ""}`}
              >
                <div
                  className={`pt-1 font-mono text-[11px] uppercase tracking-[0.1em] ${
                    isSystem ? "text-[#1A4FB8]" : "text-[#0F1418]"
                  }`}
                >
                  {speakerLabel(line.who)}
                </div>
                <div
                  className={`font-serif text-[clamp(1.125rem,1.5vw,1.375rem)] leading-[1.45] ${
                    isSystem ? "italic text-[#1A4FB8]" : "text-[#0F1418]"
                  }`}
                >
                  {line.text}
                </div>
              </div>
            );
          })}

          <div className="mt-10 border-t border-[#EBE7DD] pt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8E9499]">
            {t.specimen.closer}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Capabilities matrix — actual table
// ---------------------------------------------------------------------------

function CapabilitiesMatrix() {
  const { t } = useLang();
  return (
    <section className="border-b-2 border-[#1A1F24] bg-[#F6F4EE]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-12 max-w-3xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8E9499]">
            {t.capabilities.eyebrow}
          </div>
          <h2 className="mt-4 font-serif text-[clamp(2rem,5vw,3.5rem)] leading-[1.02] tracking-[-0.02em] text-[#0F1418]">
            {t.capabilities.title}
          </h2>
          <p className="mt-6 max-w-[60ch] font-sans text-[17px] leading-[1.65] text-[#4A5358]">
            {t.capabilities.intro}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-[#1A1F24]">
                <th className="py-3 pr-4 font-mono text-[10px] uppercase tracking-[0.1em] text-[#0F1418] sm:w-1/3">
                  {t.capabilities.headers.question}
                </th>
                <th className="py-3 pr-4 font-mono text-[10px] uppercase tracking-[0.1em] text-[#0F1418] sm:w-1/4">
                  {t.capabilities.headers.source}
                </th>
                <th className="py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#0F1418]">
                  {t.capabilities.headers.answer}
                </th>
              </tr>
            </thead>
            <tbody>
              {t.capabilities.rows.map((row, i) => (
                <tr key={i} className="border-b border-[#EBE7DD] align-top">
                  <td className="py-5 pr-4 font-serif text-[clamp(1rem,1.4vw,1.25rem)] leading-[1.35] text-[#0F1418]">
                    {row.question}
                  </td>
                  <td className="py-5 pr-4 font-mono text-[12px] tracking-[0.02em] text-[#1A4FB8]">
                    {row.source}
                  </td>
                  <td className="py-5 font-sans text-[15px] leading-[1.55] text-[#4A5358]">
                    {row.answer}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Restrictions — editorial "do not" list with red proof marks
// ---------------------------------------------------------------------------

function Restrictions() {
  const { t } = useLang();
  return (
    <section className="border-b-2 border-[#1A1F24] bg-[#F6F4EE]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-12 max-w-3xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8E9499]">
            {t.restrictions.eyebrow}
          </div>
          <h2 className="mt-4 font-serif text-[clamp(2rem,5vw,3.5rem)] leading-[1.02] tracking-[-0.02em] text-[#0F1418]">
            {t.restrictions.title}
          </h2>
        </div>

        <ul>
          {t.restrictions.items.map((item, i) => (
            <li
              key={i}
              className="grid grid-cols-[44px_1fr] items-start gap-5 border-t border-[#EBE7DD] py-6 first:border-t-0 first:pt-0 sm:grid-cols-[64px_1fr]"
            >
              <span className="pt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#B43A2E]">
                ✕ 0{i + 1}
              </span>
              <span className="font-serif text-[clamp(1.125rem,1.6vw,1.375rem)] leading-[1.4] text-[#0F1418]">
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sign-in note
// ---------------------------------------------------------------------------

function SignInImprint() {
  const { t } = useLang();
  return (
    <section className="border-b-2 border-[#1A1F24] bg-[#EBE7DD]">
      <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="border border-[#1A4FB8] bg-[#E6ECF6] px-6 py-10 sm:px-10 sm:py-14">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#1A4FB8]">
            {t.signin.eyebrow}
          </div>
          <h2 className="mt-3 font-serif text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.1] tracking-[-0.015em] text-[#0F3690]">
            {t.signin.title}
          </h2>
          <p className="mt-5 max-w-[58ch] font-sans text-[16px] leading-[1.6] text-[#0F3690]">
            {t.signin.body}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={"/auth/sign-in?as=client" as Route}
              className="rounded-full border border-[#0F3690] px-5 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#0F3690] hover:bg-[#0F3690] hover:text-[#F6F4EE]"
              style={{ transition: "background-color 200ms, color 200ms" }}
            >
              {t.nav.client}
            </Link>
            <Link
              href={"/auth/sign-in?as=operator" as Route}
              className="rounded-full bg-[#0F3690] px-5 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#F6F4EE] hover:bg-[#1A4FB8]"
              style={{ transition: "background-color 200ms" }}
            >
              {t.nav.operator}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA + imprint footer
// ---------------------------------------------------------------------------

const MAILTO_DEMO =
  "mailto:hello@example.com?subject=AI%20Receptionist%20%E2%80%94%20rozmowa&body=Klinika%3A%20%0AMiasto%3A%20%0ATelefon%3A%20";

function Cta() {
  const { t } = useLang();
  return (
    <section className="border-b-2 border-[#1A1F24] bg-[#F6F4EE]">
      <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-32">
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8E9499]">
          {t.cta.eyebrow}
        </div>
        <h2 className="mt-5 font-serif text-[clamp(2.25rem,6vw,4.5rem)] leading-[1] tracking-[-0.02em] text-[#0F1418]">
          {t.cta.headline}
        </h2>
        <a
          href={MAILTO_DEMO}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-[#0F1418] px-7 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[#F6F4EE] hover:bg-[#000]"
          style={{ transition: "background-color 200ms" }}
        >
          {t.cta.button}
        </a>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8E9499]">
          {t.cta.contact}
        </p>
      </div>
    </section>
  );
}

function Imprint() {
  const { t } = useLang();
  return (
    <footer className="bg-[#F6F4EE]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-3 px-5 py-10 sm:px-8">
        <span className="font-serif text-2xl tracking-[-0.01em] text-[#0F1418]">
          {t.imprint.title}
        </span>
        <div className="flex flex-wrap items-baseline gap-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8E9499]">
          <span>{t.imprint.privacy}</span>
          <span aria-hidden="true">·</span>
          <span>{t.imprint.region}</span>
          <span aria-hidden="true">·</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function V2Inner() {
  return (
    <div className="min-h-screen bg-[#F6F4EE] font-sans text-[#0F1418]">
      <Header />
      <main>
        <Hero />
        <Methodology />
        <Specimen />
        <CapabilitiesMatrix />
        <Restrictions />
        <SignInImprint />
        <Cta />
      </main>
      <Imprint />
    </div>
  );
}

export default function V2Page() {
  return (
    <LangProvider>
      <V2Inner />
    </LangProvider>
  );
}
