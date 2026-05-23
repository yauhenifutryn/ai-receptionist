# Services: Layer 1 ontology (dental, PL primary)

> Authored 2026-05-21. Vertical: dental, universal across Polish dental clinics. Indexed by H2 section. Polish synonyms front-loaded. **Prices are intentionally NOT in this file.** Layer 1 is the universal dental vertical layer; per-clinic prices, hours, doctor names, and clinic-specific NFZ contract details live in Layer 2 (`data/clinics/<tenant_id>/knowledge.md`). The agent retrieves both layers at query time and presents the per-clinic price; the universal layer here describes only what each service IS, its typical duration, whether it falls under NFZ at the national level, and patient phrasing.

Każda sekcja H2 to jedna usługa. Słowa kluczowe i synonimy są na początku, żeby retriever trafiał w nie nawet przy potocznej polszczyźnie pacjenta. Cena pochodzi wyłącznie z danych konkretnej kliniki (Layer 2), nigdy z tej ontologii.

---

## Konsultacja stomatologiczna

**Synonimy**: konsultacja, wizyta konsultacyjna, pierwsza wizyta, wizyta diagnostyczna, omówienie planu leczenia, rozmowa z lekarzem.

Typ: profilaktyka
Czas trwania (typowy): 20–30 min
Konsultacja wymagana przed: nie (sama jest konsultacją)
NFZ: nie (poza ostrymi przypadkami)

Pytania od pacjenta (przykład):

- "Chciałbym się umówić na pierwszą wizytę, jeszcze nie byłem w tej klinice."
- "Potrzebuję porozmawiać z lekarzem o planie leczenia, nie wiem od czego zacząć."

Krótki opis:
Konsultacja to pierwsze spotkanie z lekarzem, podczas którego pacjent jest badany wstępnie, omawiane są dolegliwości i ustalany ogólny plan leczenia. Zwykle nie obejmuje zabiegów, ale lekarz może zlecić zdjęcie panoramiczne lub punktowe. Konsultacja jest często warunkiem przed leczeniem implantologicznym, ortodontycznym lub protetycznym.

### EN

**Synonyms**: consultation, first visit, treatment planning visit.
Brief: Initial visit with the dentist to discuss complaints and set a treatment plan. No procedures performed. Often required before implant, ortho, or prosthetic work.

### RU

**Синонимы**: консультация, первый визит, планирование лечения.
Кратко: Первая встреча со стоматологом, обсуждение жалоб и плана лечения. Без процедур. Часто обязательна перед имплантацией, ортодонтией или протезированием.

---

## Przegląd / kontrola

**Synonimy**: przegląd, kontrola, kontrolna wizyta, sprawdzenie zębów, wizyta kontrolna co pół roku.

Typ: profilaktyka
Czas trwania (typowy): 15–20 min
Konsultacja wymagana przed: nie
NFZ: tak (raz w roku dla dorosłych w ramach NFZ)

Pytania od pacjenta (przykład):

- "Chciałabym się umówić na kontrolę, nic mnie nie boli, ale dawno nie byłam."
- "Mam przegląd co pół roku, czy macie jakiś termin w przyszłym tygodniu?"

Krótki opis:
Rutynowa wizyta kontrolna, zalecana co sześć miesięcy. Lekarz ocenia stan uzębienia, dziąseł, sprawdza wcześniejsze wypełnienia i ewentualnie zleca higienizację albo dodatkowe leczenie. W ramach NFZ przysługuje jeden przegląd rocznie dla dorosłych, dla dzieci częściej.

### EN

**Synonyms**: checkup, routine exam, dental review.
Brief: Routine six-month checkup. Dentist evaluates teeth, gums, existing fillings. Free under NFZ once a year for adults.

### RU

**Синонимы**: осмотр, контрольный визит, профилактический осмотр.
Кратко: Плановый осмотр раз в полгода. Бесплатно по NFZ раз в год для взрослых.

---

## Higienizacja

**Synonimy**: higienizacja, higiena, czyszczenie zębów, scaling, skaling, piaskowanie, polerowanie, usunięcie kamienia, oczyszczenie zębów.

Typ: profilaktyka
Czas trwania (typowy): 45–60 min
Konsultacja wymagana przed: nie
NFZ: nie (poza usunięciem kamienia raz w roku w ograniczonym zakresie)

Pytania od pacjenta (przykład):

- "Chciałabym umówić się na higienę, ostatnia była rok temu."
- "Robicie piaskowanie? Ile to kosztuje razem ze skalingiem?"

Krótki opis:
Pełna higienizacja obejmuje trzy etapy: skaling ultradźwiękowy (usunięcie kamienia nazębnego), piaskowanie (usunięcie osadu i przebarwień piaskiem stomatologicznym) oraz polerowanie pastą profilaktyczną. Często na końcu lakierowanie fluorem. Zalecana co sześć miesięcy. Bezbolesna, ale przy nadwrażliwości dziąseł warto uprzedzić higienistkę.

### EN

**Synonyms**: hygiene appointment, scaling, sandblasting, polishing, professional cleaning.
Brief: Full hygiene visit covers scaling, sandblasting and polishing. Recommended every six months. Painless but warn the hygienist about gum sensitivity.

### RU

**Синонимы**: гигиена, чистка зубов, скейлинг, пескоструйная чистка, удаление налёта.
Кратко: Профессиональная гигиена: ультразвуковая чистка, пескоструй, полировка. Раз в полгода.

---

## Periodontologia / leczenie dziąseł

