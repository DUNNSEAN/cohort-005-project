import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Agents read whole files into their context. A file past this budget is
// expensive to read and hard to edit safely, so the pre-commit hook rejects it.
export const MAX_TOKENS = 5000;

// A cheap estimate: roughly four bytes of source per token.
const BYTES_PER_TOKEN = 4;

// Lockfiles, migrations and drizzle snapshots are generated, not read.
const EXEMPT_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)skills-lock\.json$/,
  /(^|\/)drizzle\//,
];

export type OversizedFile = {
  path: string;
  tokens: number;
};

export function estimateTokens(content: Buffer): number {
  return Math.ceil(content.byteLength / BYTES_PER_TOKEN);
}

export function isExempt(path: string): boolean {
  return EXEMPT_PATTERNS.some((pattern) => pattern.test(path));
}

function isBinary(content: Buffer): boolean {
  return content.includes(0);
}

export function findOversizedFile(
  path: string,
  content: Buffer
): OversizedFile | null {
  if (isExempt(path) || isBinary(content)) return null;
  const tokens = estimateTokens(content);
  return tokens > MAX_TOKENS ? { path, tokens } : null;
}

function splittingAdvice(path: string): string {
  if (/\.test\.tsx?$/.test(path)) {
    return [
      "This is a test file. Split it by behaviour:",
      "  - One test file per behaviour or entry point, e.g.",
      "    refunds.approve.test.ts and refunds.window.test.ts.",
      "  - Move shared setup into a fixture in the same tests/ folder.",
      "  - Arrange through the module's entry points, not by inserting rows.",
    ].join("\n");
  }
  if (path.startsWith("app/routes/")) {
    return [
      "This is a route. Keep the route thin:",
      "  - Move loader and action logic into a deep module in app/modules/",
      "    (copy app/modules/example/, read app/modules/README.md). The route",
      "    imports only the module's root entry points.",
      "  - Move each self-contained piece of UI into its own component file",
      "    in app/components/, passing it the data it needs as props.",
      "  - Leave the loader, action and top-level layout in the route.",
    ].join("\n");
  }
  if (path.startsWith("app/modules/")) {
    return [
      "This is inside a module. Split the implementation, not the interface:",
      "  - Move cohesive groups of functions into separate files under lib/.",
      "  - Keep the module's root entry points small; add another entry point",
      "    rather than a barrel file if callers need a different slice.",
    ].join("\n");
  }
  if (/\.(md|mdx)$/.test(path)) {
    return [
      "This is a document. Split it by topic:",
      "  - Move each large section into its own file next to it.",
      "  - Leave a short summary and a link to each new file behind.",
    ].join("\n");
  }
  if (/\.tsx$/.test(path)) {
    return [
      "This is a component file. Split it by responsibility:",
      "  - One component per file; extract sub-components it renders.",
      "  - Move data fetching or state logic into a hook or module.",
    ].join("\n");
  }
  return [
    "Split it by responsibility:",
    "  - Group functions that change together into their own file.",
    "  - Keep exported names stable so callers only change their imports.",
  ].join("\n");
}

export function formatReport(files: OversizedFile[]): string {
  const sections = files.map(
    (file) =>
      `${file.path}: ~${file.tokens} tokens (limit ${MAX_TOKENS}).\n` +
      splittingAdvice(file.path)
  );
  return [
    `${files.length} staged file(s) exceed the ${MAX_TOKENS}-token budget ` +
      `(estimated as bytes / ${BYTES_PER_TOKEN}).`,
    "",
    ...sections.flatMap((section) => [section, ""]),
    "Split each file, run `npm run check`, stage the new files and commit",
    "again. Do not bypass this hook with --no-verify.",
  ].join("\n");
}

function main(paths: string[]): void {
  const oversized = paths
    .filter((path) => statSync(path).isFile())
    .map((path) => findOversizedFile(path, readFileSync(path)))
    .filter((file): file is OversizedFile => file !== null);

  if (oversized.length === 0) return;

  console.error(formatReport(oversized));
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = process.cwd() + "/";
  main(process.argv.slice(2).map((path) => path.replace(root, "")));
}
