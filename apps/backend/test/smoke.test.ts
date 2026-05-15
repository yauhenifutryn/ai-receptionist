import { describe, it, expect } from "vitest";

describe("backend smoke", () => {
  it("Vitest harness wired up", () => {
    expect(1 + 1).toBe(2);
  });
});