**Synonimy**: periodontologia, parodontologia, leczenie dziąseł, paradontoza, parodontoza, kiretaż, scaling i root planing, choroba przyzębia, krwawienie dziąseł, zapalenie przyzębia, kieszonki dziąsłowe.

Typ: profilaktyka / leczenie
Czas trwania (typowy): konsultacja 30 min; kiretaż zamknięty 60–90 min na jedną ćwiartkę szczęki; pełne leczenie często 4 wizyty (jedna na ćwiartkę).
Konsultacja wymagana przed: zwykle tak (ocena głębokości kieszonek + RTG)
NFZ: częściowo (podstawowy zakres dla dorosłych: usunięcie kamienia poddziąsłowego; szerszy zakres dla dzieci)

Pytania od pacjenta (przykład):

- "Krwawią mi dziąsła kiedy myję zęby, czy to coś poważnego?"
- "Mam paradontozę, słyszałem o czymś takim jak kiretaż, czy to robicie?"

Krótki opis:
Leczenie chorób przyzębia: zapalenia dziąseł i parodontozy. Diagnostyka zaczyna się od pomiaru głębokości kieszonek dziąsłowych periodontometrem i zdjęcia RTG. Leczenie podstawowe to scaling and root planing (SRP), znany też jako kiretaż zamknięty: oczyszczenie powierzchni korzeni z kamienia poddziąsłowego i toksyn pod znieczuleniem miejscowym. W zaawansowanych przypadkach: kiretaż otwarty (chirurgiczny), zabiegi regeneracyjne. Pełne leczenie wymaga zwykle 4 wizyt (jedna ćwiartka szczęki na wizytę), plus wizyty kontrolne co 3 miesiące. Aktywna profilaktyka domowa (irygator, szczoteczki międzyzębowe) jest absolutnie kluczowa dla rezultatu.

### EN

**Synonyms**: periodontology, gum disease treatment, periodontitis, scaling and root planing, SRP, deep cleaning, curettage.
Brief: Treatment of gum disease. Starts with pocket-depth measurement and X-ray. Core procedure is scaling and root planing (deep cleaning under local anaesthetic). Often four visits, one per quadrant. Maintenance recalls every 3 months.

### RU

**Синонимы**: пародонтология, лечение дёсен, пародонтит, кюретаж, скейлинг и сглаживание корней, глубокая чистка.
Кратко: Лечение болезней дёсен. Диагностика: измерение глубины карманов и рентген. Основная процедура: кюретаж (глубокая чистка под анестезией). Обычно 4 визита, по одному на квадрант. Поддерживающие визиты раз в 3 месяца.

---

## Wybielanie zębów

**Synonimy**: wybielanie, wybielanie zębów, wybielanie gabinetowe, wybielanie nakładkowe, wybielanie lampą, wybielanie domowe.

Typ: estetyka
Czas trwania (typowy): 60–90 min (gabinetowe), 2–3 tygodnie (nakładkowe domowe)
Konsultacja wymagana przed: tak (ocena szkliwa i higieny)
NFZ: nie

Pytania od pacjenta (przykład):

- "Ile kosztuje wybielanie lampą? Chciałabym to zrobić przed ślubem."
- "Wolałbym wybielanie domowe, w nakładkach. Da się?"

Krótki opis:
Dwie podstawowe metody. Gabinetowe: aplikacja żelu wybielającego aktywowanego lampą, jedna lub dwie sesje, efekt natychmiastowy. Nakładkowe: indywidualne nakładki plus żel do stosowania w domu przez 2–3 tygodnie, efekt łagodniejszy ale trwalszy. Przed wybielaniem zalecana higienizacja, zęby muszą być zdrowe (bez próchnicy ani aktywnych zmian). Po zabiegu 48 godzin diety białej (bez kawy, herbaty, wina, papierosów).

### EN

**Synonyms**: whitening, bleaching, in-office whitening, take-home whitening.
Brief: Two options. In-office: gel + lamp, one or two sessions, instant result. Take-home: custom trays + gel for 2–3 weeks. Hygiene visit required first. 48h white diet after the procedure.

### RU

**Синонимы**: отбеливание, отбеливание зубов, кабинетное отбеливание, домашнее отбеливание в каппах.
Кратко: Кабинетное (гель + лампа) или домашнее в индивидуальных каппах. Перед процедурой нужна гигиена. 48 часов "белой диеты" после.

---

## Lakowanie

**Synonimy**: lakowanie, lakowanie zębów, lakowanie bruzd, uszczelnianie bruzd, lakowanie szóstek u dziecka.

Typ: profilaktyka
Czas trwania (typowy): 15–20 min na ząb
Konsultacja wymagana przed: nie
NFZ: tak (dla dzieci do 8 roku życia, zęby szóste)

Pytania od pacjenta (przykład):

- "Córka ma siedem lat, dentysta polecił lakowanie szóstek. Robicie to?"
- "Czy lakowanie jest refundowane przez NFZ?"

Krótki opis:
Zabieg profilaktyczny polegający na pokryciu bruzd zębów trzonowych specjalnym lakiem, który zapobiega gromadzeniu się płytki nazębnej i próchnicy. Wykonywany głównie u dzieci po wyrośnięciu pierwszych stałych trzonowców (zęby szóste, około 6–7 roku życia). NFZ pokrywa lakowanie szóstek u dzieci do 8 roku życia.

### EN

