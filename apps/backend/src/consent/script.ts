/**
 * Consent script fragments — sourced from apps/backend/ontology/consent.md.
 * These strings are the canonical wording the agent must use; the classifier
 * receives the caller's response to the consent question and decides
 * yes/no/ambiguous.
 *
 * Hard rule (CLAUDE.md): ambiguous defaults to consentFlag=false.
 */

export type ConsentLanguage = "pl" | "en" | "ru";

export const CONSENT_QUESTION: Record<ConsentLanguage, string> = {
  pl: "Czy zgadza się Pan / Pani na zachowanie zapisu tej rozmowy w celu poprawy jakości obsługi? Nagranie głosu nigdy nie jest przechowywane.",
  en: "Do you consent to a transcript of this call being kept for service-quality purposes? Voice audio is never stored regardless.",
  ru: "Согласны ли вы на сохранение записи этого разговора для улучшения качества обслуживания? Голосовая запись не сохраняется в любом случае.",
};

export const CONSENT_ACK_YES: Record<ConsentLanguage, string> = {
  pl: "Dziękuję. W takim razie kontynuujmy.",
  en: "Thank you. Let's continue.",
  ru: "Спасибо. Продолжим.",
};

export const CONSENT_ACK_NO: Record<ConsentLanguage, string> = {
  pl: "Rozumiem. Nie zachowam zapisu tej rozmowy. W czym mogę pomóc?",
  en: "Understood. I will not keep a transcript. How can I help?",
  ru: "Понятно. Запись не сохраню. Чем могу помочь?",
};

export const AFFIRMATIVE_EXAMPLES: Record<ConsentLanguage, string[]> = {
  pl: ["tak", "tak, zgadzam się", "oczywiście", "nie mam nic przeciwko", "okej", "dobrze", "proszę bardzo"],
  en: ["yes", "sure", "of course", "that's fine", "okay", "go ahead", "no problem"],
  ru: ["да", "согласен", "согласна", "конечно", "не возражаю", "хорошо"],
};

export const NEGATIVE_EXAMPLES: Record<ConsentLanguage, string[]> = {
  pl: ["nie", "nie zgadzam się", "wolałbym nie", "nie chcę", "proszę nie nagrywać"],
  en: ["no", "I don't consent", "please don't", "I'd rather not", "no thanks"],
  ru: ["нет", "не согласен", "не согласна", "не хочу", "пожалуйста, не записывайте"],
};
