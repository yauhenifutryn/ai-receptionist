import type { Metadata } from "next";
import styles from "./v3.module.css";

export const metadata: Metadata = {
  title: "AI Receptionist · Polska recepcja telefoniczna dla gabinetów stomatologicznych",
  description:
    "Odbieramy telefony do gabinetu, prowadzimy rozmowę po polsku, umawiamy wizyty. Dwadzieścia cztery godziny, siedem dni w tygodniu. Polska, RODO, dane na serwerach w Unii.",
};

const DOC_SERIAL = "DOC · WAR · 2026 · v3";

export default function V3LandingPage() {
  return (
    <main className={styles.page} lang="pl">
      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerRow}`}>
          <a href="/v3" className={styles.wordmark}>
            <span className={styles.wordmarkDot} aria-hidden />
            AI Receptionist
          </a>
          <div
            className={styles.langStrip}
            role="group"
            aria-label="Język strony"
          >
            <span className={styles.langActive} aria-current="true">
              PL
            </span>
            <span className={styles.langDivider} aria-hidden>
              /
            </span>
            <button type="button" className={styles.langGhost} disabled>
              EN
            </button>
            <span className={styles.langDivider} aria-hidden>
              /
            </span>
            <button type="button" className={styles.langGhost} disabled>
              RU
            </button>
          </div>
        </div>
      </header>

      <section className={`${styles.shell} ${styles.hero}`} aria-labelledby="v3-hero">
        <p className={styles.heroSerial}>{DOC_SERIAL}</p>
        <h1 id="v3-hero" className={styles.heroDisplay}>
          Recepcja, która <em>nie odkłada</em> słuchawki.
        </h1>
        <p className={styles.heroLede}>
          Asystent głosowy dla polskich gabinetów stomatologicznych. Odbiera
          telefony, rozmawia naturalnie po polsku, umawia wizyty zgodnie z
          grafikiem gabinetu. Działa, kiedy rejestracja jest zajęta, po
          godzinach i w weekend.
        </p>

        <HeroSchematic />
      </section>

      <section
        className={`${styles.shell} ${styles.workbench}`}
        aria-labelledby="v3-workbench"
      >
        <div className={styles.sectionLead}>
          <p className={styles.sectionEyebrow}>01 / Powierzchnia operacyjna</p>
          <h2 id="v3-workbench" className={styles.sectionHeading}>
            Trzy panele pokazują, co robi system, gdy dzwoni pacjent.
          </h2>
        </div>

        <div className={styles.panes}>
          {/* Pane 1 — Transcript */}
          <article className={styles.pane} aria-label="Próbka rozmowy">
            <div className={styles.paneHead}>
              <span className={styles.paneLabel}>Rozmowa, na żywo</span>
              <span className={styles.paneMeta}>PL · 00:42</span>
            </div>
            <div className={styles.transcript}>
              <div className={styles.tLine}>
                <span className={`${styles.tWho} ${styles.tWhoAgent}`}>
                  Agent
                </span>
                <span className={styles.tText}>
                  Dzień dobry, mówi asystent w klinice Dynasty. W czym mogę
                  pomóc?
                </span>
              </div>
              <div className={styles.tLine}>
                <span className={styles.tWho}>Pacjent</span>
                <span className={styles.tText}>
                  Boli mnie ząb od wczoraj. Czy jest wolny termin na dziś?
                </span>
              </div>
              <div className={styles.tLine}>
                <span className={`${styles.tWho} ${styles.tWhoAgent}`}>
                  Agent
                </span>
                <span className={styles.tText}>
                  Sprawdzam grafik. Mam termin o 14:30 u doktora Nowaka,
                  konsultacja bólu. Pasuje?
                </span>
              </div>
              <div className={styles.tLine}>
                <span className={styles.tWho}>Pacjent</span>
                <span className={styles.tText}>Tak, proszę.</span>
              </div>
              <div className={styles.tLine}>
                <span className={`${styles.tWho} ${styles.tWhoAgent}`}>
                  Agent
                </span>
                <span className={styles.tText}>
                  Zarezerwowane. Do zobaczenia o 14:30. Recepcja prosi o
                  przybycie 10 minut wcześniej.
                </span>
              </div>
            </div>
          </article>

          {/* Pane 2 — Agenda */}
          <article className={styles.pane} aria-label="Grafik gabinetu">
            <div className={styles.paneHead}>
              <span className={styles.paneLabel}>Grafik, dziś</span>
              <span className={styles.paneMeta}>PT · 22.05</span>
            </div>
            <div className={styles.agenda} role="list">
              <div className={styles.slot} role="listitem">
                <span className={styles.slotTime}>09:00</span>
                <span className={styles.slotName}>Kowalska A.</span>
                <span className={styles.slotState}>Higienizacja</span>
              </div>
              <div className={styles.slot} role="listitem">
                <span className={styles.slotTime}>10:30</span>
                <span className={styles.slotName}>Nowak T.</span>
                <span className={styles.slotState}>Konsultacja</span>
              </div>
              <div className={styles.slot} role="listitem">
                <span className={styles.slotTime}>12:00</span>
                <span className={styles.slotName}>—</span>
                <span className={styles.slotState}>Wolne</span>
              </div>
              <div
                className={`${styles.slot} ${styles.slotNew}`}
                role="listitem"
                aria-label="Nowy slot zarezerwowany przez agenta"
              >
                <span className={styles.slotTime}>14:30</span>
                <span className={styles.slotName}>Pacjent (nowy)</span>
                <span className={styles.slotState}>Nowa rezerwacja</span>
              </div>
              <div className={styles.slot} role="listitem">
                <span className={styles.slotTime}>16:00</span>
                <span className={styles.slotName}>Wiśniewski M.</span>
                <span className={styles.slotState}>Plomba</span>
              </div>
            </div>
          </article>

          {/* Pane 3 — Source */}
          <article className={styles.pane} aria-label="Co agent wie">
            <div className={styles.paneHead}>
              <span className={styles.paneLabel}>Źródło wiedzy</span>
              <span className={styles.paneMeta}>3 warstwy</span>
            </div>
            <dl className={styles.source}>
              <div className={styles.sourceItem}>
                <dt>Ontologia stomatologiczna</dt>
                <dd>
                  Uniwersalna baza usług, triażu i skryptów po polsku, angielsku
                  i rosyjsku. Aktualizowana przez nas.
                </dd>
              </div>
              <div className={`${styles.sourceItem} ${styles.sourceItemAccent}`}>
                <dt>Dane Pana gabinetu</dt>
                <dd>
                  Lekarze, godziny, usługi i ceny czytane ze strony{" "}
                  <code>klinika.pl</code>. Dane są zawsze ważniejsze niż
                  ontologia.
                </dd>
              </div>
              <div className={styles.sourceItem}>
                <dt>Grafik na żywo</dt>
                <dd>
                  Połączenie z kalendarzem Booksy, Medfile lub Google. Agent
                  widzi wolne okienka w czasie rozmowy.
                </dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      <section
        className={`${styles.shell} ${styles.method}`}
        aria-labelledby="v3-method"
      >
        <div className={styles.sectionLead}>
          <p className={styles.sectionEyebrow}>02 / Jak to robimy</p>
          <h2 id="v3-method" className={styles.sectionHeading}>
            Trzy zasady, na których stoi cały produkt.
          </h2>
        </div>

        <ol className={styles.methodList}>
          <li className={styles.methodItem}>
            <p className={styles.methodNum}>Zasada 01</p>
            <h3 className={styles.methodTitle}>
              Polski, nie tłumaczony z angielskiego.
            </h3>
            <p className={styles.methodBody}>
              Każda kwestia jest napisana przez osobę mówiącą po polsku,
              sprawdzona pod kątem naturalności i tonu właściwego dla wizyty u
              dentysty. Nie używamy automatycznych tłumaczeń.
            </p>
          </li>
          <li className={styles.methodItem}>
            <p className={styles.methodNum}>Zasada 02</p>
            <h3 className={styles.methodTitle}>
              Eskaluje, nie improwizuje.
            </h3>
            <p className={styles.methodBody}>
              Pytania medyczne, rozliczeniowe, dotyczące NFZ albo skarg trafiają
              do recepcji. Agent nigdy nie zgaduje. Albo wie z bazy wiedzy
              gabinetu, albo prosi człowieka o oddzwonienie.
            </p>
          </li>
          <li className={styles.methodItem}>
            <p className={styles.methodNum}>Zasada 03</p>
            <h3 className={styles.methodTitle}>
              Dane zostają w Unii.
            </h3>
            <p className={styles.methodBody}>
              Serwery w Irlandii i Frankfurcie. Nagranie głosu nigdy nie jest
              przechowywane. Zapis rozmowy tylko za zgodą pacjenta, według
              RODO.
            </p>
          </li>
        </ol>
      </section>

      <section
        className={`${styles.shell} ${styles.editorial}`}
        aria-labelledby="v3-quote"
      >
        <div className={styles.editorialInner}>
          <p className={styles.editorialEyebrow}>03 / Powód, dla którego to budujemy</p>
          <p id="v3-quote" className={styles.editorialQuote}>
            Sześćdziesiąt procent telefonów do gabinetu pada poza godzinami pracy
            rejestracji. <span>Każdy odrzucony telefon to pacjent, który zadzwoni gdzie indziej.</span>
          </p>
        </div>
      </section>

      <section
        className={`${styles.shell} ${styles.contact}`}
        aria-labelledby="v3-contact"
      >
        <div className={styles.contactRow}>
          <h2 id="v3-contact" className={styles.contactLead}>
            Pilotaż dla klinik z Warszawy w maju 2026.
          </h2>
          <div className={styles.contactBody}>
            <p>
              Zbieramy zamknięte grono klinik na pierwszy pilotaż. Bez umów na
              rok. Bez integracji, których trzeba długo wdrażać. Tydzień
              wdrożenia, dwa tygodnie testu, decyzja po pilotażu.
            </p>
            <a className={styles.contactLink} href="mailto:hello@odbiera.ai">
              Napisz do nas <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.shell} ${styles.footerRow}`}>
          <span className={styles.footerSerial}>{DOC_SERIAL}</span>
          <div className={styles.langStrip}>
            <span className={styles.langActive}>PL</span>
            <span className={styles.langDivider} aria-hidden>
              /
            </span>
            <span>EN</span>
            <span className={styles.langDivider} aria-hidden>
              /
            </span>
            <span>RU</span>
          </div>
          <span className={styles.footerCopyright}>Warszawa · 2026</span>
        </div>
      </footer>
    </main>
  );
}

