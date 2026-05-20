import { customAlphabet } from "nanoid";

// URL-safe alphabet excluding visually ambiguous chars (0, O, 1, l, I).
// Used for confirmation-page short tokens shown to patients on the
// /b/<token> page and in SMS bodies.
export const SHORT_TOKEN_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const nanoid = customAlphabet(SHORT_TOKEN_ALPHABET, 8);

export function generateShortToken(): string {
  return nanoid();
}
