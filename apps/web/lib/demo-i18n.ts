/**
 * Localized strings for the public sales-demo page at /demo/[agentId].
 * Default language is Polish; English + Russian provided so prospects who
 * prefer a different language can switch via the top-right language toggle.
 *
 * Keep strings short — the page is meant to be scannable on a phone.
 */

export type DemoLocale = "pl" | "en" | "ru";

export const DEMO_LOCALES: DemoLocale[] = ["pl", "en", "ru"];

export function isDemoLocale(s: string | null | undefined): s is DemoLocale {
  return s === "pl" || s === "en" || s === "ru";
}

export interface DemoStrings {
  // Page-level
  badge: string;
  taglinePrefix: string;
  hero: string;
  whyTitle: string;
  features: { title: string; body: string }[];
  notesTitle: string;
  notes: string[];
  callSectionTitle: string;
  callSectionSubtitle: string;

  // Voice/chat client UI
  modeVoice: string;
  modeChat: string;
  statusReady: string;
  statusConnecting: string;
  statusListening: string;
  statusSpeaking: string;
  statusConnected: string;
  startCall: string;
  startChat: string;
  endCall: string;
  endChat: string;
  micAllowed: string;
  micBlocked: string;
  micNotRequested: string;
  micBlockedExplain: string;
  liveTranscript: string;
  clearTranscript: string;
  transcriptPlaceholderVoice: string;
  transcriptPlaceholderChat: string;
  speakerYou: string;
  speakerAgent: string;
  chatInputPlaceholder: string;
  chatInputDisabled: string;
  sendButton: string;

  // Past sessions pane (PIN-scoped)
  pastSessionsTitle: string;
  pastSessionsEmpty: string;
  pastSessionsDuration: string;
  pastSessionsLanguage: string;
  pastSessionsBooked: string;
  pastSessionsViewToggle: string;

  // Privacy notice (rendered near the Start call button so it lands in
  // the caller's eye before they speak). EU AI Act transparency + GDPR
  // Article 6(1)(f) legitimate-interest basis for transcript retention.
  privacyNotice: string;

  // Footer
  poweredBy: string;
}

const PL: DemoStrings = {
  badge: "Demo",
  taglinePrefix: "Asystent AI dla",
  hero: "Kliknij niżej i porozmawiaj po polsku z asystentem AI Twojej kliniki. Spróbuj umówić wizytę.",
  whyTitle: "Co potrafi ten asystent",
  features: [
    {
      title: "Działa 24/7",
      body: "Odbiera połączenia poza godzinami pracy recepcji — wieczorami, w weekendy, podczas obłożenia.",
    },
    {
      title: "Trzy języki natywnie",
      body: "Polski, angielski, rosyjski. Wykrywa język rozmówcy automatycznie podczas pierwszych sekund.",
    },
    {
      title: "Wiedza o klinice",
      body: "Zna usługi, ceny, lekarzy i godziny pracy — wyciągnięte ze strony internetowej kliniki.",
    },
    {
      title: "Głos i czat",
      body: "Możesz rozmawiać głosowo (mikrofon) lub pisać. Obydwa kanały są dostępne natychmiast.",
    },
    {
      title: "Rezerwacja terminów",
      body: "Sprawdza wolne sloty i potwierdza wizyty. W demie sloty są symulowane; w produkcji integrujemy się z Booksy, Medfile, Google Calendar lub innym Twoim systemem.",
    },
    {
      title: "SMS-owe potwierdzenie",
      body: "Po umówieniu wizyty otrzymasz SMS z linkiem do potwierdzenia i opcją dodania do kalendarza — podyktuj swój numer telefonu, gdy asystent zapyta.",
    },
  ],
  notesTitle: "Ważne uwagi do dema",
  notes: [
    "Wiedza asystenta opiera się na automatycznym scrapingu strony Twojej kliniki — w demie mogą wystąpić drobne nieścisłości lub brakujące informacje. W produkcji wszystko audytujemy razem z Tobą i wzbogacamy o dodatkową wiedzę (cenniki, procedury, języki personelu).",
    "Integracja z Twoim systemem rezerwacji i CRM-em jest obecnie wyłączona — wymaga dostępu do Twojego konta Booksy / Medfile / Google Calendar. W produkcji konfigurujemy ją w ciągu jednego dnia.",
    "SMS-y w demie wysyłamy z neutralnego nadawcy. W produkcji nadawca to nazwa Twojej kliniki.",
  ],
  callSectionTitle: "Porozmawiaj z asystentem",
  callSectionSubtitle:
    "Wybierz głos albo czat. Tryb głosowy daje pełne doświadczenie prawdziwego dzwoniącego.",
  modeVoice: "Głos",
  modeChat: "Czat",
  statusReady: "Gotowy",
  statusConnecting: "Łączenie…",
  statusListening: "Słucham Cię",
  statusSpeaking: "Asystent mówi",
  statusConnected: "Połączony (czat)",
  startCall: "Rozpocznij rozmowę",
  startChat: "Rozpocznij czat",
  endCall: "Zakończ rozmowę",
  endChat: "Zakończ czat",
  micAllowed: "Dozwolony",
  micBlocked: "Zablokowany",
  micNotRequested: "Nie poproszony",
  micBlockedExplain:
    "Mikrofon jest zablokowany. Otwórz ustawienia witryny w przeglądarce, zezwól na mikrofon i odśwież stronę.",
  liveTranscript: "Transkrypcja na żywo",
  clearTranscript: "Wyczyść",
  transcriptPlaceholderVoice: "Transkrypcja pojawia się tutaj, gdy mówisz.",
  transcriptPlaceholderChat: "Wyślij pierwszą wiadomość poniżej, aby zacząć.",
  speakerYou: "Ty",
  speakerAgent: "Asystent",
  chatInputPlaceholder: "Napisz wiadomość po polsku…",
  chatInputDisabled: 'Kliknij „Rozpocznij czat", aby zacząć',
  sendButton: "Wyślij",
  pastSessionsTitle: "Twoje wcześniejsze rozmowy",
  pastSessionsEmpty: "Nie masz jeszcze żadnych nagranych rozmów testowych.",
  pastSessionsDuration: "Czas trwania",
  pastSessionsLanguage: "Język",
  pastSessionsBooked: "Umówiona wizyta",
  pastSessionsViewToggle: "Pokaż transkrypcję",
  privacyNotice:
    "Rozmawiasz z asystentem AI. Połączenie może być transkrybowane w celu zapewnienia jakości obsługi; nagranie głosu nie jest przechowywane.",
  poweredBy: "Powered by AI Receptionist",
};

