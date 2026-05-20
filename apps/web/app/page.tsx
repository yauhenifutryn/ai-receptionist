"use client";

// ============================================================================
// Public landing page v6.
// ----------------------------------------------------------------------------
// v5 feedback (resolved here):
//   - Fake call counter "2 854 ROZMÓW · 14 DNI" → removed entirely. Pre-launch
//     metrics on a public page collapse trust. Replaced with honest signals
//     (latency target, language coverage, availability promise).
//   - SMS visual was a chopped ASCII frame with content in the middle. Rebuilt
//     as a proper iPhone-style rounded frame with a chat bubble inside.
//   - "more ASCII, more unique" → new HeroConsole: a multi-pane dark terminal
//     showing live transcript + knowledge-base hits + tool calls. Reads
//     unambiguously as software, not an actor pretending to be a receptionist.
//   - Brand: stripped "Odbiera" from visible copy. We're stealth pre-incorp.
//     Wordmark is "AI Receptionist" placeholder (matches CLAUDE.md working name).
//   - Core product capability missing on the landing: out-of-box Q&A from
//     scraped clinic site + Polish dental ontology + client input. Added as
//     feature row 01 (the wedge that competitors don't have).
//   - Mobile pass: hero console responsive, feature visuals stack cleanly,
//     hero typography scales from text-4xl on small viewports.
//
// All animations honor prefers-reduced-motion + document.visibilityState.
// PL / EN / RU. Persisted via odbiera:lang localStorage key (internal, not
// visible — the storage key staying static survives a future rebrand
// without invalidating existing user preferences).
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

