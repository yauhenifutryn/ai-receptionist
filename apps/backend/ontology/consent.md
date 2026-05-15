# Consent script — Layer 1 ontology (REAL CONTENT, vertical-independent)

> Per `CLAUDE.md` and `docs/AI-SPEC.md`: consent wording is vertical-independent. RODO-driven, not domain-driven. The runtime classifier in `apps/backend/consent/` consumes this file.
>
> **Hard rule**: the consent question runs deterministically as the agent's first turn. Default to `consent_flag = false` if classifier returns ambiguous.
>
> **What the consent covers**: (a) the caller is talking to an AI agent, (b) transcript may be retained for service-quality purposes if they consent, (c) audio is never stored regardless.

---

## Polish (default)

**Greeting + AI disclosure (always said, no consent needed for this part — it's mandatory transparency under EU AI Act limited-risk):**

> Dzień dobry, dodzwonił się Pan / dodzwoniła się Pani do recepcji <NAZWA_TENANTA>. Rozmawia Pan/Pani z asystentem głosowym AI. W czym mogę pomóc?

**Consent question (asked once at the natural break after the caller states their intent, before any data-handling step):**

> Czy zgadza się Pan / Pani na zachowanie zapisu tej rozmowy w celu poprawy jakości obsługi? Nagranie głosu nigdy nie jest przechowywane.

**Acceptable affirmative responses** → `consent_flag = true`:

- "Tak", "tak, zgadzam się", "oczywiście", "nie mam nic przeciwko", "okej", "dobrze", "proszę bardzo".

**Acceptable negative responses** → `consent_flag = false`:

- "Nie", "nie zgadzam się", "wolałbym nie", "nie chcę", "proszę nie nagrywać".

**Ambiguous responses** → `consent_flag = false` (default-deny):

- Silence, off-topic answer, "nie wiem", "może później", any answer the classifier returns with confidence < 0.7.

**Acknowledgement after consent decision:**

If `consent_flag = true`:

> Dziękuję. W takim razie kontynuujmy.

If `consent_flag = false`:

> Rozumiem. Nie zachowam zapisu tej rozmowy. W czym mogę pomóc?

---

## English (auto-switched if first 2 sec of caller audio detect EN)

**Greeting + AI disclosure:**

> Hello, you've reached the reception of <TENANT_NAME>. You're speaking with an AI voice assistant. How can I help?

**Consent question:**

> Do you consent to a transcript of this call being kept for service-quality purposes? Voice audio is never stored regardless.

**Affirmative responses** → `consent_flag = true`:

- "Yes", "sure", "of course", "that's fine", "okay", "go ahead", "no problem".

**Negative responses** → `consent_flag = false`:

- "No", "I don't consent", "please don't", "I'd rather not", "no thanks".

**Ambiguous** → `consent_flag = false`:

- Silence, off-topic, "I don't know", "maybe later", classifier confidence < 0.7.

**Acknowledgement:**

If `consent_flag = true`:

> Thank you. Let's continue.

If `consent_flag = false`:

> Understood. I will not keep a transcript. How can I help?

---

## Russian (auto-switched if first 2 sec of caller audio detect RU/UA)

**Greeting + AI disclosure:**

> Здравствуйте, вы дозвонились в рецепцию <TENANT_NAME>. Вы разговариваете с голосовым ассистентом на основе ИИ. Чем могу помочь?

**Consent question:**

> Согласны ли вы на сохранение записи этого разговора для улучшения качества обслуживания? Голосовая запись не сохраняется в любом случае.

**Affirmative** → `consent_flag = true`:

- "Да", "согласен", "согласна", "конечно", "не возражаю", "хорошо".

**Negative** → `consent_flag = false`:

- "Нет", "не согласен", "не согласна", "не хочу", "пожалуйста, не записывайте".

**Ambiguous** → `consent_flag = false` (silence, off-topic, "не знаю", confidence < 0.7).

**Acknowledgement:**

If `consent_flag = true`:

> Спасибо. Продолжим.

If `consent_flag = false`:

> Понятно. Запись не сохраню. Чем могу помочь?

---

## Implementation notes (for `apps/backend/consent/`)

- Consent classifier: Claude Haiku 4.5, temperature 0, structured Zod-validated output `{ consent: "yes" | "no" | "ambiguous", confidence: number }`.
- Runtime evaluation: classifier called on the first user turn AFTER the consent question has been asked, BEFORE any other agent action.
- Persistence: `consent_log` row written to Supabase regardless of decision (for audit). `transcripts` row gated on `consent_flag === true`.
- Localization: classifier prompt is the same regardless of language; the language detector (separate component) determines which set of acceptable phrases to score against.
- Default-deny on classifier failure / API timeout / parse error.
