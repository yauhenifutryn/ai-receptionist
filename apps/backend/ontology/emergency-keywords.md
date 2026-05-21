# Emergency keywords: Layer 1 ontology (dental)

> Authored 2026-05-21. Polskie zwroty, które agent powinien rozpoznawać i eskalować w ciągu 1–2 tur. Lista nie jest wyczerpująca, ale pokrywa najczęstsze frazy używane przez pacjentów w kryzysie. Polski jest fleksyjny: agent rozpoznaje warianty odmiany ("boli", "boli mnie", "bolał", "bolała").

Klasyfikator korzysta z tej listy w trybie soft-match (similarity > 0.75 wystarcza). Sama obecność słowa kluczowego nie wystarcza do klasyfikacji NAGŁY; agent dopytuje, chyba że spełniony jest warunek końcowy ("Zasada eskalacji" na końcu pliku).

---

## Krwawienie

- "krwawi": implikuje PILNY lub NAGŁY w zależności od czasu trwania.
- "krwawi mocno", "krwawi obficie": NAGŁY.
- "leci krew", "leci mi krew z dziąsła": PILNY.
- "nie mogę zatamować", "nie da się zatamować": NAGŁY.
- "krwawi już godzinę", "krwawi od rana": NAGŁY.
- "krew nie przestaje": NAGŁY.
- "wykrwawiam się": NAGŁY.
- "po wyrwaniu zęba dalej krwawi": PILNY (zaburzenie krzepnięcia lub niedomknięta rana).

## Obrzęk i ból

- "spuchło" / "spuchłem" / "spuchła": PILNY, NAGŁY jeśli z trudnością oddychania.
- "puchnie", "puchnie coraz bardziej": PILNY, narastające NAGŁY.
- "twarz mi spuchła", "policzek spuchł": PILNY.
- "obrzęk pod brodą", "obrzęk pod żuchwą": NAGŁY (podejrzenie ropnia dna jamy ustnej).
- "ból nie do wytrzymania", "nie wytrzymuję bólu": PILNY, NAGŁY jeśli pacjent płacze lub krzyczy.
- "nie mogę spać z bólu", "nie spałem przez ból": PILNY.
- "boli od kilku dni", "boli już tydzień": PILNY.
- "boli i pulsuje", "pulsujący ból": PILNY (klasyczne dla zapalenia miazgi).
- "boli na zimno", "boli na ciepło": PLANOWY zwykle (nadwrażliwość lub wczesna próchnica).
- "leki nie pomagają", "ibuprofen nie działa", "wzięłam dwa paracetamole i nic": PILNY.

## Trauma

- "ząb wybity", "wybili mi zęba": NAGŁY jeśli stały, PILNY jeśli mleczny.
- "ząb pęknął", "pękł mi ząb", "złamał się ząb": PILNY.
- "uderzyłem się", "uderzyłam się w twarz", "spadłem", "wypadek": PILNY, NAGŁY jeśli z utratą przytomności.
- "ząb wisi", "ząb się chwieje po uderzeniu": PILNY.
- "kawałek zęba odpadł": PILNY.
- "ząb wyleciał razem z korzeniem": NAGŁY (czas krytyczny 30 min na reimplantację).
- "rozbity ząb", "ostre brzegi": PILNY.

## Oddychanie i połykanie

- "trudno mi oddychać", "ciężko oddycham": NAGŁY.
- "duszę się", "nie mogę złapać oddechu": NAGŁY.
- "nie mogę przełknąć", "trudno mi przełykać": NAGŁY (podejrzenie obrzęku dna jamy ustnej).
- "ślina mi cieknie, nie mogę zamknąć ust": NAGŁY.
- "drętwieje mi gardło", "drętwieje mi szyja": NAGŁY.

## Po zabiegu

- "po wczorajszym zabiegu", "po wczorajszym wyrwaniu", "po dzisiejszej plombie": kontekstowo PILNY, ocenić objawy.
- "spuchło po plombie", "spuchło po implancie": PILNY.
- "ma gorączkę po zabiegu", "gorączka po wyrwaniu zęba": PILNY, NAGŁY jeśli powyżej 38.5°C z obrzękiem.
- "ból narasta po zabiegu", "trzeciego dnia po wyrwaniu zaczęło boleć mocniej": PILNY (klasyczne objawy suchego zębodołu).
- "wypadł szew", "puściły szwy": PILNY.
- "wypadła plomba", "wypadła korona": PILNY na zębie przednim, PLANOWY na bocznym bez bólu.