const EN: DemoStrings = {
  badge: "Demo",
  taglinePrefix: "AI receptionist for",
  hero: "Click below and talk to your clinic's AI assistant. Try booking an appointment.",
  whyTitle: "What this assistant does",
  features: [
    {
      title: "24/7 availability",
      body: "Answers calls outside reception hours — evenings, weekends, peak times.",
    },
    {
      title: "Three languages, natively",
      body: "Polish, English, Russian. Auto-detects the caller's language within the first few seconds.",
    },
    {
      title: "Clinic knowledge",
      body: "Knows services, prices, doctors, working hours — scraped from the clinic's website.",
    },
    {
      title: "Voice and chat",
      body: "Talk by microphone or type. Both channels work immediately.",
    },
    {
      title: "Appointment booking",
      body: "Checks available slots and confirms bookings. Demo slots are simulated; in production we integrate with Booksy, Medfile, Google Calendar, or your existing system.",
    },
    {
      title: "SMS confirmation",
      body: "After booking, you get an SMS with a confirmation link and an add-to-calendar option — dictate your phone number when the assistant asks.",
    },
  ],
  notesTitle: "Demo caveats",
  notes: [
    "The assistant's knowledge is auto-scraped from the clinic's website — in this demo there may be minor inaccuracies or gaps. In production we audit everything with you and enrich it with extra knowledge (pricing, procedures, staff languages).",
    "Integration with your booking system and CRM is currently disabled — it needs access to your Booksy / Medfile / Google Calendar account. In production we configure it within a day.",
    "Demo SMS sends from a neutral sender ID. In production the sender ID is your clinic's name.",
  ],
  callSectionTitle: "Talk to the assistant",
  callSectionSubtitle: "Pick voice or chat. Voice mode gives the full experience of a real caller.",
  modeVoice: "Voice",
  modeChat: "Chat",
  statusReady: "Ready",
  statusConnecting: "Connecting…",
  statusListening: "Listening to you",
  statusSpeaking: "Agent speaking",
  statusConnected: "Connected (chat)",
  startCall: "Start call",
  startChat: "Start chat",
  endCall: "End call",
  endChat: "End chat",
  micAllowed: "Allowed",
  micBlocked: "Blocked",
  micNotRequested: "Not requested",
  micBlockedExplain:
    "Microphone is blocked. Open browser site settings, allow microphone, then reload.",
  liveTranscript: "Live transcript",
  clearTranscript: "Clear",
  transcriptPlaceholderVoice: "Transcript appears here as you talk.",
  transcriptPlaceholderChat: "Send your first message below to start.",
  speakerYou: "You",
  speakerAgent: "Agent",
  chatInputPlaceholder: "Type a message…",
  chatInputDisabled: "Click Start chat to begin",
  sendButton: "Send",
  pastSessionsTitle: "Your previous sessions",
  pastSessionsEmpty: "No test sessions recorded yet.",
  pastSessionsDuration: "Duration",
  pastSessionsLanguage: "Language",
  pastSessionsBooked: "Booked",
  pastSessionsViewToggle: "Show transcript",
  privacyNotice:
    "You are talking to an AI assistant. The conversation may be transcribed for service-quality purposes; voice recordings are not stored.",
  poweredBy: "Powered by AI Receptionist",
};

