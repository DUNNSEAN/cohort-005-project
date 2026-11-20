import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A deep module is only as trustworthy as the tests on its interface, and
// diff-only mutation testing does not catch code moved into a module
// untested. Every module under app/modules/ ships a tests/ folder with at
// least one test file.

const modulesRoot = new URL("../app/modules/", import.meta.url);

const modules = readdirSync(modulesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const testFiles = (module: string): string[] => {
  try {
    return readdirSync(new URL(`${module}/tests/`, modulesRoot), {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => /\.test\.tsx?$/.test(file));
  } catch {
    return [];
  }
};

describe("app/modules", () => {
  it.each(modules)("%s has a test file in tests/", (module) => {
    expect(testFiles(module)).not.toEqual([]);
  });
});