**Synonyms**: sealants, fissure sealants, pit and fissure sealing.
Brief: Preventive coating of molar grooves. Mostly pediatric, after first permanent molars erupt around age 6–7. Free under NFZ for children up to age 8 (first molars only).

### RU

**Синонимы**: герметизация фиссур, лакирование зубов, запечатывание фиссур.
Кратко: Профилактическое покрытие фиссур моляров. В основном детям с 6–7 лет. Бесплатно по NFZ до 8 лет на первые моляры.

---

## Fluoryzacja

**Synonimy**: fluoryzacja, lakier fluorkowy, lakierowanie fluorem, aplikacja fluoru, profilaktyka fluorkowa.

Typ: profilaktyka
Czas trwania (typowy): 10–15 min
Konsultacja wymagana przed: nie
NFZ: tak (dla dzieci do 18 roku życia, raz na pół roku)

Pytania od pacjenta (przykład):

- "Dziecko ma osiem lat, dentysta mówił o fluoryzacji raz na pół roku."
- "Po higienizacji robicie fluoryzację w cenie czy osobno?"

Krótki opis:
Powierzchowna aplikacja preparatu z fluorem (zwykle lakier lub pianka) na zęby. Wzmacnia szkliwo, zmniejsza ryzyko próchnicy. Często wykonywana po higienizacji jako dopełnienie zabiegu, albo osobno u dzieci. Po zabiegu nie jeść i nie pić przez 30 minut.

### EN

**Synonyms**: fluoride application, fluoride varnish, fluoride treatment.
Brief: Topical fluoride applied to teeth to strengthen enamel and reduce decay risk. Often done after hygiene. Free under NFZ for children twice a year.

### RU

**Синонимы**: фторирование, аппликация фтора, фторлак.
Кратко: Нанесение фторсодержащего препарата для укрепления эмали. Часто после гигиены. Детям бесплатно по NFZ дважды в год.

---

## Plomba / wypełnienie

**Synonimy**: plomba, wypełnienie, założenie plomby, leczenie próchnicy, kompozyt, światłoutwardzalna, jedno-, dwu-, trójpowierzchniowe wypełnienie.

Typ: leczenie
Czas trwania (typowy): 30–45 min na ząb
Konsultacja wymagana przed: nie (pacjent zwykle przychodzi z bólem lub po przeglądzie)
NFZ: tak (zakres ograniczony, materiały NFZ tylko na zęby przednie i niektóre typy ubytków u dorosłych; pełny zakres dla dzieci)

Pytania od pacjenta (przykład):

- "Wypadła mi plomba, da się jutro?"
- "Mam ubytek na dwójce, ile kosztuje plomba kompozytowa?"

Krótki opis:
Wypełnienie ubytku po usunięciu próchnicy. Standard prywatny to kompozyt światłoutwardzalny, dopasowany kolorystycznie do zęba, mediana trwałości około 5–8 lat przy dobrej higienie. NFZ oferuje wypełnienia materiałami ograniczonymi (najczęściej cement glasjonomerowy) i tylko na wybrane zęby u dorosłych.

### EN

**Synonyms**: filling, composite filling, light-cure filling, cavity treatment.
Brief: Light-cure composite filling after caries removal. Lasts 7–10 years with good hygiene. NFZ covers limited materials for adults and full scope for children.

### RU

**Синонимы**: пломба, световая пломба, композитная пломба, лечение кариеса.
Кратко: Световая композитная пломба после удаления кариеса. Срок службы 7–10 лет. NFZ покрывает ограниченно для взрослых, полностью для детей.

---

## Leczenie kanałowe / endodoncja

**Synonimy**: leczenie kanałowe, kanałówka, endodoncja, kanał, leczenie endodontyczne, mikroskop, leczenie pod mikroskopem.

Typ: leczenie
Czas trwania (typowy): 60–120 min na wizytę, często 1–2 wizyty
Konsultacja wymagana przed: zwykle nie, ale wymagane zdjęcie RTG punktowe przed leczeniem
NFZ: częściowo (zęby przednie jedno- i dwukanałowe dla dorosłych; trzonowce zwykle poza zakresem, choć w trybie pilnym NFZ może objąć szerszy zakres; pełny zakres dla dzieci do 18 r.ż.)

Pytania od pacjenta (przykład):

- "Mam silny ból szóstki na górze, lekarz mówił o kanałowym."
- "Ile kosztuje kanałówka pod mikroskopem na trójkanałowym zębie?"

Krótki opis:
Leczenie miazgi zęba (zapalenia lub martwicy). Polega na usunięciu chorej miazgi, opracowaniu i wypełnieniu kanałów korzeniowych. Cena zależy od liczby kanałów: zęby przednie (1 kanał), przedtrzonowce (1–2 kanały), trzonowce (3–4 kanały). Standard prywatny to leczenie pod mikroskopem stomatologicznym. Po leczeniu kanałowym zwykle wymagana jest odbudowa zęba (wkład koronowo-korzeniowy) lub korona, do umówienia osobno.

### EN

**Synonyms**: root canal, endodontic treatment, RCT, microscope-assisted endodontics.
Brief: Treatment of infected or necrotic pulp. Price depends on canal count (1 to 4). Private standard uses a dental microscope. Crown or post-and-core reconstruction usually needed after.

### RU

**Синонимы**: лечение каналов, эндодонтия, корневое лечение, лечение под микроскопом.
Кратко: Лечение пульпы зуба. Цена зависит от количества каналов (от 1 до 4). Платный стандарт включает микроскоп. После обычно нужна коронка или культевая вкладка.

