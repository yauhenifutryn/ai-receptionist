# Clinic website notice — mandatory production publication

**Audience**: Sebastian + Jenya, during clinic onboarding.
**Purpose**: every clinic that publishes a phone number routed to our AI receptionist MUST also publish a short transparency notice next to that phone number. Required by EU AI Act (limited-risk transparency) and used as the lawfulness basis for transcript retention under GDPR Article 6(1)(f) legitimate interest.

## Where the clinic must publish the notice

ANY surface where the AI-routed phone number appears:

- Contact page / footer of the clinic's website (primary).
- Google Business listing (when feasible).
- Booksy / Medfile / ZnanyLekarz profile, if the number is also published there.
- Any printed material (waiting-room signage, business cards) — same text.

Minimum surface: the website contact page. Without that, we do NOT switch the agent into production for that clinic — Sebastian flags this in the onboarding checklist.

## Polish boilerplate (drop-in)

> **Asystent głosowy AI**
>
> Niniejszy numer telefonu obsługiwany jest przez asystenta głosowego opartego na sztucznej inteligencji ({brand}). Asystent na wstępie informuje rozmówcę, że jest AI. Połączenie może być transkrybowane w celu zapewnienia jakości obsługi i poprawy działania systemu; **nagranie głosu nie jest przechowywane**. Dzwoniąc, Pan/Pani akceptuje przetwarzanie podanych danych osobowych (imię, treść rozmowy) w celu realizacji wizyty zgodnie z naszą [Polityką Prywatności]({privacy-policy-url}). Podstawą prawną jest art. 6 ust. 1 lit. b) RODO (działania przed zawarciem umowy) oraz art. 9 ust. 2 lit. h) RODO (świadczenie opieki zdrowotnej). Zachowanie transkryptu opiera się na art. 6 ust. 1 lit. f) RODO (prawnie uzasadniony interes — jakość obsługi).
>
> Kontakt: {clinic-email}.

Substitute `{brand}`, `{privacy-policy-url}`, `{clinic-email}` per clinic.

## English variant (for international-facing clinics)

> **AI voice assistant**
>
> This phone number is handled by an AI-based voice assistant ({brand}). The assistant identifies itself as AI at the start of every call. Connections may be transcribed for service-quality purposes; **voice recordings are not stored**. By calling, you accept processing of the personal data you provide (name, conversation content) for the purpose of arranging your visit, in accordance with our [Privacy Policy]({privacy-policy-url}). Lawful basis: GDPR Article 6(1)(b) (pre-contractual measures) and Article 9(2)(h) (provision of healthcare). Transcript retention is based on Article 6(1)(f) (legitimate interest — service quality).
>
> Contact: {clinic-email}.

## Russian variant

> **Голосовой AI-ассистент**
>
> Этот номер телефона обслуживается голосовым ассистентом на базе искусственного интеллекта ({brand}). Ассистент в начале каждого звонка сообщает, что является AI. Разговоры могут транскрибироваться для контроля качества обслуживания; **запись голоса не сохраняется**. Звоня, Вы принимаете обработку предоставленных персональных данных (имя, содержание разговора) для цели организации визита в соответствии с нашей [Политикой Конфиденциальности]({privacy-policy-url}). Правовое основание: ст. 6(1)(b) GDPR (преддоговорные меры) и ст. 9(2)(h) (оказание медицинских услуг). Хранение транскриптов основано на ст. 6(1)(f) (законный интерес — качество обслуживания).
>
> Контакт: {clinic-email}.

## What goes WHERE on the clinic site

- **Contact / phone page**: full notice in the local language, visible without scrolling near the AI-routed number.
- **Privacy Policy**: an expanded section ("Use of an AI voice assistant") covering subprocessors (ElevenLabs, Twilio, our backend on Vercel + Supabase EU), retention periods (transcripts ≤ 30 days unless a booking was made), and the data subject rights (access, deletion, complaint to the supervisory authority).
- **Footer (optional)**: one-line link "AI voice assistant — info" pointing to the contact page section.

## Operator checklist before flipping a clinic to production

- [ ] Notice published on clinic's contact page.
- [ ] Privacy Policy updated with the AI assistant section.
- [ ] Sender ID for SMS confirmed (shared "AIRecept" default OR per-clinic upgrade).
- [ ] One end-to-end test call from a real Polish number, transcript visible in operator dashboard.
- [ ] Owner has signed the pilot agreement (covers data-processing terms).

Without all five, the agent stays in test mode.

## Why this matters legally

- **EU AI Act, limited-risk transparency**: AI systems that interact with humans must disclose AI nature. Satisfied by (a) website notice + (b) agent disclosure on first turn.
- **GDPR Article 6(1)(b)**: handling the call to arrange a visit is pre-contractual processing — no consent needed.
- **GDPR Article 9(2)(h)**: special-category data (health information mentioned during triage) is lawful for the provision of healthcare.
- **GDPR Article 6(1)(f)**: transcript retention for service quality is legitimate-interest processing. Requires a one-page Legitimate Interest Assessment (LIA) — Jenya keeps the current version of that document on file; it stays internal unless asked for by a supervisory authority.

If a clinic owner asks "do I need explicit consent?", the answer is no for basic call processing and booking; legitimate interest covers the transcript retention provided the website notice is published.
