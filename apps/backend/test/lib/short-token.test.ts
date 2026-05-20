import { describe, it, expect } from "vitest";
import { generateShortToken, SHORT_TOKEN_ALPHABET } from "../../src/lib/short-token.js";

describe("generateShortToken", () => {
  it("produces 8-character tokens by default", () => {
    const token = generateShortToken();
    expect(token).toHaveLength(8);
  });

  it("uses only the visually unambiguous alphabet", () => {
    const token = generateShortToken();
    for (const ch of token) {
      expect(SHORT_TOKEN_ALPHABET).toContain(ch);
    }
  });

  it("excludes 0, O, 1, l, I from the alphabet", () => {
    for (const banned of ["0", "O", "1", "l", "I"]) {
      expect(SHORT_TOKEN_ALPHABET).not.toContain(banned);
    }
  });

  it("produces different tokens on successive calls (no static seed)", () => {
    const a = generateShortToken();
    const b = generateShortToken();
    expect(a).not.toBe(b);
  });
});