---

## Powtórne leczenie kanałowe / re-endodoncja

**Synonimy**: powtórne leczenie kanałowe, re-endodoncja, ponowne leczenie kanałowe, korekta leczenia kanałowego, re-treatment, ratunkowe leczenie kanałowe, kanał ponownie boli, ząb po kanale boli.

Typ: leczenie (endodoncja)
Czas trwania (typowy): 90–150 min na wizytę, często 2 wizyty
Konsultacja wymagana przed: tak, ze zdjęciem RTG punktowym i często tomografią CBCT
NFZ: zwykle nie (poza wybranymi przypadkami trybu pilnego)

Pytania od pacjenta (przykład):

- "Mam przeleczony ząb sprzed kilku lat i znów zaczął boleć, co teraz?"
- "Czy można powtórzyć leczenie kanałowe czy trzeba wyrwać zęba?"

Krótki opis:
Re-endodoncja to ponowne leczenie zęba, który był już wcześniej leczony kanałowo, ale wystąpiło ponowne zakażenie lub odczuwany jest ból. Zabieg polega na demontażu starego wypełnienia kanałowego (gutaperki), oczyszczeniu kanałów ponownie, dezynfekcji i wypełnieniu od nowa. Często wymaga mikroskopu zabiegowego ze względu na trudność dostępu i potencjalne komplikacje (złamane narzędzie endodontyczne, perforacja, niedostatecznie wypełnione kanały). Skuteczność niższa niż pierwotnego leczenia (typowo 60–80%), w razie niepowodzenia opcją jest resekcja wierzchołka korzenia lub ekstrakcja. Wymagana decyzja po dokładnej diagnostyce, najczęściej z CBCT.

### EN

**Synonyms**: root canal retreatment, re-endodontics, repeat root canal, endodontic retreatment.
Brief: Repeat root canal treatment for a previously treated tooth that has reinfected or become symptomatic. Existing gutta-percha is removed, canals re-cleaned, re-sealed. Usually requires microscope and CBCT. Success rate 60–80%; apicoectomy or extraction are fallbacks.

### RU

**Синонимы**: повторное лечение каналов, повторная эндодонтия, перелечивание каналов.
Кратко: Повторное лечение зуба, который ранее лечился по каналам, но вновь инфицировался или болит. Удаление старой пломбировки, повторная очистка и пломбирование. Часто нужны микроскоп и КТ. Успех 60–80%; альтернатива: резекция верхушки корня или удаление.

---

## Odbudowa zęba

**Synonimy**: odbudowa, odbudowa zęba, odbudowa po kanałowym, wkład koronowo-korzeniowy, odbudowa kompozytowa, rekonstrukcja zęba.

Typ: leczenie / protetyka
Czas trwania (typowy): 45–60 min
Konsultacja wymagana przed: zalecana, zwłaszcza po leczeniu kanałowym
NFZ: nie (poza prostymi odbudowami w zakresie wypełnień NFZ)

Pytania od pacjenta (przykład):

- "Mam ząb po kanałowym, lekarz mówił o odbudowie, ile to potrwa?"
- "Czy do odbudowy potrzebny jest wkład, czy wystarczy kompozyt?"

Krótki opis:
Odtworzenie struktury zęba po leczeniu kanałowym lub po znacznym ubytku. Przy małych ubytkach wystarczy odbudowa kompozytowa. Przy większych ubytkach (utrata więcej niż 50% korony) zwykle stosowany jest wkład koronowo-korzeniowy z włókna szklanego lub metalu, na którym buduje się odbudowę, a finalnie często osadzana jest korona. Decyzja zależy od ilości pozostałej tkanki zęba.

### EN

**Synonyms**: tooth reconstruction, post-and-core, composite buildup.
Brief: Restoration after root canal or major decay. Small loss: composite buildup. Large loss (>50% crown): fiber post-and-core plus composite or crown.

### RU

**Синонимы**: реставрация зуба, восстановление зуба, культевая вкладка.
Кратко: Восстановление после эндодонтии или большой потери ткани. Малая потеря: композитная реставрация. Большая: культевая вкладка плюс реставрация или коронка.

---

## Ekstrakcja

**Synonimy**: ekstrakcja, usunięcie zęba, wyrwanie zęba, wyciągnięcie zęba, ekstrakcja prosta, ekstrakcja chirurgiczna.

Typ: chirurgia
Czas trwania (typowy): 20–45 min (prosta), 45–90 min (chirurgiczna)
Konsultacja wymagana przed: zwykle nie przy prostej, tak przy chirurgicznej (wymagane zdjęcie RTG)
NFZ: tak (w trybie pilnym, zęby kwalifikujące się do usunięcia)

Pytania od pacjenta (przykład):

- "Trzeba mi wyrwać ząb, lekarz mówił że nie da się uratować. Da się szybko?"
- "Ile kosztuje usunięcie zęba? Boli mnie bardzo i nie mogę spać."

Krótki opis:
Usunięcie zęba w znieczuleniu miejscowym. Ekstrakcja prosta dotyczy zębów w pełni wyrośniętych, dostępnych, bez powikłań. Ekstrakcja chirurgiczna dotyczy zębów złamanych przy dziąśle, korzeni zalegających, zębów zatrzymanych, lub przypadków wymagających nacięcia dziąsła. Po zabiegu pacjent dostaje pisemne zalecenia: nie płukać 24h, dieta miękka, lód na policzek przeciw obrzękowi.

