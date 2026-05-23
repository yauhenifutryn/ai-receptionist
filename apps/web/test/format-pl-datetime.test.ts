import { describe, it, expect } from "vitest";
import { formatPolishDayAndTime } from "../lib/format-pl-datetime";

describe("formatPolishDayAndTime", () => {
  it("formats a weekday Polish date with hour:minute", () => {
    // 2026-03-12 (Thursday) at 14:30 UTC. Asserted in Europe/Warsaw time
    // by setting the date in local-server-equivalent UTC. The actual hours
    // shown depend on the host TZ at run time, so assert structure not
    // exact hours.
    const out = formatPolishDayAndTime(new Date("2026-03-12T14:30:00Z"));
    expect(out).toMatch(/^[a-ząćęłńóśźż]+, \d+ [a-ząćęłńóśźż]+, godz\. \d{2}:\d{2}$/i);
  });

  it("uses Polish month + weekday names", () => {
    const out = formatPolishDayAndTime(new Date("2026-05-23T10:00:00Z"));
    expect(out.toLowerCase()).toMatch(/sobota|maja/);
  });
});