interface KbQuery {
  question: string;
  source: string;
  answer: string;
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
    statusLanguages: string;
    statusUptime: string;
    statusLatency: string;
    statusRegion: string;
  };
  console: {
    title: string;
    statusLabel: string;
    paneTranscript: string;
    paneKnowledge: string;
    paneTools: string;
    speakerClinic: string;
    speakerPatient: string;
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
    rows: [FeatureCopy, FeatureCopy, FeatureCopy, FeatureCopy];
    knowledgeLabel: string;
    knowledgeQueries: [KbQuery, KbQuery, KbQuery];
    knowledgeStateThinking: string;
    knowledgeStateAnswer: string;
    sampleLabel: string;
    samples: [string, string, string];
    bookingLabel: string;
    bookingFreeLabel: string;
    smsHeader: string;
    smsPhase: { queued: string; sending: string; delivered: string };
    smsTimePill: string;
    smsBody: string;
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

// Source labels for the console KB pane. Same across languages — these are
// file paths and URLs, not translatable copy.
const KB_SOURCES = [
  "klinika.pl/cennik",
  "ontology/services.md",
  "ontology/scripts.md",
  "ontology/triage.md",
] as const;

interface ToolCall {
  name: string;
  args: string;
  duration: string;
}

const TOOL_CALLS: readonly ToolCall[] = [
  { name: "check_availability", args: "date=2026-05-22, dur=30", duration: "142 ms" },
  { name: "create_booking", args: "slot=4521, lang=pl", duration: "287 ms" },
  { name: "send_sms", args: "to=+48501***12", duration: "1.4 s" },
] as const;

const STRINGS: Record<Lang, LangBundle> = {
  pl: {
    htmlLang: "pl",
    wordmark: "AI Receptionist",
    tagline: "recepcja telefoniczna · 24 h",
    nav: { client: "Klient", operator: "Operator" },
    hero: {
      line1: "Telefon dzwoni.",
      line2: "Ktoś odbiera.",
      body: "Recepcja telefoniczna dla kliniki stomatologicznej. Mówi po polsku, angielsku i rosyjsku. Odpowiada na pytania pacjentów na żywo, umawia wizyty, potwierdza SMSem. Pracuje też wtedy, gdy klinika jest zamknięta.",
      statusLanguages: "PL · EN · RU",
      statusUptime: "24 / 7",
      statusLatency: "ODP. < 1 s",
      statusRegion: "DANE W UE",
    },
    console: {
      title: "AGENT · LIVE",
      statusLabel: "19:23:04 · PL",
      paneTranscript: "TRANSCRIPT",
      paneKnowledge: "KNOWLEDGE",
      paneTools: "TOOLS",
      speakerClinic: "Klin",
      speakerPatient: "Pacj",
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
      title: "Cztery rzeczy, które recepcja musi naprawdę umieć.",
      body: "Reszta to detale. Najpierw musi się dogadać. Potem odpowiedzieć na pytania. Potem nie pomylić terminu. Potem przypomnieć pacjentowi.",
      rows: [
        {
          number: "01",
          eyebrow: "BAZA WIEDZY",
          title: "Odpowiada na pytania o klinikę. Bez briefingu personelu.",
          paragraphs: [
            "Po podłączeniu kliniki recepcjonistka czyta jej stronę, łączy ją z polską ontologią stomatologiczną i odpowiada pacjentom na żywo. NFZ? Cennik implantów? Godziny w sobotę? Czy przyjmuje pan dr Nowak nowych pacjentów? Wszystko z dnia, w którym podpinasz klinikę.",
            "Jeśli czegoś nie wie, mówi to wprost i proponuje kontakt z żywą osobą. Bez halucynacji, bez wymyślania cen, bez „chyba\". Aktualizacja jest banalna: dorzucasz markdown z FAQ, recepcjonistka uczy się natychmiast.",
          ],
          bullets: [
            "Strona kliniki + nasza ontologia jako baza RAG.",
            "Jasne „nie wiem\" zamiast wymyślania.",
            "Update bez wgrywania kodu, w panelu właściciela.",
          ],
        },
        {
          number: "02",
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
          number: "03",
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
          number: "04",
          eyebrow: "POTWIERDZENIE",
          title: "SMS leci w 30 sekund od zakończenia rozmowy.",
          paragraphs: [
            "Pacjent dostaje wiadomość z datą, godziną, lekarzem i adresem kliniki. Z linkiem do ICS, żeby od razu dodać do kalendarza. Z numerem do zmiany terminu, jeśli coś wypadnie.",
            "Bez podpisywania się pod kogoś innego. Wiadomość wychodzi z wspólnego nadawcy projektu albo, w pakiecie premium, spod marki kliniki.",
          ],
          bullets: [
            "Treść po polsku, kulturalna, krótka.",
            "Plik .ics dla iPhone i Androida.",
            "Numer zwrotny na zmianę lub odwołanie.",
          ],
        },
      ],
      knowledgeLabel: "PYTANIE PACJENTA",
      knowledgeQueries: [
        {
          question: "Czy przyjmujecie NFZ?",
          source: "ontology/services.md",
          answer:
            "Nie, wszystkie usługi prywatne. Pełny cennik widoczny na stronie klinika.pl/cennik.",
        },
        {
          question: "Ile kosztuje implant?",
          source: "klinika.pl/cennik",
          answer:
            "Implant Straumann od 4 800 PLN, dr Nowak. Konsultacja gratis przy decyzji o leczeniu.",
        },
        {
          question: "Czy jesteście otwarci w sobotę?",
          source: "klinika.pl/godziny",
          answer: "Sobota 9:00–14:00. Niedziele zamknięte. Czy zarezerwować Pani termin?",
        },
      ],
      knowledgeStateThinking: "WYSZUKIWANIE…",
      knowledgeStateAnswer: "ODPOWIEDŹ",
      sampleLabel: "PRZYKŁAD",
      samples: [
        "Dzień dobry, w czym mogę pomóc?",
        "Good evening, how can I help you?",
        "Добрый вечер, чем могу помочь?",
      ],
      bookingLabel: "GRAFIK · CZWARTEK",
      bookingFreeLabel: "wolnych",
      smsHeader: "SMS · 19:23:48",
      smsPhase: { queued: "QUEUED", sending: "SENDING…", delivered: "✓ DELIVERED" },
      smsTimePill: "19:23 dziś",
      smsBody: "Czwartek 10:00, dr Kowalska. ICS w wiadomości.",
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
      contact: "Warszawa",
    },
    footer: {
      privacy: "Dane pacjentów przechowywane w Unii Europejskiej.",
      copyright: "AI Receptionist",
      region: "Frankfurt · Irlandia · UE",
    },
  },
  en: {
    htmlLang: "en",
    wordmark: "AI Receptionist",
    tagline: "phone reception · 24 h",
    nav: { client: "Client", operator: "Operator" },
    hero: {
      line1: "The phone rings.",
      line2: "Someone answers.",
      body: "Phone reception for dental practices. Speaks Polish, English, and Russian. Answers live questions about the clinic, books appointments, confirms by SMS. Works the hours your clinic is closed too.",
      statusLanguages: "PL · EN · RU",
      statusUptime: "24 / 7",
      statusLatency: "ANSWER < 1 s",
      statusRegion: "DATA IN EU",
    },
    console: {
      title: "AGENT · LIVE",
      statusLabel: "19:23:04 · PL",
      paneTranscript: "TRANSCRIPT",
      paneKnowledge: "KNOWLEDGE",
      paneTools: "TOOLS",
      speakerClinic: "Clin",
      speakerPatient: "Pat",
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
      title: "Four things a reception desk has to actually do.",
      body: "Everything else is detail. First understand. Then answer questions. Then not screw up the date. Then remind the patient.",
      rows: [
        {
          number: "01",
          eyebrow: "KNOWLEDGE",
          title: "Answers questions about the clinic. No staff briefing required.",
          paragraphs: [
            "When you connect a clinic, the receptionist reads its website, combines it with our Polish dental ontology, and answers patient questions live. Public/private insurance? Implant prices? Saturday hours? Is Dr Nowak taking new patients? All of it, on the day you onboard.",
            "If it doesn't know, it says so explicitly and offers a callback to a human. No hallucinations, no invented prices, no \"I think\". Updates are trivial: drop in a markdown FAQ, the receptionist picks it up immediately.",
          ],
          bullets: [
            "Clinic website plus our ontology, as a RAG base.",
            "Explicit \"I don't know\" rather than guesses.",
            "Update from the owner panel, no code deploy.",
          ],
        },
        {
          number: "02",
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
          number: "03",
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
          number: "04",
          eyebrow: "CONFIRMATION",
          title: "SMS goes out within 30 seconds of hangup.",
          paragraphs: [
            "Date, time, doctor, address. ICS link to add to a calendar. Callback number to reschedule. No spam, no marketing footer.",
            "No impersonation. Sender is the project default by default, or your clinic's brand on the premium tier.",
          ],
          bullets: [
            "Polish copy, short, polite.",
            ".ics for iPhone and Android.",
            "Reply number for changes or cancellations.",
          ],
        },
      ],
      knowledgeLabel: "PATIENT QUESTION",
      knowledgeQueries: [
        {
          question: "Do you accept public insurance?",
          source: "ontology/services.md",
          answer:
            "No, all services are private. Full price list at klinika.pl/cennik.",
        },
        {
          question: "How much is an implant?",
          source: "klinika.pl/cennik",
          answer:
            "Straumann implant from 4,800 PLN, Dr Nowak. Free consultation when treatment is booked.",
        },
        {
          question: "Are you open on Saturday?",
          source: "klinika.pl/godziny",
          answer: "Saturday 9:00–14:00. Closed Sundays. Should I book you in?",
        },
      ],
      knowledgeStateThinking: "SEARCHING…",
      knowledgeStateAnswer: "ANSWER",
      sampleLabel: "SAMPLE",
      samples: [
        "Good evening, how can I help you?",
        "Dzień dobry, w czym mogę pomóc?",
        "Добрый вечер, чем могу помочь?",
      ],
      bookingLabel: "SCHEDULE · THURSDAY",
      bookingFreeLabel: "free",
      smsHeader: "SMS · 19:23:48",
      smsPhase: { queued: "QUEUED", sending: "SENDING…", delivered: "✓ DELIVERED" },
      smsTimePill: "19:23 today",
      smsBody: "Thursday 10:00, dr Kowalska. ICS in the SMS.",
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
      contact: "Warsaw",
    },
    footer: {
      privacy: "Patient data stored within the European Union.",
      copyright: "AI Receptionist",
      region: "Frankfurt · Ireland · EU",
    },
  },
  ru: {
    htmlLang: "ru",
    wordmark: "AI Receptionist",
    tagline: "приём звонков · 24 ч",
    nav: { client: "Клиент", operator: "Оператор" },
    hero: {
      line1: "Телефон звонит.",
      line2: "Кто-то отвечает.",
      body: "Приём звонков для стоматологической клиники. Говорит по-польски, по-английски и по-русски. Отвечает на вопросы пациентов вживую, записывает на приём, подтверждает SMS. Работает и в часы, когда клиника закрыта.",
      statusLanguages: "PL · EN · RU",
      statusUptime: "24 / 7",
      statusLatency: "ОТВЕТ < 1 с",
      statusRegion: "ДАННЫЕ В ЕС",
    },
    console: {
      title: "AGENT · LIVE",
      statusLabel: "19:23:04 · PL",
      paneTranscript: "TRANSCRIPT",
      paneKnowledge: "KNOWLEDGE",
      paneTools: "TOOLS",
      speakerClinic: "Клин",
      speakerPatient: "Пац",
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
      title: "Четыре вещи, которые администратор обязан уметь.",
      body: "Остальное — детали. Сначала понять. Потом ответить на вопросы. Потом не перепутать дату. Потом напомнить пациенту.",
      rows: [
        {
          number: "01",
          eyebrow: "БАЗА ЗНАНИЙ",
          title: "Отвечает на вопросы о клинике. Без брифинга персонала.",
          paragraphs: [
            "При подключении клиники администратор читает её сайт, объединяет с польской стоматологической онтологией и отвечает пациентам вживую. Госстраховка? Цена импланта? Часы работы в субботу? Принимает ли доктор Новак новых пациентов? Всё это работает с первого дня.",
            "Если чего-то не знает, говорит об этом прямо и предлагает обратный звонок живому человеку. Без галлюцинаций, без выдуманных цен, без «наверное». Обновления тривиальны: дописываете FAQ в markdown, администратор подхватывает мгновенно.",
          ],
          bullets: [
            "Сайт клиники плюс наша онтология как RAG-база.",
            "Прямое «не знаю» вместо догадок.",
            "Обновление из панели владельца, без релиза кода.",
          ],
        },
        {
          number: "02",
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
          number: "03",
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
          number: "04",
          eyebrow: "ПОДТВЕРЖДЕНИЕ",
          title: "SMS уходит в течение 30 секунд после звонка.",
          paragraphs: [
            "Дата, время, врач, адрес. Ссылка ICS, чтобы добавить в календарь. Обратный номер для переноса. Без спама и маркетинговых подписей.",
            "Без подделки отправителя. По умолчанию — общий отправитель проекта, в премиум-пакете — бренд клиники.",
          ],
          bullets: [
            "Текст по-польски, короткий, вежливый.",
            ".ics для iPhone и Android.",
            "Обратный номер для отмены или переноса.",
          ],
        },
      ],
      knowledgeLabel: "ВОПРОС ПАЦИЕНТА",
      knowledgeQueries: [
        {
          question: "Вы принимаете по госстраховке?",
          source: "ontology/services.md",
          answer:
            "Нет, все услуги платные. Полный прейскурант на сайте klinika.pl/cennik.",
        },
        {
          question: "Сколько стоит имплант?",
          source: "klinika.pl/cennik",
          answer:
            "Имплант Straumann от 4 800 PLN, доктор Новак. Консультация бесплатно при записи на лечение.",
        },
        {
          question: "В субботу работаете?",
          source: "klinika.pl/godziny",
          answer: "Суббота 9:00–14:00. Воскресенье — закрыто. Записать вас?",
        },
      ],
      knowledgeStateThinking: "ПОИСК…",
      knowledgeStateAnswer: "ОТВЕТ",
      sampleLabel: "ПРИМЕР",
      samples: [
        "Добрый вечер, чем могу помочь?",
        "Dzień dobry, w czym mogę pomóc?",
        "Good evening, how can I help you?",
      ],
      bookingLabel: "ГРАФИК · ЧЕТВЕРГ",
      bookingFreeLabel: "свободно",
      smsHeader: "SMS · 19:23:48",
      smsPhase: { queued: "QUEUED", sending: "SENDING…", delivered: "✓ DELIVERED" },
      smsTimePill: "19:23 сегодня",
      smsBody: "Четверг 10:00, др Ковальская. ICS в сообщении.",
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
      contact: "Варшава",
    },
    footer: {
      privacy: "Данные пациентов хранятся в пределах Европейского союза.",
      copyright: "AI Receptionist",
      region: "Франкфурт · Ирландия · ЕС",
    },
  },
};

// Live transcript dialogue (used by both the hero console and the standalone
// LiveLedger section). Generic clinic phrasing — no brand name leak.
const DIALOGUES: Record<Lang, DialogueLine[]> = {
  pl: [
    { side: "clinic", ts: "19:23:04", line: "Dzień dobry, w czym mogę pomóc?" },
    { side: "patient", ts: "19:23:07", line: "Dobry, chciałbym się umówić na konsultację." },
    { side: "clinic", ts: "19:23:11", line: "Mam wolny termin w czwartek o dziesiątej, pasuje?" },
    { side: "patient", ts: "19:23:15", line: "Tak, świetnie." },
    { side: "clinic", ts: "19:23:18", line: "Potwierdzę SMSem. Do zobaczenia w czwartek." },
  ],
  en: [
    { side: "clinic", ts: "19:23:04", line: "Good evening, how can I help?" },
    { side: "patient", ts: "19:23:07", line: "Hi, I'd like to book a consultation." },
    { side: "clinic", ts: "19:23:11", line: "I have Thursday at ten free, does that work?" },
    { side: "patient", ts: "19:23:15", line: "Yes, perfect." },
    { side: "clinic", ts: "19:23:18", line: "I'll confirm by SMS. See you Thursday." },
  ],
  ru: [
    { side: "clinic", ts: "19:23:04", line: "Добрый вечер, чем могу помочь?" },
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
// Shared hooks
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
// Header
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
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="truncate text-base font-semibold tracking-tight text-neutral-900 sm:text-xl">
            {t.wordmark}
          </span>
          <span className="hidden font-mono text-[11px] uppercase tracking-wider text-neutral-400 lg:inline">
            {t.tagline}
          </span>
        </div>
        <div className="justify-self-center">
          <LangToggle />
        </div>
        <nav className="flex items-center justify-end gap-1.5 text-sm sm:gap-2">
          <Link
            href={"/auth/sign-in?as=client" as Route}
            className="rounded-full border border-neutral-200 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-neutral-700 transition-colors duration-200 hover:border-neutral-300 hover:text-neutral-900 sm:px-4 sm:text-xs"
          >
            {t.nav.client}
          </Link>
          <Link
            href={"/auth/sign-in?as=operator" as Route}
            className="rounded-full bg-neutral-900 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white transition-colors duration-200 hover:bg-neutral-800 sm:px-4 sm:text-xs"
          >
            {t.nav.operator}
          </Link>
        </nav>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// HERO CONSOLE — multi-pane dark terminal with live transcript, KB hits, tools
// ---------------------------------------------------------------------------

// One 24-second animation cycle drives all three panes. Times below are in ms
// relative to the start of the current cycle.
const CONSOLE_CYCLE_MS = 24000;
const TRANSCRIPT_LINE_TYPE_MS = 1500;
const TRANSCRIPT_LINE_GAP_MS = 500;
const KB_START_MS = 11000;
const KB_PER_HIT_MS = 1100;
const TOOLS_START_MS = 16000;
const TOOLS_GAP_MS = 1800;

interface RenderedTranscript {
  side: "clinic" | "patient";
  text: string;
  typing: boolean;
  visible: boolean;
}

function computeTranscriptStates(
  elapsedMs: number,
  dialogue: DialogueLine[],
): RenderedTranscript[] {
  return dialogue.map((d, i) => {
    const lineStart = i * (TRANSCRIPT_LINE_TYPE_MS + TRANSCRIPT_LINE_GAP_MS);
    const lineEnd = lineStart + TRANSCRIPT_LINE_TYPE_MS;
    if (elapsedMs < lineStart) {
      return { side: d.side, text: "", typing: false, visible: false };
    }
    if (elapsedMs > lineEnd) {
      return { side: d.side, text: d.line, typing: false, visible: true };
    }
    const frac = (elapsedMs - lineStart) / TRANSCRIPT_LINE_TYPE_MS;
    return {
      side: d.side,
      text: d.line.slice(0, Math.max(0, Math.floor(d.line.length * frac))),
      typing: true,
      visible: true,
    };
  });
}

function HeroConsole() {
  const { t, lang } = useLang();
  const dialogue = DIALOGUES[lang];
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setElapsed(CONSOLE_CYCLE_MS - 1);
      return;
    }
    if (!visible) return;
    const start = performance.now();
    const tick = (now: number) => {
      setElapsed((now - start) % CONSOLE_CYCLE_MS);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [reduced, visible]);

  const transcriptStates = useMemo(
    () => computeTranscriptStates(elapsed, dialogue),
    [elapsed, dialogue],
  );

  // KB pane: from t=KB_START_MS, advance one source per KB_PER_HIT_MS.
  // Active = currently being checked (▸ emerald). Done = already consulted (✓).
  let kbActiveIdx = -1;
  let kbDoneCount = 0;
  if (elapsed > KB_START_MS) {
    const slot = Math.floor((elapsed - KB_START_MS) / KB_PER_HIT_MS);
    if (slot < KB_SOURCES.length) {
      kbActiveIdx = slot;
      kbDoneCount = slot;
    } else {
      kbDoneCount = KB_SOURCES.length;
    }
  }

  // Tools pane: each tool appears at TOOLS_START_MS + i * TOOLS_GAP_MS.
  const toolsVisible = TOOL_CALLS.map(
    (_, i) => elapsed > TOOLS_START_MS + i * TOOLS_GAP_MS,
  );

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 font-mono text-[10px] leading-relaxed text-neutral-300 shadow-2xl sm:text-[11px] md:text-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="truncate text-emerald-400">{t.console.title}</span>
        </div>
        <span className="shrink-0 text-neutral-500 tabular-nums">{t.console.statusLabel}</span>
      </div>

      {/* Transcript + Knowledge panes */}
      <div className="grid grid-cols-1 gap-px bg-neutral-800 md:grid-cols-2">
        {/* Transcript */}
        <div className="bg-neutral-950 p-3 sm:p-4">
          <div className="mb-2 text-[9px] uppercase tracking-wider text-neutral-500">
            ─ {t.console.paneTranscript}
          </div>
          <div className="space-y-1" style={{ minHeight: "140px" }}>
            {transcriptStates.map((s, i) =>
              s.visible ? (
                <div key={i} className="flex gap-2">
                  <span
                    className={
                      s.side === "clinic"
                        ? "shrink-0 text-emerald-400"
                        : "shrink-0 text-neutral-400"
                    }
                  >
                    {s.side === "clinic" ? t.console.speakerClinic : t.console.speakerPatient}
                  </span>
                  <span className="min-w-0 break-words text-neutral-200">
                    {s.text}
                    {s.typing && (
                      <span
                        aria-hidden="true"
                        className="ml-px inline-block h-[0.9em] w-[5px] translate-y-[1px] animate-pulse bg-emerald-400 align-middle"
                      />
                    )}
                  </span>
                </div>
              ) : null,
            )}
          </div>
        </div>

        {/* Knowledge */}
        <div className="bg-neutral-950 p-3 sm:p-4">
          <div className="mb-2 text-[9px] uppercase tracking-wider text-neutral-500">
            ─ {t.console.paneKnowledge}
          </div>
          <div className="space-y-1" style={{ minHeight: "140px" }}>
            {KB_SOURCES.map((src, i) => {
              const isActive = i === kbActiveIdx;
              const isDone = i < kbDoneCount;
              return (
                <div key={src} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={
                      isActive
                        ? "w-3 shrink-0 text-emerald-400"
                        : isDone
                          ? "w-3 shrink-0 text-emerald-600"
                          : "w-3 shrink-0 text-neutral-700"
                    }
                  >
                    {isActive ? "▸" : isDone ? "✓" : "·"}
                  </span>
                  <span
                    className={
                      isActive
                        ? "truncate text-emerald-200"
                        : isDone
                          ? "truncate text-neutral-400"
                          : "truncate text-neutral-600"
                    }
                  >
                    {src}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tools pane (full width) */}
      <div className="border-t border-neutral-800 p-3 sm:p-4">
        <div className="mb-2 text-[9px] uppercase tracking-wider text-neutral-500">
          ─ {t.console.paneTools}
        </div>
        <div className="space-y-1" style={{ minHeight: "78px" }}>
          {TOOL_CALLS.map((tc, i) => (
            <div
              key={tc.name}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 transition-opacity duration-300"
              style={{ opacity: toolsVisible[i] ? 1 : 0.15 }}
            >
              <span className="min-w-0">
                <span aria-hidden="true" className="text-emerald-400">▸ </span>
                <span className="text-neutral-200">{tc.name}</span>
                <span className="text-neutral-500">({tc.args})</span>
              </span>
              <span className="shrink-0 text-neutral-500 tabular-nums">
                {toolsVisible[i] ? `✓ ${tc.duration}` : "..."}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HERO
// ---------------------------------------------------------------------------

function HeroSignals() {
  const { t } = useLang();
  // Heartbeat dot pulse only — no fake counters.
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const [pulse, setPulse] = useState(1);

  useEffect(() => {
    if (reduced || !visible) return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const tt = (performance.now() - start) % 2000;
      setPulse(0.3 + 0.7 * (0.5 + 0.5 * Math.sin((tt / 2000) * Math.PI * 2)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, visible]);

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-wider text-neutral-600 sm:gap-x-6 sm:text-xs">
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full bg-emerald-500"
          style={{ opacity: pulse }}
        />
        {t.hero.statusUptime}
      </span>
      <span>{t.hero.statusLanguages}</span>
      <span>{t.hero.statusLatency}</span>
      <span>{t.hero.statusRegion}</span>
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
      {/* Dot grid background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(0,0,0,0.045) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center lg:gap-10">
          <div className="lg:col-span-5">
            <h1 className="text-4xl font-semibold leading-[0.95] tracking-tight text-neutral-900 sm:text-5xl md:text-6xl lg:text-6xl">
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
            <p className="mt-7 max-w-xl text-base leading-relaxed text-neutral-700 sm:mt-8 sm:text-lg">
              {t.hero.body}
            </p>
            <HeroSignals />
          </div>
          <div className="lg:col-span-7">
            <HeroConsole />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// HOW IT WORKS — 5-step animated rail
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
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-10">
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
                <li key={step} className="grid grid-cols-[36px_22px_1fr] items-stretch sm:grid-cols-[44px_24px_1fr]">
                  <div className="flex items-start pt-3 font-mono text-[10px] uppercase tracking-wider text-neutral-400 tabular-nums">
                    0{i + 1}
                  </div>
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
                  <div className={`pb-8 pt-2 transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-70"}`}>
                    <div
                      className={`text-base font-semibold tracking-tight transition-colors duration-300 sm:text-lg ${
                        isActive ? "text-emerald-700" : "text-neutral-900"
                      }`}
                    >
                      {step}
                    </div>
                    <pre
                      aria-hidden="true"
                      className={`mt-2 select-none whitespace-pre-wrap break-words font-mono text-[10px] tracking-tight transition-colors duration-300 sm:text-xs ${
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
// FEATURE VISUALS
// ---------------------------------------------------------------------------

// --- A. Knowledge: cycle Q → source → A ------------------------------------

function KnowledgeVisual() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const queries = t.features.knowledgeQueries;
  const [qIdx, setQIdx] = useState(0);
  const [stage, setStage] = useState<"question" | "searching" | "answer">("question");

  useEffect(() => {
    if (reduced) {
      setStage("answer");
      return;
    }
    if (!visible) return;
    let cancelled = false;
    const run = (idx: number) => {
      setQIdx(idx);
      setStage("question");
      const t1 = window.setTimeout(() => {
        if (cancelled) return;
        setStage("searching");
      }, 1400);
      const t2 = window.setTimeout(() => {
        if (cancelled) return;
        setStage("answer");
      }, 2400);
      const t3 = window.setTimeout(() => {
        if (cancelled) return;
        run((idx + 1) % queries.length);
      }, 5800);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
      };
    };
    const cleanup = run(0);
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [reduced, visible, queries.length]);

  const current = queries[qIdx]!;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-7">
      <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        <span>{t.features.knowledgeLabel}</span>
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            stage === "searching" ? "animate-pulse bg-emerald-500" : "bg-emerald-200"
          }`}
        />
      </div>
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 sm:text-base">
        {current.question}
      </div>

      <div className="mt-4 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        <span>
          {stage === "searching" ? t.features.knowledgeStateThinking : "ŹRÓDŁO"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`shrink-0 ${stage === "searching" ? "animate-pulse text-emerald-500" : "text-emerald-600"}`}
        >
          ▸
        </span>
        <span className="truncate font-mono text-xs text-neutral-700 sm:text-sm">
          {current.source}
        </span>
      </div>

      <div className="mt-4 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        {t.features.knowledgeStateAnswer}
      </div>
      <div
        className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 transition-opacity duration-500 sm:text-base"
        style={{ opacity: stage === "answer" ? 1 : 0.35 }}
      >
        {stage === "answer" ? current.answer : <span className="text-emerald-700/60">…</span>}
      </div>
    </div>
  );
}

// --- B. Language: pill rotation + typewriter sample ------------------------

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
      const totalMs = 1500;
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
      <div className="min-h-[3.5em] text-base leading-relaxed text-neutral-900 sm:text-lg">
        {typed}
        <span
          aria-hidden="true"
          className="ml-[2px] inline-block h-[1em] w-[5px] translate-y-[3px] bg-emerald-600 align-middle"
          style={{
            opacity: typed.length > 0 && typed.length < (samples[idx]?.length ?? 0) ? 1 : 0.25,
          }}
        />
      </div>
    </div>
  );
}

// --- C. Booking: 18-slot grid filling --------------------------------------

const BOOKING_HOURS: string[] = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
];

function BookingVisual() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const seed = useMemo<boolean[]>(
    () => BOOKING_HOURS.map((_, i) => i < 6 || (i > 9 && i % 2 === 0)),
    [],
  );
  const [slots, setSlots] = useState<boolean[]>(seed);
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
        <span className="truncate">{t.features.bookingLabel}</span>
        <span className="tabular-nums">
          {free} <span className="text-neutral-400">{t.features.bookingFreeLabel}</span>
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {slots.map((on, i) => {
          const isHighlight = i === justBooked;
          return (
            <div
              key={BOOKING_HOURS[i]}
              className={`rounded-md border px-1 py-2 text-center font-mono text-[9px] tabular-nums transition-colors duration-500 sm:text-[10px] ${
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

// --- D. SMS: rounded iPhone-style frame with chat bubble -------------------

function SmsVisual() {
  const { t } = useLang();
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const msg = t.features.smsBody;
  const phases = t.features.smsPhase;

  const [phase, setPhase] = useState<"empty" | "typing" | "delivered">(reduced ? "delivered" : "empty");
  const [typed, setTyped] = useState(reduced ? msg : "");

  useEffect(() => {
    if (reduced) {
      setPhase("delivered");
      setTyped(msg);
      return;
    }
    if (!visible) return;
    let cancelled = false;
    let timers: number[] = [];

    const run = () => {
      setPhase("empty");
      setTyped("");
      timers.push(
        window.setTimeout(() => {
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
              timers.push(window.setTimeout(tick, step));
            } else {
              setPhase("delivered");
              timers.push(
                window.setTimeout(() => {
                  if (cancelled) return;
                  run();
                }, 4500),
              );
            }
          };
          tick();
        }, 700),
      );
    };
    run();

    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
    };
  }, [reduced, visible, msg]);

  const phaseLabel =
    phase === "delivered" ? phases.delivered : phase === "typing" ? phases.sending : phases.queued;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-7">
      <div className="mb-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        <span>{t.features.smsHeader}</span>
        <span className="tabular-nums">{phaseLabel}</span>
      </div>

      <div className="mx-auto w-full max-w-[240px]">
        {/* Phone outer (bezel) */}
        <div className="rounded-[32px] border border-neutral-800 bg-neutral-900 p-1.5 shadow-lg">
          {/* Phone screen */}
          <div
            className="relative rounded-[26px] bg-neutral-50"
            style={{ minHeight: "300px" }}
          >
            {/* Notch */}
            <div className="mx-auto h-5 w-24 rounded-b-2xl bg-neutral-900" />

            <div className="px-4 pt-4 pb-6">
              {/* Sender header */}
              <div className="mb-4 text-center">
                <div className="mx-auto mb-1 h-9 w-9 rounded-full border border-neutral-200 bg-white" />
                <div className="font-mono text-[9px] text-neutral-500">+48 22 555 12 34</div>
              </div>

              {/* Time pill */}
              <div className="mb-2 text-center">
                <span className="rounded-full bg-neutral-200/60 px-2 py-0.5 font-mono text-[8px] text-neutral-500">
                  {t.features.smsTimePill}
                </span>
              </div>

              {/* Message bubble (left-aligned, incoming) */}
              <div className="flex">
                <div
                  className={`relative max-w-[85%] rounded-[18px] rounded-bl-[6px] px-3 py-2 text-[12px] leading-snug shadow-sm transition-colors duration-500 ${
                    typed.length > 0
                      ? "bg-emerald-100 text-neutral-900"
                      : "bg-neutral-200/70 text-neutral-400"
                  }`}
                >
                  <span className="break-words">
                    {typed || "…"}
                    {phase === "typing" && (
                      <span
                        aria-hidden="true"
                        className="ml-[2px] inline-block h-[0.9em] w-[4px] translate-y-[1px] animate-pulse bg-emerald-600 align-middle"
                      />
                    )}
                  </span>
                </div>
              </div>

              {/* Delivered tick */}
              <div className="mt-1 ml-2 h-[14px] font-mono text-[8px] text-emerald-600">
                {phase === "delivered" ? "delivered ✓✓" : ""}
              </div>
            </div>

            {/* Home indicator */}
            <div className="absolute bottom-2 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-neutral-300" />
          </div>
        </div>
      </div>
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
    <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:items-center md:gap-12">
      <div className={`md:col-span-6 ${reverse ? "md:order-2" : ""}`}>
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
                className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`md:col-span-6 ${reverse ? "md:order-1" : ""}`}>{visual}</div>
    </div>
  );
}

function FeaturesSection() {
  const { t } = useLang();
  return (
    <section className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
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
          <FeatureRow copy={t.features.rows[0]} visual={<KnowledgeVisual />} />
          <FeatureRow copy={t.features.rows[1]} visual={<LanguageVisual />} reverse />
          <FeatureRow copy={t.features.rows[2]} visual={<BookingVisual />} />
          <FeatureRow copy={t.features.rows[3]} visual={<SmsVisual />} reverse />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// LIVE TRANSCRIPT LEDGER
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
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mb-8 max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
            {t.ledger.eyebrow}
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            {t.ledger.title}
          </h2>
        </div>
        <div
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-7"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, transparent 0, transparent calc(2rem - 1px), rgba(0,0,0,0.04) calc(2rem - 1px), rgba(0,0,0,0.04) 2rem)",
            backgroundSize: "100% 2rem",
            backgroundPosition: "0 1.25rem",
          }}
        >
          <div className="flex flex-col gap-3" style={{ minHeight: `${dialogue.length * 40}px` }}>
            {lines.map((l, i) => (
              <div key={i} className="flex items-baseline gap-2 sm:gap-4">
                <span className="hidden w-16 shrink-0 font-mono text-xs tabular-nums text-neutral-400 sm:inline">
                  {l.ts}
                </span>
                <span
                  className={
                    l.side === "clinic"
                      ? "min-w-[64px] shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-center font-mono text-[10px] text-emerald-700 sm:min-w-[72px] sm:text-xs"
                      : "min-w-[64px] shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-center font-mono text-[10px] text-neutral-600 sm:min-w-[72px] sm:text-xs"
                  }
                >
                  {l.side === "clinic" ? t.ledger.speakerClinic : t.ledger.speakerPatient}
                </span>
                <span className="min-w-0 flex-1 break-words text-sm text-neutral-800 sm:text-base">
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
// "WHAT WE DO NOT DO"
// ---------------------------------------------------------------------------

function DontSection() {
  const { t } = useLang();
  return (
    <section className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-10">
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
                className="flex items-start gap-4 border-t border-neutral-200 py-5 first:border-t-0 first:pt-0 sm:gap-5"
              >
                <span className="mt-1 shrink-0 font-mono text-xs uppercase tracking-wider text-neutral-400 tabular-nums">
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
// Sign-in note
// ---------------------------------------------------------------------------

function SignInNote() {
  const { t } = useLang();
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
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-10">
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
          <div className="mt-7 inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 font-mono text-xl tabular-nums tracking-[0.2em] text-neutral-900 sm:gap-2 sm:px-5 sm:py-4 sm:text-2xl sm:tracking-[0.4em]">
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

// Mailto placeholder — recipient to be wired once a real inbox is set up.
const MAILTO_DEMO =
  "mailto:hello@example.com?subject=AI%20Receptionist%20%E2%80%94%20rozmowa&body=Klinika%3A%20%0AMiasto%3A%20%0ATelefon%3A%20";

function CtaSection() {
  const { t } = useLang();
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28 md:py-32">
        <div className="font-mono text-xs uppercase tracking-wider text-neutral-500">
          {t.cta.eyebrow}
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
          {t.cta.headline}
        </h2>
        <p className="mt-6 text-base leading-relaxed text-neutral-700 sm:text-lg">{t.cta.body}</p>
        <a
          href={MAILTO_DEMO}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-neutral-800 sm:px-7 sm:py-3.5"
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
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-8 sm:px-6">
        <span className="text-base font-semibold tracking-tight text-neutral-900">
          {t.footer.copyright}
        </span>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-neutral-500 sm:gap-3 sm:text-xs">
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
