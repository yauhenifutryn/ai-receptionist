export function formatPolishDayAndTime(date: Date): string {
  const day = new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const time = new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day}, godz. ${time}`;
}
