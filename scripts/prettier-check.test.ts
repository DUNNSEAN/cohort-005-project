import { describe, expect, it } from "vitest";

import { chunk } from "./prettier-check";

function files(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `file-${index}.ts`);
}

describe("chunk", () => {
  it("keeps a small commit in one process", () => {
    expect(chunk(files(5))).toHaveLength(1);
  });

  it("splits a large commit across at most four processes", () => {
    const chunks = chunk(files(300));
    expect(chunks.length).toBeLessThanOrEqual(4);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("checks every file exactly once", () => {
    expect(chunk(files(123)).flat()).toEqual(files(123));
  });
});