## Dziecko

Dziecięce sytuacje agent traktuje z podwyższoną pilnością. Kategoria sama w sobie nie oznacza NAGŁY, ale modyfikuje wszystkie powyższe.

- "moje dziecko", "córka", "syn", "dziecko 3 lata", "dziecko 5 lat", "dziecko 8 lat": kontekstowo.
- "dziecko ma temperaturę i boli ząb": PILNY.
- "dziecko nie chce jeść, mówi że boli": PILNY.
- "dziecko spadło i uderzyło się w zęby": PILNY, NAGŁY jeśli wybity ząb stały (u dzieci od ok. 6 roku życia pierwsze stałe).
- "u dziecka leci krew z dziąseł": PILNY.
- "córce / synowi wybito ząb na placu zabaw": PILNY do oceny (mleczak), NAGŁY jeśli stały (dzieci 6+).

---

## Zasada eskalacji

Jeśli pacjent użyje któregokolwiek z powyższych zwrotów w połączeniu ze słowem `teraz`, `pomocy`, `od X godzin`, `od X dni`, traktuj jako NAGŁY. Przykład:

- "Krwawi mi dziąsło od dwóch godzin" → NAGŁY.
- "Spuchło teraz, nie mogę zamknąć ust" → NAGŁY.
- "Pomocy, ząb wisi po uderzeniu" → NAGŁY.

Jeśli pacjent mówi w panice, podniesionym głosem, krzyczy lub płacze, traktuj jako NAGŁY niezależnie od konkretnych słów. Agent w pierwszej kolejności uspokaja, podaje numer 112 lub instrukcję dojazdu do szpitala, dopiero potem (jeśli to bezpieczne) zbiera dodatkowe informacje.

Przy słowach kluczowych spoza listy, ale wskazujących na pilność (np. "boję się", "to nie wygląda dobrze", "coś jest nie tak"), agent dopytuje:

> "Proszę powiedzieć dokładniej, co się dzieje. Czy boli, krwawi, czy jest opuchlizna?"

---

## EN (compact list)

- Bleeding: "bleeding", "won't stop bleeding", "blood won't stop", "bleeding for an hour".
- Swelling and pain: "swollen", "swelling", "face is swelling", "unbearable pain", "can't sleep from pain", "pain medication isn't working", "ibuprofen isn't helping".
- Trauma: "knocked out", "broken tooth", "tooth fell out", "got hit", "fell down", "accident", "tooth is hanging".
- Breathing and swallowing: "can't breathe", "hard to breathe", "can't swallow", "drooling", "throat is closing".
- Post-procedure: "since yesterday's surgery", "swollen after filling", "fever after extraction", "pain getting worse after procedure", "stitches came out".
- Child markers: "my child", "my son", "my daughter", "5-year-old", combined with any above.

Escalation rule: any keyword combined with "now", "help", or a duration phrase ("for X hours / days") triggers EMERGENCY. Panic in caller voice triggers EMERGENCY regardless of words.

## RU (compact list)

- Кровотечение: "кровь идёт", "не могу остановить кровь", "кровь не останавливается", "кровь течёт час".
- Отёк и боль: "опухло", "опухает", "лицо опухло", "невыносимая боль", "не могу спать от боли", "обезболивающее не помогает", "ибупрофен не действует".
- Травма: "выбили зуб", "сломал зуб", "зуб выпал", "ударился", "упал", "авария", "зуб шатается".
- Дыхание и глотание: "не могу дышать", "тяжело дышать", "не могу глотать", "слюна течёт", "горло сжимается".
- После процедуры: "после вчерашней операции", "опухло после пломбы", "температура после удаления", "боль усиливается после процедуры", "швы разошлись".
- Маркеры детей: "мой ребёнок", "сын", "дочь", "ребёнку 5 лет" в сочетании с любым из выше.

Правило эскалации: любое ключевое слово вместе со словом "сейчас", "помогите", или указанием продолжительности ("уже X часов / дней") считается СРОЧНЫМ. Паника в голосе пациента: СРОЧНО независимо от слов.
