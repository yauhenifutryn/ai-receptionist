# Triage: Layer 1 ontology (dental, reference only)

> Authored 2026-05-21, demoted 2026-05-22. **This file is REFERENCE material.** Three urgency tiers with classification criteria. **Dialogue prescriptions removed** — the agent's actual phrasing comes from the system prompt + per-clinic knowledge. The ontology defines what each tier IS; it does not script what the agent says.

Każdy poziom ma dwa elementy: kryteria klasyfikacji (jakie objawy / zwroty wpadają do tej kategorii) i ogólny kierunek działania (np. "eskaluj natychmiast" vs "standardowy flow rezerwacji"). Konkretne sformułowania zawsze pochodzą z system promptu, nie z tej ontologii.

---

## NAGŁY

Trigger: stan zagrażający zdrowiu lub życiu, wymaga interwencji w ciągu minut.

Kryteria (jeśli choć jeden spełniony, traktuj jako nagły):

- Niekontrolowane krwawienie z jamy ustnej, które nie ustaje po 15 minutach uciskania gazikiem.
- Obrzęk twarzy, szyi lub dna jamy ustnej utrudniający oddychanie, mówienie lub przełykanie.
- Uraz twarzoczaszki z utratą przytomności, zawrotami głowy lub wymiotami.
- Wybity stały ząb (avulsja). Czas krytyczny: 30 minut na reimplantację. Ząb przechowywać w mleku lub fizjologicznym roztworze soli, nie myć korzenia.
- Ból tak silny, że pacjent nie jest w stanie mówić, krzyczy, lub stracił przytomność z bólu.
- Pacjent po niedawnym zabiegu z gorączką powyżej 38.5°C i postępującym obrzękiem (podejrzenie ropnia / sepsy).

Kierunek działania (NIE skrypt, tylko ogólna instrukcja behawioralna):

- Eskalacja natychmiastowa: pogotowie 112 lub izba przyjęć szpitala.
- Nie umawiać standardowej wizyty. Pacjent musi trafić do lekarza w trybie ostrym, nie planowym.
- Jeśli klinika ma dyżurnego lekarza, próbować przekierowania połączenia.
- Agent ma być stanowczy nawet przy wahaniu pacjenta.

---

## PILNY

Trigger: silny dyskomfort lub objawy infekcyjne wymagające wizyty tego samego dnia lub w ciągu 24 godzin.

Kryteria (jeden lub więcej):

- Silny, pulsujący ból zęba nie ustępujący po lekach przeciwbólowych OTC (ibuprofen, paracetamol).
- Widoczny ropień, opuchnięcie dziąsła z wyciekiem ropy, "bąbel" przy zębie.
- Złamany ząb z wyeksponowanym nerwem (różowy lub czerwony punkt w środku złamanego zęba), ostre, kłujące krawędzie.
- Powikłanie po niedawnym zabiegu: ból narastający 3–5 dni po ekstrakcji ("suchy zębodół"), gorączka do 38.5°C, utrzymujący się obrzęk po pierwszej dobie.
- Wypadnięta korona lub most w przednim zębie (wpływa na funkcję i estetykę pilnie). Wypadnięta plomba bez bólu i bez ostrych krawędzi: zwykle PLANOWY; z ostrymi krawędziami lub odsłoniętym nerwem: PILNY.
- Uraz, w którym ząb mleczny został wybity u dziecka (mleczaków się nie wszczepia, ale wymaga oceny).
- Krwawienie z dziąseł, które uspokoiło się ale nawraca, lub krwawienie z miejsca po ekstrakcji wracające po 24 godzinach.

Kierunek działania:

- Priorytet: wizyta tego samego dnia lub w ciągu 24 godzin.
- Jeśli klinika ma wewnętrzną kolejkę pilnych, dodać pacjenta do listy.
- Jeśli brak miejsc w 24h: poinformować pacjenta i zasugerować izbę przyjęć lub dyżur stomatologiczny.
- Eskalacja do człowieka, jeśli klinika nie ma terminu i objawy mocno odbiegają od normy (gorączka, wzrastający obrzęk).

---

## PLANOWY