function HeroSchematic() {
  return (
    <svg
      className={styles.heroSchematic}
      viewBox="0 0 1200 280"
      role="img"
      aria-label="Schemat przepływu: telefon, ontologia, grafik, rezerwacja."
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Hairline horizontal axis */}
      <line
        className="drawSlow"
        x1="40"
        y1="160"
        x2="1160"
        y2="160"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.35"
      />

      {/* Node 1: incoming call */}
      <g>
        <circle className="node" cx="120" cy="160" r="34" />
        <text
          x="120"
          y="166"
          textAnchor="middle"
          fontFamily="var(--font-mono), ui-monospace, monospace"
          fontSize="14"
          fill="currentColor"
        >
          ☎
        </text>
        <text x="120" y="232" textAnchor="middle" className="label">
          Telefon
        </text>
      </g>

      {/* Connector 1→2 */}
      <line
        className="draw"
        x1="154"
        y1="160"
        x2="346"
        y2="160"
        stroke="currentColor"
        strokeWidth="1.25"
      />

      {/* Node 2: ontology */}
      <g>
        <rect className="node" x="346" y="126" width="160" height="68" />
        <text x="426" y="158" textAnchor="middle" fontSize="13" fill="currentColor">
          Ontologia
        </text>
        <text x="426" y="178" textAnchor="middle" fontSize="11" fill="var(--ink-mid)" opacity="0.85">
          PL · EN · RU
        </text>
        <text x="426" y="232" textAnchor="middle" className="label">
          Warstwa 1
        </text>
      </g>

      {/* Connector 2→3 */}
      <line
        className="draw"
        x1="506"
        y1="160"
        x2="690"
        y2="160"
        stroke="currentColor"
        strokeWidth="1.25"
      />

      {/* Node 3: clinic knowledge — ACCENT */}
      <g>
        <rect className="nodeAccent" x="690" y="118" width="180" height="84" />
        <text x="780" y="152" textAnchor="middle" fontSize="13" fill="var(--accent-deep)">
          Dane gabinetu
        </text>
        <text
          x="780"
          y="172"
          textAnchor="middle"
          fontFamily="var(--font-mono), ui-monospace, monospace"
          fontSize="11"
          fill="var(--accent-deep)"
        >
          klinika.pl
        </text>
        <text x="780" y="190" textAnchor="middle" fontSize="11" fill="var(--accent-deep)" opacity="0.8">
          + grafik na żywo
        </text>
        <text x="780" y="232" textAnchor="middle" className="label">
          Warstwa 2
        </text>
      </g>

      {/* Connector 3→4 */}
      <line
        className="draw"
        x1="870"
        y1="160"
        x2="1046"
        y2="160"
        stroke="currentColor"
        strokeWidth="1.25"
      />

      {/* Node 4: booking */}
      <g>
        <circle className="node" cx="1080" cy="160" r="34" />
        <text x="1080" y="156" textAnchor="middle" fontSize="11" fill="currentColor">
          14:30
        </text>
        <text x="1080" y="172" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.7">
          ✓ slot
        </text>
        <text x="1080" y="232" textAnchor="middle" className="label">
          Rezerwacja
        </text>
      </g>

      {/* Annotation arrows on top — ontology side */}
      <line
        className="drawSlow"
        x1="426"
        y1="96"
        x2="426"
        y2="126"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.5"
      />
      <text
        x="426"
        y="86"
        textAnchor="middle"
        className="label"
        opacity="0.7"
      >
        triaż, skrypty
      </text>

      {/* Annotation arrows on bottom — agency */}
      <line
        className="drawSlow"
        x1="780"
        y1="202"
        x2="780"
        y2="232"
        stroke="var(--accent)"
        strokeWidth="1"
        opacity="0.5"
        style={{ display: "none" }}
      />
    </svg>
  );
}
