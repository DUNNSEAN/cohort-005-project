import { describe, expect, it } from "vitest";

import {
  findOversizedFile,
  formatReport,
  MAX_TOKENS,
} from "./check-file-tokens";

function textOfTokens(tokens: number): Buffer {
  return Buffer.from("a".repeat(tokens * 4));
}

describe("findOversizedFile", () => {
  it("accepts a file at the token limit", () => {
    expect(
      findOversizedFile("app/lib/x.ts", textOfTokens(MAX_TOKENS))
    ).toBeNull();
  });

  it("rejects a file one token over the limit", () => {
    expect(
      findOversizedFile("app/lib/x.ts", textOfTokens(MAX_TOKENS + 1))
    ).toEqual({ path: "app/lib/x.ts", tokens: MAX_TOKENS + 1 });
  });

  it("ignores lockfiles and migrations however large they are", () => {
    const huge = textOfTokens(MAX_TOKENS * 10);
    expect(findOversizedFile("package-lock.json", huge)).toBeNull();
    expect(findOversizedFile("drizzle/meta/0001_snapshot.json", huge)).toBe(
      null
    );
  });

  it("ignores binary files", () => {
    const image = Buffer.concat([Buffer.from([0]), textOfTokens(MAX_TOKENS)]);
    expect(findOversizedFile("public/logo.png", image)).toBeNull();
  });
});

describe("formatReport", () => {
  it("tells the agent to move route logic into a module", () => {
    const report = formatReport([
      { path: "app/routes/instructor.$courseId.tsx", tokens: 20000 },
    ]);
    expect(report).toContain("app/modules/README.md");
  });

  it("tells the agent to split a test file by behaviour", () => {
    const report = formatReport([
      { path: "app/modules/x/tests/x.test.ts", tokens: 9000 },
    ]);
    expect(report).toContain("Split it by behaviour");
  });
});