Trigger: rutynowa wizyta, planowa procedura, łagodne dolegliwości bez pilności.

Kryteria:

- Przegląd, kontrola, higienizacja, fluoryzacja.
- Konsultacja przed planowanym leczeniem (ortodoncja, implant, wybielanie).
- Drobny dyskomfort: lekka nadwrażliwość na zimno, czuły ząb po jedzeniu, drobny ubytek bez bólu.
- Wypadnięta plomba w zębie bocznym bez bólu.
- Kontynuacja leczenia (np. druga wizyta w ramach leczenia kanałowego po założeniu opatrunku, wymiana protezy, kontrola po implancie).
- Estetyka bez aspektu bólowego: wybielanie, licówki, korekta uśmiechu.

Kierunek działania:

- Standardowy flow rezerwacji: propozycja 2–3 terminów, potwierdzenie wybranego, SMS z potwierdzeniem.
- Eskalacja do człowieka tylko na wyraźną prośbę pacjenta.

---

## Zasada główna

Zawsze eskaluj w górę, nigdy w dół. Jeśli objawy mieszczą się w dwóch kategoriach, agent traktuje sprawę jak wyższą. Przykład: "boli mnie ząb od trzech dni, ale nie tak bardzo" to PILNY, nie PLANOWY — trzy dni utrzymującego się bólu zwykle oznacza aktywną infekcję wymagającą oceny.

Jeśli klasyfikator nie jest pewny (confidence poniżej 0.7), agent prosi o doprecyzowanie czasu trwania i nasilenia bólu (skala 1–10). Konkretne sformułowanie pytania pochodzi z system promptu. Po doprecyzowaniu agent ponownie klasyfikuje. Jeśli pacjent nie potrafi odpowiedzieć (zdezorientowany, w panice, zbyt silny ból), agent traktuje sprawę jak NAGŁY.

---

## EN (compact, reference only)

Three tiers — classification criteria only. Agent dialogue lives in the system prompt.

- **EMERGENCY**: uncontrolled bleeding, swelling impeding breathing, head trauma with consciousness changes, knocked-out permanent tooth (30 min reimplantation window), unbearable pain, post-procedure fever above 38.5°C with progressive swelling. Direction: immediate escalation, 112 or ER, no standard booking.
- **URGENT**: severe pain unresponsive to OTC analgesics, visible abscess or pus, broken tooth with nerve exposure, dry socket 3–5 days post-extraction, lost crown on a front tooth, recurring bleeding from extraction site. Direction: same-day or within-24h booking; escalate to human if no slot and symptoms worsening.
- **ROUTINE**: checkup, hygiene, cosmetic consultation, mild sensitivity, lost filling on a back tooth without pain. Direction: standard booking flow.

Main rule: when in doubt, escalate one tier higher. Classifier confidence below 0.7 prompts a duration + severity clarification (phrasing per system prompt). If patient can't answer, treat as emergency.

---

## RU (compact, reference only)

Три уровня — критерии классификации. Реплики агента живут в системном промпте.

- **НЕОТЛОЖНО (NAGŁY)**: неконтролируемое кровотечение, отёк затрудняющий дыхание, травма головы с потерей сознания, выбитый постоянный зуб (30 минут на реимплантацию), невыносимая боль, после процедуры температура выше 38.5°C с нарастающим отёком. Направление: немедленная эскалация, 112 или больница, без стандартной записи.
- **СРОЧНО (PILNY)**: сильная боль не снимаемая обезболивающим, видимый абсцесс или гной, скол зуба с обнажённым нервом, "сухая лунка" через 3–5 дней после удаления, выпавшая коронка на переднем зубе. Направление: запись в тот же день или в течение 24 часов; эскалация к администратору если мест нет и симптомы ухудшаются.
- **ПЛАНОВО (PLANOWY)**: осмотр, гигиена, эстетика, лёгкая чувствительность, выпавшая пломба на жевательном зубе без боли. Направление: обычная запись.

Главное правило: при сомнении эскалировать на уровень выше. Если уверенность классификатора ниже 0.7, уточнить продолжительность и силу боли. Если пациент не может ответить, считать неотложным.