### EN

**Synonyms**: extraction, tooth removal, surgical extraction.
Brief: Tooth removal under local anaesthesia. Simple extraction: fully erupted, accessible teeth. Surgical: broken at gum line, retained roots, impacted. Written aftercare given.

### RU

**Синонимы**: удаление зуба, экстракция, хирургическое удаление.
Кратко: Удаление зуба под местной анестезией. Простое или хирургическое (с разрезом десны). Письменные рекомендации после процедуры.

---

## Usunięcie ósemki / zęba mądrości

**Synonimy**: ósemka, ząb mądrości, usunięcie ósemki, usunięcie zęba mądrości, ząb zatrzymany, ósemka zatrzymana, dłutowanie ósemki.

Typ: chirurgia
Czas trwania (typowy): 45–90 min, czasem do 2 godzin (zatrzymana, w poziomie)
Konsultacja wymagana przed: tak, ze zdjęciem panoramicznym lub CBCT
NFZ: częściowo (w trybie pilnym, ograniczony zakres)

Pytania od pacjenta (przykład):

- "Muszę usunąć dolną ósemkę, jest w poziomie. Kto u Was to robi?"
- "Ile kosztuje usunięcie zęba mądrości razem ze zdjęciem panoramicznym?"

Krótki opis:
Osobna kategoria ze względu na trudność. Ósemki często rosną nieprawidłowo: w poziomie, ukośnie, lub są zatrzymane w kości (nie wyrżnięte). Przed zabiegiem wymagane zdjęcie panoramiczne, czasem CBCT 3D. Zabieg w znieczuleniu miejscowym, czasem z sedacją. Po zabiegu 7–10 dni gojenia, opuchlizna i ograniczone otwieranie ust przez kilka dni są normalne. Zwykle zalecany antybiotyk i lek przeciwbólowy.

### EN

**Synonyms**: wisdom tooth removal, third molar extraction, impacted wisdom tooth.
Brief: Wisdom teeth often grow sideways or stay impacted. Panoramic X-ray required, sometimes CBCT. Procedure under local anaesthesia, sometimes sedation. Swelling and limited jaw opening normal for several days.

### RU

**Синонимы**: удаление зуба мудрости, восьмёрка, ретинированный зуб, удаление ретинированной восьмёрки.
Кратко: Зубы мудрости часто растут неправильно или ретинированы. Перед удалением нужен панорамный снимок, иногда КТ. Местная анестезия, иногда седация. Отёк несколько дней: норма.

---

## Implant zębowy

**Synonimy**: implant, implant zębowy, wszczep, wszczepienie implantu, implant tytanowy, korona na implancie, odbudowa na implancie.

Typ: chirurgia / protetyka
Czas trwania (typowy): zabieg wszczepienia 60–90 min, pełna procedura 3–6 miesięcy
Konsultacja wymagana przed: tak, obowiązkowo, ze zdjęciem CBCT i planem leczenia
NFZ: nie

Pytania od pacjenta (przykład):

- "Brakuje mi jednego zęba na dole, ile kosztuje implant z koroną?"
- "Mam dwa implanty zaplanowane, jak długo to trwa od początku do końca?"

Krótki opis:
Dwuetapowa procedura: wszczepienie tytanowego implantu w kość szczęki, okres osteointegracji 3–6 miesięcy, następnie osadzenie korony protetycznej na implancie. Przed zabiegiem obowiązkowa konsultacja implantologiczna i CBCT (tomografia 3D) do oceny ilości kości. Czasem wymagana augmentacja kości lub podniesienie zatoki szczękowej, co zwiększa koszt i czas. Cena całkowita obejmuje konsultację, CBCT, wszczep, łącznik (abutment) i koronę.

### EN

**Synonyms**: dental implant, titanium implant, implant with crown.
Brief: Two-stage procedure: titanium implant placed in bone, 3–6 month integration, then crown. CBCT and consultation mandatory beforehand. Bone augmentation may be needed.

### RU

**Синонимы**: имплант, зубной имплант, титановый имплант, имплант с коронкой.
Кратко: Двухэтапная процедура: установка титанового импланта, 3–6 месяцев приживления, затем коронка. Обязательны консультация и КТ. Иногда нужна костная пластика.

---

## Korona

**Synonimy**: korona, korona porcelanowa, korona cyrkonowa, korona metaloceramiczna, korona pełnoceramiczna, koronka, czapeczka na ząb.

Typ: protetyka
Czas trwania (typowy): 2 wizyty, 2–3 tygodnie odstępu
Konsultacja wymagana przed: tak
NFZ: nie

Pytania od pacjenta (przykład):

- "Po kanałowym lekarz polecił koronę, jakie macie rodzaje?"
- "Ile kosztuje korona cyrkonowa? Słyszałam że są ładniejsze niż metalowe."

Krótki opis:
Trwała odbudowa zęba pokrywająca całą koronę kliniczną. Stosowana po leczeniu kanałowym, przy znacznych ubytkach, lub estetycznie. Materiały: metaloceramika (tańsza, trwała, mniej estetyczna na przednich zębach), pełna ceramika (Emax, estetyczna, zalecana na przednie), cyrkon (trwała i estetyczna, zalecana na trzonowce i tylne zęby). Procedura: szlifowanie zęba, wycisk lub skan 3D, korona tymczasowa, następnie osadzenie korony stałej na drugiej wizycie.

### EN

