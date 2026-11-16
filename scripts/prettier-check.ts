import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";

// The pre-commit hook must finish in under three seconds. Prettier checks
// files on one core, so a large commit is split across several processes.
// Small commits stay in one process: each extra process costs ~0.3s to start.
const MIN_FILES_PER_PROCESS = 40;
const MAX_PROCESSES = 4;

export function chunk<T>(items: T[]): T[][] {
  const processCount = Math.max(
    1,
    Math.min(
      MAX_PROCESSES,
      availableParallelism(),
      Math.floor(items.length / MIN_FILES_PER_PROCESS)
    )
  );
  const size = Math.ceil(items.length / processCount);
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

function checkChunk(files: string[], index: number): Promise<number> {
  // Each process gets its own cache file so concurrent writes cannot clash.
  const args = [
    "--check",
    "--ignore-unknown",
    "--cache",
    "--cache-location",
    `node_modules/.cache/prettier/pre-commit-${index}.json`,
    ...files,
  ];
  return new Promise((resolve) => {
    const child = spawn("node_modules/.bin/prettier", args, {
      stdio: "inherit",
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function main(files: string[]): Promise<void> {
  if (files.length === 0) return;
  const codes = await Promise.all(chunk(files).map(checkChunk));
  if (codes.some((code) => code !== 0)) {
    console.error("Run `npm run format`, stage the result and commit again.");
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2));
}
