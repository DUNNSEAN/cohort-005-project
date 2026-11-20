// Fails when a file is too big for an agent to read and edit in one go.
// Tokens are estimated as bytes / 4, which is close enough for code.
// Usage: node scripts/check-file-tokens.js <file>...
//        node scripts/check-file-tokens.js --all
//
// --all checks every tracked file. A file listed in
// scripts/oversized-files.txt may stay over the limit until it is split; the
// check fails on any other file over the limit, and on a listed file that is
// now under it, so the list only shrinks.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const MAX_TOKENS = 5000;
const BYTES_PER_TOKEN = 4;
const KNOWN_OVERSIZED = "scripts/oversized-files.txt";

// Generated files that nobody edits by hand, and workflow files, which
// GitHub reads as one file each and which cannot be split.
const IGNORED = [
  /(^|\/)package-lock\.json$/,
  /^drizzle\//,
  /^\.github\/workflows\/[^/]+\.yml$/,
];

const isBinary = (contents) => contents.subarray(0, 8000).includes(0);
const isFile = (file) => statSync(file, { throwIfNoEntry: false })?.isFile();

const findOversized = (files) =>
  files
    .map((file) => file.replaceAll("\\", "/").replace(`${process.cwd()}/`, ""))
    .filter((file) => !IGNORED.some((pattern) => pattern.test(file)))
    .filter(isFile)
    .map((file) => ({ file, contents: readFileSync(file) }))
    .filter(({ contents }) => !isBinary(contents))
    .map(({ file, contents }) => ({
      file,
      tokens: Math.ceil(contents.length / BYTES_PER_TOKEN),
    }))
    .filter(({ tokens }) => tokens > MAX_TOKENS);

const readKnownOversized = () =>
  readFileSync(KNOWN_OVERSIZED, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

const checkAll = () => {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const known = new Set(readKnownOversized());
  const found = findOversized(tracked);
  const fresh = found.filter(({ file }) => !known.has(file));
  const stillOver = new Set(found.map(({ file }) => file));
  const stale = [...known].filter((file) => !stillOver.has(file));
  for (const { file, tokens } of fresh) {
    console.error(
      `${file}: ~${tokens} tokens, over the ${MAX_TOKENS}-token limit. Split it.`
    );
  }
  for (const file of stale) {
    console.error(
      `${file} is under the limit now. Remove it from ${KNOWN_OVERSIZED}.`
    );
  }
  process.exit(fresh.length + stale.length > 0 ? 1 : 0);
};

if (process.argv[2] === "--all") checkAll();

const oversized = findOversized(process.argv.slice(2));

if (oversized.length > 0) {
  console.error(`These files are over ${MAX_TOKENS} tokens (bytes / 4):\n`);
  for (const { file, tokens } of oversized) {
    console.error(`  ${file}: ~${tokens} tokens`);
  }
  console.error(`
Split each file in a commit of its own, before the change you came to make, so
the review can see the split is a pure move. Do not delete code or squash it
onto fewer lines to get under the limit.

How to split:
- Find the seams. Look for groups of functions, components, or tests that
  change together and share little with the rest of the file.
- Route modules (app/routes/*): keep the loader, action, and page component in
  the route file. Move the business logic into a module in app/modules/ and
  sub-components into their own files in app/components/.
- Logic that is already in a module (app/modules/<name>/): split it into more
  files under lib/. Keep the entry points (index.ts, index.server.ts) small. Do
  not add a barrel file. See app/modules/README.md.
- Tests: split by the behaviour under test, one file per area (for example
  <name>.refunds.test.ts, <name>.permissions.test.ts). Move shared fixtures
  into a fixtures file in the same tests/ folder.
- Scripts and seed data: move large data literals into their own files and
  import them.

When you are done, run \`npm run check\` and commit again.`);
  process.exit(1);
}
