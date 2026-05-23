// All clinic operations are in Warsaw; render every patient-facing datetime
// in Europe/Warsaw so the value matches what staff and patients actually see,
// regardless of the user's browser locale or server region.
const WARSAW_TZ = "Europe/Warsaw";

const polishDayMonth = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: WARSAW_TZ,
});

const polishHourMinute = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: WARSAW_TZ,
});

const polishShortDateTime = new Intl.DateTimeFormat("pl-PL", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: WARSAW_TZ,
});

export function formatPolishDayAndTime(date: Date): string {
  return `${polishDayMonth.format(date)}, godz. ${polishHourMinute.format(date)}`;
}

export function formatShortDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return polishShortDateTime.format(d);
}
