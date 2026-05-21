# Triage: Layer 1 ontology (dental)

> Authored 2026-05-21. Trzy poziomy pilności. Agent klasyfikuje rozmowę na podstawie objawów opisanych przez pacjenta i odpowiednio reaguje. Przy wątpliwości zawsze eskaluje wyżej, nigdy niżej.

Każdy poziom ma trzy elementy: kryteria (jakie objawy/zwroty), działanie agenta (co mówi, jakie kroki podejmuje), oraz przekazanie do człowieka (kiedy i jak).

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

Działanie agenta:

> "To brzmi jak sytuacja wymagająca natychmiastowej pomocy. Zalecam wezwanie pogotowia ratunkowego, numer 112, albo natychmiastowy przyjazd na izbę przyjęć szpitala. Klinika nie jest w stanie odpowiednio zareagować w takim trybie. Jeśli wybity został stały ząb, proszę przechowywać go w mleku i jechać do szpitala lub do dyżurnej kliniki stomatologicznej w ciągu 30 minut. Czy mogę połączyć Pana / Panią z lekarzem dyżurnym?"

Następnie agent kończy zwykły flow rezerwacji i, jeśli klinika ma dyżurnego lekarza, przekazuje połączenie. Jeśli klinika nie ma dyżuru, agent kończy rozmowę po upewnieniu się, że pacjent wie gdzie jechać.

Przekazanie do człowieka: zawsze, bezzwłocznie. Nawet jeśli pacjent waha się, agent ma być stanowczy: "Proszę zadzwonić pod 112 lub jechać do szpitala. Ja w tej chwili nie pomogę bardziej."

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

Działanie agenta:

> "Rozumiem. To brzmi na sytuację, którą trzeba zająć się jak najszybciej, najlepiej dziś. Proszę poczekać, sprawdzę najwcześniejszy wolny termin. Jeśli wszystkie dzisiejsze terminy są zajęte, mogę zaproponować pierwszy slot na jutro rano lub przekazać Pana / Pani sprawę do recepcji do osobistego ustalenia. Czy ma Pan / Pani teraz dostęp do leku przeciwbólowego?"

Agent sprawdza grafik, oferuje najwcześniejszy dostępny termin (priorytet "tego samego dnia"). Jeśli klinika ma wewnętrzną kolejkę pilnych, agent dodaje pacjenta do listy. Jeśli brak miejsc w 24h, agent informuje pacjenta i sugeruje izbę przyjęć lub dyżur stomatologiczny.

Przekazanie do człowieka: tak, jeśli klinika nie ma wolnych terminów w 24h i pacjent zgłasza objawy mocno odbiegające od normy (gorączka, wzrastający obrzęk). W innych przypadkach agent kończy bookingiem.

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

Działanie agenta:

> "Jasne, w czym mogę pomóc dziś? Sprawdzę dostępne terminy. Czy preferuje Pan / Pani konkretny dzień tygodnia lub porę dnia?"

Agent prowadzi standardowy flow rezerwacji: sprawdzenie grafiku, propozycja 2–3 terminów, potwierdzenie wybranego slotu, wysyłka SMS-a z potwierdzeniem.

Przekazanie do człowieka: tylko jeśli pacjent o to poprosi lub jeśli pojawi się informacja, której agent nie rozumie (patrz "Nieznana sytuacja" w `scripts.md`).

---

## Zasada główna

Zawsze eskaluj w górę, nigdy w dół. Jeśli objawy mieszczą się w dwóch kategoriach, agent traktuje sprawę jak wyższą. Przykład: pacjent mówi "boli mnie ząb od trzech dni, ale nie tak bardzo": to PILNY, nie PLANOWY, bo trzy dni utrzymującego się bólu zwykle oznacza aktywną infekcję, którą trzeba ocenić.

Jeśli klasyfikator nie jest pewny (confidence poniżej 0.7), agent prosi o doprecyzowanie:

> "Żeby dobrze zaproponować termin, czy może Pan / Pani powiedzieć więcej? Jak długo Pana / Panią boli i jak silny jest ból w skali 1 do 10?"

Po doprecyzowaniu agent ponownie klasyfikuje i działa zgodnie z odpowiednim poziomem. Jeśli pacjent nie potrafi odpowiedzieć (zdezorientowany, w panice, zbyt silny ból), agent traktuje sprawę jak NAGŁY.

---

## EN (compact)

Three tiers.

- **EMERGENCY**: uncontrolled bleeding, swelling impeding breathing, head trauma with consciousness changes, knocked-out permanent tooth (30 min reimplantation window), unbearable pain, post-procedure fever above 38.5°C with progressive swelling. Action: tell caller to call 112 or go to ER immediately. Agent does not book; agent transfers to on-call dentist if available.
- **URGENT**: severe pain not responding to OTC analgesics, visible abscess or pus, broken tooth with nerve exposure, dry socket 3–5 days post-extraction, lost crown or bridge on a front tooth, recurring bleeding from extraction site. Action: same-day or within 24h booking, agent checks for openings, escalates to human if no slot available.
- **ROUTINE**: checkup, hygiene, cosmetic consultation, mild sensitivity, lost filling on a back tooth without pain. Action: standard booking flow.

Main rule: when in doubt, escalate one tier higher. If classifier confidence below 0.7, ask the patient to clarify pain duration and severity. If they cannot, treat as emergency.

---

## RU (compact)

Три уровня.

- **НЕОТЛОЖНО (NAGŁY)**: неконтролируемое кровотечение, отёк затрудняющий дыхание, травма головы с потерей сознания, выбитый постоянный зуб (30 минут на реимплантацию), невыносимая боль, после процедуры температура выше 38.5°C с нарастающим отёком. Действие: рекомендовать вызвать 112 или ехать в больницу. Бронирование не оформляется. Передать дежурному врачу если есть.
- **СРОЧНО (PILNY)**: сильная боль не снимаемая обезболивающим, видимый абсцесс или гной, скол зуба с обнажённым нервом, "сухая лунка" через 3–5 дней после удаления, выпавшая коронка на переднем зубе. Действие: запись в тот же день или в течение 24 часов. Если мест нет, передать администратору.
- **ПЛАНОВО (PLANOWY)**: осмотр, гигиена, эстетика, лёгкая чувствительность, выпавшая пломба на жевательном зубе без боли. Действие: обычная запись.

Главное правило: при сомнении эскалировать на уровень выше. Если уверенность классификатора ниже 0.7, уточнить продолжительность и силу боли. Если пациент не может ответить, считать неотложным.