const RU: DemoStrings = {
  badge: "Демо",
  taglinePrefix: "AI-ассистент для",
  hero: "Нажмите ниже и поговорите по-русски с AI-ассистентом клиники. Попробуйте записаться на приём.",
  whyTitle: "Что умеет этот ассистент",
  features: [
    {
      title: "Работает 24/7",
      body: "Отвечает на звонки вне рабочих часов регистратуры — вечером, в выходные, при загрузке.",
    },
    {
      title: "Три языка изначально",
      body: "Польский, английский, русский. Автоматически определяет язык собеседника в первые секунды.",
    },
    {
      title: "Знания о клинике",
      body: "Знает услуги, цены, врачей и часы работы — собрано со страницы клиники.",
    },
    {
      title: "Голос и чат",
      body: "Можно говорить через микрофон или писать. Оба канала доступны сразу.",
    },
    {
      title: "Запись на приём",
      body: "Проверяет свободные слоты и подтверждает запись. В демо слоты симулированы; в продакшене интегрируемся с Booksy, Medfile, Google Calendar или вашей системой.",
    },
    {
      title: "SMS-подтверждение",
      body: "После записи приходит SMS с ссылкой на подтверждение и добавлением в календарь — продиктуйте свой номер, когда ассистент спросит.",
    },
  ],
  notesTitle: "Замечания о демо",
  notes: [
    "Знания ассистента основаны на автоматическом сборе данных со страницы клиники — в демо возможны небольшие неточности или пробелы. В продакшене всё проверяется вместе с вами и дополняется (цены, процедуры, языки персонала).",
    "Интеграция с вашей системой записи и CRM сейчас отключена — нужен доступ к вашему аккаунту Booksy / Medfile / Google Calendar. В продакшене настраиваем за один день.",
    "В демо SMS отправляются с нейтрального отправителя. В продакшене — с названия вашей клиники.",
  ],
  callSectionTitle: "Поговорите с ассистентом",
  callSectionSubtitle:
    "Выберите голос или чат. Голосовой режим даёт полный опыт реального звонящего.",
  modeVoice: "Голос",
  modeChat: "Чат",
  statusReady: "Готов",
  statusConnecting: "Соединение…",
  statusListening: "Слушаю вас",
  statusSpeaking: "Ассистент говорит",
  statusConnected: "Подключён (чат)",
  startCall: "Начать разговор",
  startChat: "Начать чат",
  endCall: "Завершить разговор",
  endChat: "Завершить чат",
  micAllowed: "Разрешён",
  micBlocked: "Заблокирован",
  micNotRequested: "Не запрошен",
  micBlockedExplain:
    "Микрофон заблокирован. Откройте настройки сайта в браузере, разрешите микрофон и обновите страницу.",
  liveTranscript: "Транскрипция в реальном времени",
  clearTranscript: "Очистить",
  transcriptPlaceholderVoice: "Транскрипция появляется здесь, когда вы говорите.",
  transcriptPlaceholderChat: "Отправьте первое сообщение ниже, чтобы начать.",
  speakerYou: "Вы",
  speakerAgent: "Ассистент",
  chatInputPlaceholder: "Напишите сообщение…",
  chatInputDisabled: "Нажмите «Начать чат», чтобы начать",
  sendButton: "Отправить",
  pastSessionsTitle: "Ваши прошлые сессии",
  pastSessionsEmpty: "Тестовых сессий пока нет.",
  pastSessionsDuration: "Длительность",
  pastSessionsLanguage: "Язык",
  pastSessionsBooked: "Запись",
  pastSessionsViewToggle: "Показать стенограмму",
  privacyNotice:
    "Вы разговариваете с AI-ассистентом. Разговор может транскрибироваться для контроля качества обслуживания; запись голоса не сохраняется.",
  poweredBy: "Powered by AI Receptionist",
};

export const DEMO_STRINGS: Record<DemoLocale, DemoStrings> = {
  pl: PL,
  en: EN,
  ru: RU,
};