**Synonyms**: crown, porcelain crown, zirconia crown, ceramic crown, metal-ceramic crown.
Brief: Permanent restoration covering the whole clinical crown. Used after root canal or for major reconstruction. Two visits, 2–3 weeks apart. Materials: metal-ceramic, full ceramic (Emax), zirconia.

### RU

**Синонимы**: коронка, керамическая коронка, циркониевая коронка, металлокерамика.
Кратко: Постоянная конструкция, покрывающая зуб. Два визита с интервалом 2–3 недели. Материалы: металлокерамика, цельная керамика (Emax), цирконий.

---

## Most protetyczny

**Synonimy**: most, most protetyczny, mostek, uzupełnienie protetyczne mostem, most na zębach własnych, most na implantach.

Typ: protetyka
Czas trwania (typowy): 2–3 wizyty, 3–4 tygodnie
Konsultacja wymagana przed: tak
NFZ: nie

Pytania od pacjenta (przykład):

- "Brakuje mi jednego zęba, lekarz mówił że most byłby najprostszy."
- "Ile kosztuje most trzypunktowy, cyrkonowy?"

Krótki opis:
Stała konstrukcja uzupełniająca brak jednego lub dwóch zębów, oparta na sąsiednich zębach własnych (zęby filarowe) lub na implantach. Klasyczny most trzypunktowy: dwie korony na zębach filarowych plus zawieszony człon brakującego zęba w środku. Wymaga oszlifowania zębów sąsiednich, co jest wadą w porównaniu do implantu (który nie ingeruje w sąsiednie zęby). Materiały jak przy koronach: metaloceramika, pełna ceramika, cyrkon.

### EN

**Synonyms**: bridge, dental bridge, three-unit bridge, fixed prosthesis.
Brief: Fixed prosthesis replacing one or two missing teeth, anchored on neighbouring teeth or implants. Requires grinding the abutment teeth.

### RU

**Синонимы**: мостовидный протез, мост, зубной мост, мост на имплантах.
Кратко: Несъёмный протез на 1–2 отсутствующих зуба, опирается на соседние зубы или импланты. Требует обточки опорных зубов.

---

## Proteza

**Synonimy**: proteza, proteza zębowa, proteza częściowa, proteza całkowita, proteza akrylowa, proteza szkieletowa, sztuczna szczęka.

Typ: protetyka
Czas trwania (typowy): 3–5 wizyt, 4–6 tygodni
Konsultacja wymagana przed: tak
NFZ: tak (raz na 5 lat dla dorosłych, w ograniczonym zakresie)

Pytania od pacjenta (przykład):

- "Brakuje mi większości zębów na górze, potrzebuję protezy. NFZ?"
- "Ile kosztuje proteza szkieletowa, dolna?"

Krótki opis:
Ruchoma konstrukcja uzupełniająca brakujące zęby. Częściowa: gdy zachowane są niektóre własne zęby (proteza zaczepiana na nich klamrami lub zatrzaskami). Całkowita: brak wszystkich zębów w łuku, proteza opiera się na dziąsłach. Materiały: akryl (tańsze, klasyczne), szkielet metalowy (trwalsze, lżejsze, lepiej trzymają się w jamie ustnej). NFZ pokrywa proteze akrylową raz na 5 lat. Wizyty: wycisk pierwotny, wycisk wtórny, próba zwarcia, próba zębów, oddanie protezy plus wizyty kontrolne.

### EN

**Synonyms**: denture, partial denture, full denture, acrylic denture, skeletal denture.
Brief: Removable prosthesis replacing missing teeth. Partial (with some natural teeth left) or full. NFZ covers acrylic denture once every 5 years.

### RU

**Синонимы**: протез, зубной протез, частичный протез, полный протез, бюгельный протез, акриловый протез.
Кратко: Съёмный протез на отсутствующие зубы. Частичный или полный. NFZ покрывает акриловый раз в 5 лет.

---

## Licówki

**Synonimy**: licówki, licówki porcelanowe, licówki kompozytowe, licówki Emax, fasety, nakładki estetyczne na przednie zęby.

Typ: estetyka / protetyka
Czas trwania (typowy): 2 wizyty (porcelanowe), 1 wizyta (kompozytowe)
Konsultacja wymagana przed: tak, najczęściej z mock-upem (próbnym ustawieniem)
NFZ: nie

Pytania od pacjenta (przykład):

- "Chciałabym poprawić uśmiech, myślę o licówkach na górne szóstki. Co polecacie?"
- "Ile kosztują licówki porcelanowe na cztery zęby?"

Krótki opis:
Cienkie nakładki na przednią powierzchnię zębów, poprawiające kształt i kolor. Trzy główne typy. Kompozytowe: nakładane bezpośrednio w gabinecie, jedna wizyta, tańsze, trwałość 5–7 lat. Porcelanowe (Emax): wykonywane w laboratorium, dwie wizyty, estetycznie lepsze, trwałość 10–15 lat. Konsultacja z mock-upem (próbnym ustawieniem licówek z materiału tymczasowego) pozwala zobaczyć efekt przed decyzją. Konieczne lekkie szlifowanie zęba (poza licówkami "no-prep" w wybranych przypadkach).

### EN

**Synonyms**: veneers, porcelain veneers, composite veneers, Emax veneers.
Brief: Thin shells on the front surface of teeth. Composite: chairside, one visit, 5–7 year lifespan. Porcelain Emax: lab-made, two visits, 10–15 year lifespan, better aesthetics. Mock-up consultation recommended.

### RU

