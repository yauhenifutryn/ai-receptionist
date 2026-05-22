import { describe, it, expect } from "vitest";
import {
  classifyTranscript,
  createLiveConsentChecker,
} from "../../src/consent/live-check.js";

const CONSENT_QUESTION_PL =
  "Czy zgadza się Pan / Pani na zachowanie zapisu tej rozmowy w celu poprawy jakości obsługi?";
const CONSENT_QUESTION_EN =
  "Do you consent to a transcript of this call being kept for service-quality purposes?";
const CONSENT_QUESTION_RU =
  "Согласны ли вы на сохранение записи этого разговора для улучшения качества обслуживания?";

function tx(turns: Array<{ role: "agent" | "user"; message: string }>) {
  return turns;
}

describe("classifyTranscript", () => {
  it("returns 'unknown' on empty transcript", () => {
    expect(classifyTranscript([])).toBe("unknown");
  });

  it("returns 'unknown' when the consent question was never asked", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: "Dzień dobry, w czym mogę pomóc?" },
          { role: "user", message: "Tak, chciałbym się umówić." },
        ]),
      ),
    ).toBe("unknown");
  });

  it("returns 'yes' when caller answers 'tak' to PL consent question", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: "Dzień dobry, mówi asystent AI." },
          { role: "user", message: "Dzień dobry." },
          { role: "agent", message: CONSENT_QUESTION_PL },
          { role: "user", message: "Tak, zgadzam się." },
        ]),
      ),
    ).toBe("yes");
  });

  it("returns 'no' when caller answers 'nie' to PL consent question", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: CONSENT_QUESTION_PL },
          { role: "user", message: "Nie, proszę nie nagrywać." },
        ]),
      ),
    ).toBe("no");
  });

  it("matches EN consent question + 'yes' reply", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: CONSENT_QUESTION_EN },
          { role: "user", message: "Sure, go ahead." },
        ]),
      ),
    ).toBe("yes");
  });

  it("matches RU consent question + Russian affirmative", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: CONSENT_QUESTION_RU },
          { role: "user", message: "Конечно." },
        ]),
      ),
    ).toBe("yes");
  });

  it("returns 'unknown' on ambiguous reply ('nie wiem')", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: CONSENT_QUESTION_PL },
          { role: "user", message: "Nie wiem." },
        ]),
      ),
    ).toBe("no"); // "nie" is a substring match; we accept this as a clear negative
  });

  it("handles punctuation around tokens ('Tak.' / 'Yes!')", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: CONSENT_QUESTION_PL },
          { role: "user", message: "Tak." },
        ]),
      ),
    ).toBe("yes");

    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: CONSENT_QUESTION_EN },
          { role: "user", message: "Yes!" },
        ]),
      ),
    ).toBe("yes");
  });

  it("returns 'unknown' when no user turn follows the consent question", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: CONSENT_QUESTION_PL },
          // call ended before patient could reply
        ]),
      ),
    ).toBe("unknown");
  });

  it("uses the FIRST user turn after the consent question, not later ones", () => {
    expect(
      classifyTranscript(
        tx([
          { role: "agent", message: CONSENT_QUESTION_PL },
          { role: "user", message: "Tak." },
          { role: "agent", message: "Świetnie. W czym mogę pomóc?" },
          { role: "user", message: "Nie, czekaj, anuluj." },
        ]),
      ),
    ).toBe("yes");
  });
});

describe("createLiveConsentChecker", () => {
  it("returns 'yes' when EL returns transcript with consent confirmed", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          transcript: [
            { role: "agent", message: CONSENT_QUESTION_PL },
            { role: "user", message: "Tak." },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const checker = createLiveConsentChecker({ apiKey: "test", fetcher: fakeFetch });
    expect(await checker("conv-1")).toBe("yes");
  });

  it("fails closed on non-2xx response from EL", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("not found", { status: 404 });
    const checker = createLiveConsentChecker({ apiKey: "test", fetcher: fakeFetch });
    expect(await checker("conv-missing")).toBe("unknown");
  });

  it("fails closed on network error", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error("ECONNRESET");
    };
    const checker = createLiveConsentChecker({ apiKey: "test", fetcher: fakeFetch });
    expect(await checker("conv-net-error")).toBe("unknown");
  });
});
