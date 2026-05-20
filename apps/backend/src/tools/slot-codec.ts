/**
 * Slot codec — placeholder while no real PMS adapter is wired.
 *
 * `check_availability` returns 3 mock slots whose slotIds embed the start/end
 * timestamps so that `create_booking` can decode them statelessly. When a real
 * CalendarProvider lands (W2 of the sprint after vertical lock), this codec is
 * replaced by a server-side slot cache.
 */

export interface DecodedSlot {
  startsAt: string;
  endsAt: string;
  serviceCategory: string;
}

const PREFIX = "mock_";

export function encodeSlot(slot: DecodedSlot): string {
  const payload = JSON.stringify(slot);
  return PREFIX + Buffer.from(payload, "utf-8").toString("base64url");
}

export function decodeSlot(slotId: string): DecodedSlot | null {
  if (!slotId.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(slotId.slice(PREFIX.length), "base64url").toString("utf-8");
    const parsed = JSON.parse(raw) as Partial<DecodedSlot>;
    if (
      typeof parsed.startsAt !== "string" ||
      typeof parsed.endsAt !== "string" ||
      typeof parsed.serviceCategory !== "string"
    ) {
      return null;
    }
    return parsed as DecodedSlot;
  } catch {
    return null;
  }
}