**Синонимы**: виниры, виниры керамические, виниры композитные, виниры Emax.
Кратко: Тонкие накладки на переднюю поверхность зубов. Композитные: один визит, 5–7 лет. Керамические Emax: два визита, 10–15 лет, эстетичнее. Рекомендуется примерка mock-up.

---

## Konsultacja ortodontyczna

**Synonimy**: konsultacja ortodontyczna, wizyta u ortodonty, pierwsza wizyta ortodontyczna, omówienie aparatu.

Typ: ortodoncja (konsultacja)
Czas trwania (typowy): 30–45 min
Konsultacja wymagana przed: nie (sama jest konsultacją)
NFZ: nie dla dorosłych; tak dla dzieci do 12 roku życia (konsultacja i aparat zdejmowany w wybranym zakresie)

Pytania od pacjenta (przykład):

- "Chciałbym się umówić do ortodonty, mam krzywe zęby od dawna."
- "Mój syn ma 9 lat, dentysta polecił konsultację ortodontyczną."

Krótki opis:
Wizyta diagnostyczna u ortodonty. Ocena zwarcia, ustawienia zębów, ewentualnych wad zgryzu. Zwykle ortodonta zleca dodatkowe badania: zdjęcie pantomograficzne i cefalometryczne, czasem CBCT i skan wewnątrzustny. Na podstawie diagnostyki ortodonta przedstawia plan leczenia: typ aparatu, czas trwania, koszt. Diagnostyka rozliczana osobno.

### EN

**Synonyms**: orthodontic consultation, ortho first visit, braces consultation.
Brief: Diagnostic visit with an orthodontist. Bite and alignment assessment. Additional imaging (panoramic, cephalometric, CBCT, intraoral scan) usually ordered. Plan and price presented after diagnostics.

### RU

**Синонимы**: консультация ортодонта, первый визит к ортодонту, консультация по брекетам.
Кратко: Диагностический визит. Оценка прикуса, дополнительные снимки (панорама, цефалометрия, КТ, сканер). План и стоимость после диагностики.

---

## Aparat stały

**Synonimy**: aparat stały, aparat ortodontyczny stały, aparat metalowy, aparat estetyczny, brekiety, brackety, aparat samoligaturujący, aparat kryształowy.

Typ: ortodoncja
Czas trwania (typowy): zakładanie 90–120 min, leczenie 18–36 miesięcy, wizyty kontrolne co 4–8 tygodni
Konsultacja wymagana przed: tak, obowiązkowo, z pełną diagnostyką
NFZ: nie dla dorosłych; częściowo dla dzieci do 12 lat (NFZ pokrywa aparat zdejmowany, nie stały)

Pytania od pacjenta (przykład):

- "Ile kosztuje aparat stały na obie szczęki? Metalowy, nie estetyczny."
- "Macie aparaty samoligaturujące?"

Krótki opis:
Stały aparat ortodontyczny przyklejany do zębów. Typy: metalowy (najtańszy, najmocniejszy, mało estetyczny), estetyczny porcelanowy lub kryształowy (mniej widoczny, droższy), samoligaturujący (szybsze leczenie, mniejszy nacisk; popularne marki: Damon, Speed, Carriere). Leczenie trwa 18–36 miesięcy w zależności od wady zgryzu i wieku pacjenta. Wymagane regularne wizyty kontrolne (zwykle co 4–6 tygodni), prawidłowa higiena (osobne szczoteczki międzyzębowe, irygator). Po zdjęciu aparatu obowiązkowy retainer (utrzymywacz wyniku): stały podklejany od wewnątrz lub szyna zdejmowana na noc.

### EN

**Synonyms**: fixed braces, traditional braces, ceramic braces, Damon braces, self-ligating braces.
Brief: Fixed orthodontic appliance bonded to teeth. Metal, ceramic, or self-ligating. 18–36 months of treatment, checkup every 4–8 weeks. Retainer mandatory after removal. Price varies by clinic.

### RU

**Синонимы**: брекеты, металлические брекеты, керамические брекеты, самолигирующие брекеты, Damon.
Кратко: Несъёмная брекет-система. Металл, керамика, самолигирующие. Лечение 18–36 месяцев, контроль раз в 4–8 недель. После снятия обязательно ношение ретейнера. Цена зависит от клиники.

---

## Aparat nakładkowy / alignery

**Synonimy**: Invisalign, aparat nakładkowy, nakładki ortodontyczne, aligner, alignery, przezroczyste nakładki, niewidoczny aparat.

Typ: ortodoncja
Czas trwania (typowy): konsultacja 60 min, leczenie 12–24 miesięcy
Konsultacja wymagana przed: tak, obowiązkowo, ze skanem 3D
NFZ: nie

Pytania od pacjenta (przykład):

- "Czy robicie nakładki ortodontyczne? Wolałabym coś niewidocznego."
- "Ile kosztuje pełne leczenie nakładkowe na obie szczęki?"
- "Robicie Invisalign czy inne alignery?"

Krótki opis:
Przezroczyste, zdejmowane nakładki noszone 20–22 godziny na dobę, zmieniane co 1–2 tygodnie. Niewidoczne dla otoczenia. Zalecane dla dorosłych i nastolatków z umiarkowanymi wadami zgryzu. Cięższe przypadki wymagają aparatu stałego. Po skanowaniu 3D pacjent dostaje wirtualną symulację efektu końcowego. Leczenie trwa zwykle 12–24 miesięcy. Mniej wizyt kontrolnych niż przy aparacie stałym.

