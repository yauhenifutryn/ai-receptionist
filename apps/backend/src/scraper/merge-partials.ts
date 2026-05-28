import type {
  ScraperOutput,
  ScraperService,
  ScraperStaff,
  ScraperTenantInfo,
} from "@ai-receptionist/contracts";

/**
 * Merge N partial ScraperOutputs (one per batch) into a single output.
 *
 * Pure function. No LLM, no I/O. Dedup uses a Polish-diacritic-stripped
 * lowercase key so "Endodoncja" and "endodoncja" merge, but "Endodoncja"
 * and "Leczenie kanałowe" stay separate (synonym merging would require
 * an LLM — defer to the owner's KB editor for that level of curation).
 */
export function mergePartials(partials: ScraperOutput[]): ScraperOutput {
  if (partials.length === 0) {
    throw new Error("mergePartials: at least one partial required");
  }
  if (partials.length === 1) return partials[0]!;

  const unsorted =
    partials
      .map((p) => p.unsorted)
      .filter((s): s is string => Boolean(s && s.trim()))
      .join("\n\n") || undefined;

  return {
    sourceUrl: partials[0]!.sourceUrl,
    scrapedAt: partials[0]!.scrapedAt,
    tenant: mergeTenant(partials.map((p) => p.tenant)),
    staff: mergeByKey(
      partials.flatMap((p) => p.staff),
      (s) => dedupeKey(s.name),
      preferRicherStaff,
    ),
    services: mergeByKey(
      partials.flatMap((p) => p.services),
      (s) => dedupeKey(s.name),
      preferRicherService,
    ),
    faq: mergeByKey(
      partials.flatMap((p) => p.faq),
      (f) => dedupeKey(f.question),
      (a) => a,
    ),
    ...(unsorted !== undefined ? { unsorted } : {}),
    hasUnknownPrices: partials.some((p) => p.hasUnknownPrices),
  };
}

/**
 * Lowercase, trim, collapse whitespace, strip Polish diacritics.
 * Mechanical dedup — does NOT do synonym matching.
 */
function dedupeKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/ł/g, "l"); // ł isn't NFD-decomposable
}

function firstNonEmpty<T>(
  values: (T | undefined)[],
  isEmpty: (v: T) => boolean,
): T | undefined {
  for (const v of values) {
    if (v !== undefined && !isEmpty(v)) return v;
  }
  return undefined;
}

function mergeTenant(tenants: ScraperTenantInfo[]): ScraperTenantInfo {
  const name = tenants.find((t) => t.name.trim().length > 0)?.name ?? tenants[0]!.name;
  const description = firstNonEmpty(
    tenants.map((t) => t.description),
    (s) => s.trim().length === 0,
  );
  const merged: ScraperTenantInfo = { name };
  const address = firstNonEmpty(
    tenants.map((t) => t.address),
    (s) => s.trim().length === 0,
  );
  if (address) merged.address = address;
  const phone = firstNonEmpty(
    tenants.map((t) => t.phone),
    (s) => s.trim().length === 0,
  );
  if (phone) merged.phone = phone;
  const email = firstNonEmpty(
    tenants.map((t) => t.email),
    (s) => s.trim().length === 0,
  );
  if (email) merged.email = email;
  const hours = mergeHours(
    tenants.map((t) => t.hours).filter((h): h is NonNullable<typeof h> => h !== undefined),
  );
  if (hours) merged.hours = hours;
  if (description) merged.description = description.slice(0, 500);
  return merged;
}

function mergeHours(
  hours: NonNullable<ScraperTenantInfo["hours"]>[],
): ScraperTenantInfo["hours"] {
  if (hours.length === 0) return undefined;
  const days: Array<keyof NonNullable<ScraperTenantInfo["hours"]>> = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "notes",
  ];
  const merged: NonNullable<ScraperTenantInfo["hours"]> = {};
  for (const day of days) {
    const v = firstNonEmpty(
      hours.map((h) => h[day]),
      (s) => s.trim().length === 0,
    );
    if (v) merged[day] = v;
  }
  return merged;
}

/**
 * Generic dedup-and-merge for arrays keyed by a function. First occurrence
 * sets array position; later occurrences are reconciled via `prefer(a, b)`
 * which picks the "richer" of two entries.
 */
function mergeByKey<T>(items: T[], key: (item: T) => string, prefer: (a: T, b: T) => T): T[] {
  const byKey = new Map<string, T>();
  const order: string[] = [];
  for (const item of items) {
    const k = key(item);
    const existing = byKey.get(k);
    if (existing === undefined) {
      byKey.set(k, item);
      order.push(k);
    } else {
      byKey.set(k, prefer(existing, item));
    }
  }
  return order.map((k) => byKey.get(k)!);
}

function preferRicherStaff(a: ScraperStaff, b: ScraperStaff): ScraperStaff {
  const aRichness =
    (a.specialization?.trim() ? 1 : 0) + a.languages.length + (a.role?.trim() ? 1 : 0);
  const bRichness =
    (b.specialization?.trim() ? 1 : 0) + b.languages.length + (b.role?.trim() ? 1 : 0);
  return bRichness > aRichness ? b : a;
}

function preferRicherService(a: ScraperService, b: ScraperService): ScraperService {
  const aHasPrice = a.price && a.price.qualifier && a.price.qualifier !== "unknown";
  const bHasPrice = b.price && b.price.qualifier && b.price.qualifier !== "unknown";
  if (bHasPrice && !aHasPrice) return b;
  if (aHasPrice && !bHasPrice) return a;
  const aRichness = a.synonyms.length + (a.description?.length ?? 0);
  const bRichness = b.synonyms.length + (b.description?.length ?? 0);
  return bRichness > aRichness ? b : a;
}