### EN

**Synonyms**: Invisalign, clear aligners, invisible braces.
Brief: Clear removable aligners worn 20–22 hours daily, changed every 1–2 weeks. Suitable for adults and teens with mild to moderate misalignment. 3D scan and virtual outcome simulation. 12–24 months treatment.

### RU

**Синонимы**: Invisalign, элайнеры, прозрачные капы, невидимые брекеты.
Кратко: Прозрачные съёмные капы, 20–22 часа в день, смена каждые 1–2 недели. Для лёгких и средних случаев. 3D сканирование, виртуальный план. 12–24 месяца лечения.

---

## Stomatologia dziecięca

**Synonimy**: stomatologia dziecięca, dentysta dla dzieci, pedodoncja, wizyta dziecka u dentysty, adaptacja dziecka, leczenie mleczaków.

Typ: leczenie + profilaktyka (specjalna grupa pacjentów)
Czas trwania (typowy): pierwsza wizyta adaptacyjna 20–30 min; zwykła wizyta 30–45 min
Konsultacja wymagana przed: nie, ale zalecana wizyta adaptacyjna jako pierwsza
NFZ: tak (pełny zakres dla dzieci do 18 roku życia: przegląd, plomby, lakowanie, fluoryzacja, ekstrakcja)

Pytania od pacjenta (przykład):

- "Córka ma 4 lata, pierwsza wizyta u dentysty, jak to wygląda u Was?"
- "Robicie plomby u dzieci? Syn ma 6 lat i próchnicę na mleczakach."

Krótki opis:
Stomatologia dziecięca to osobna kategoria z dwóch powodów: techniki pracy z dzieckiem (adaptacja, ograniczenie czasu wizyty, nagrody, brak elementu strachu) oraz specyfika leczenia mleczaków (różne od stałych zębów, krótsze korzenie, większy nerw). Pierwsza wizyta to zwykle wizyta adaptacyjna: pokazanie gabinetu, fotela, narzędzi, bez rzeczywistego zabiegu. Następne wizyty już lecznicze. NFZ obejmuje pełny zakres usług dla dzieci do 18 roku życia.

### EN

**Synonyms**: pediatric dentistry, children's dentist, kids dental, milk teeth treatment.
Brief: Separate specialty for children. First visit usually adaptation only (no procedure). Different techniques for primary teeth. Free under NFZ for children under 18 (full scope).

### RU

**Синонимы**: детская стоматология, детский стоматолог, лечение молочных зубов, адаптация ребёнка.
Кратко: Отдельная специальность. Первый визит обычно адаптационный (без процедуры). Особые техники для молочных зубов. Бесплатно по NFZ до 18 лет.

---

## Co obejmuje NFZ

**Synonimy**: NFZ, państwowy dentysta, refundacja NFZ, bezpłatny dentysta, co refunduje NFZ, dentysta na NFZ, kasa chorych.

Typ: informacja o refundacji (nie usługa kliniczna)
Czas trwania (typowy): nie dotyczy
Konsultacja wymagana przed: nie dotyczy
NFZ: dotyczy tego punktu w całości

Pytania od pacjenta (przykład):

- "Czy są terminy na NFZ? Co tam mogę zrobić bez płacenia?"
- "Plombę na NFZ da się? Mam ubytek na trójce."

Krótki opis:
NFZ (Narodowy Fundusz Zdrowia) finansuje ograniczony zakres usług stomatologicznych. Dla dorosłych: jeden przegląd rocznie, wypełnienia z materiałów refundowanych na zęby przednie i niektóre boczne, leczenie kanałowe zębów jedno- i dwukanałowych (przednich; w trybie pilnym możliwy szerszy zakres), ekstrakcje w trybie pilnym, proteza akrylowa raz na 5 lat, znieczulenie miejscowe. Dla dzieci do 18 roku życia: pełny zakres (przegląd, plomby ze światłoutwardzalnego kompozytu na zębach przednich, lakowanie szóstek do 8 roku życia, fluoryzacja, ekstrakcje, leczenie kanałowe wszystkich zębów). Nie obejmuje: higienizacji, wybielania, koron, implantów, ortodoncji u dorosłych, większości protetyki. Terminy NFZ w skali kraju często są długie (od tygodni do kilku miesięcy). Czy dana klinika przyjmuje na NFZ i w jakim zakresie zależy od jej kontraktu z NFZ; ta informacja jest w danych konkretnej kliniki (Layer 2), nie tutaj.

### EN

**Synonyms**: NFZ coverage, public dental insurance Poland, free dentist, what NFZ covers.
Brief: NFZ is the Polish public health fund. Limited dental coverage. Adults: one checkup per year, basic fillings (limited materials, front teeth and some back), single- and double-canal endodontics (front), emergency extractions, acrylic denture every 5 years. Children under 18: full scope. Not covered: hygiene, whitening, crowns, implants, adult orthodontics. NFZ wait times often weeks to months.

### RU

**Синонимы**: NFZ, государственная страховка, что покрывает NFZ, бесплатный стоматолог в Польше.
Кратко: NFZ: польский фонд здоровья. Покрывает ограниченно. Взрослым: осмотр раз в год, базовые пломбы (ограниченные материалы), эндодонтия передних зубов, экстракции по неотложным показаниям, акриловый протез раз в 5 лет. Детям до 18: полный объём. Не покрывает: гигиену, отбеливание, коронки, импланты, ортодонтию у взрослых. Очереди часто недели или месяцы.
