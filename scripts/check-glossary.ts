// Fails when code uses a term GLOSSARY.md lists under `_Avoid_`.
//
// Every `_Avoid_` term is checked unless it carries a qualifier in brackets
// ("Admin (on its own)"), which needs judgement, or it is in IGNORED below.
// A new `_Avoid_` term is therefore enforced by default.

import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// Everyday words, and names the code already uses for something else.
const IGNORED = new Set(
  [
    "User", // `users` table, `UserRole`
    "Author", // the author of a comment
    "the team",
    "Staff",
    "Access", // content access, `requireContentAccess`
    "Viewed",
    "Progress", // `lesson_progress`
    "Thread",
    "Answer", // quiz answers
    "Order", // sort order
    "Transaction", // `db.transaction`
    "Coupon", // `coupons` table
    "Code",
    "Pending",
    "Requested",
    "Completed",
    "Alert",
    "Message",
    "Activity",
    "New",
    "Inbox", // an email inbox
    "Chargeback", // kept free for modelling real card disputes
  ].map((t) => t.toLowerCase())
);

const ROOTS = ["app", "scripts"];
const SELF = path.normalize("scripts/check-glossary.ts");

function avoidedTerms(glossary: string): string[] {
  return glossary
    .split("\n")
    .filter((line) => line.startsWith("_Avoid_:"))
    // A qualifier can hold commas of its own, so collapse it before splitting.
    .map((line) => line.replace("_Avoid_:", "").replace(/\([^)]*\)/g, "()"))
    .flatMap((line) => line.split(","))
    .map((term) => term.trim())
    .filter((term) => term && !term.includes("("))
    .filter((term) => !IGNORED.has(term.toLowerCase()));
}

// "getNotesForLearner" and "watch_cap" both become plain words, so one
// pattern catches identifiers, comments and UI strings alike.
function toWords(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .toLowerCase();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const terms = avoidedTerms(readFileSync("GLOSSARY.md", "utf8"));
const patterns = terms.map((term) => ({
  term,
  regex: new RegExp(`\\b${toWords(term).replace(/\s+/g, "\\s+")}s?\\b`),
}));

const hits: string[] = [];
for (const file of ROOTS.flatMap(sourceFiles)) {
  if (path.normalize(file) === SELF) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const words = toWords(line);
      for (const { term, regex } of patterns) {
        if (regex.test(words)) hits.push(`${file}:${i + 1}  "${term}"`);
      }
    });
}

if (hits.length > 0) {
  console.error("GLOSSARY.md says to avoid these terms:\n");
  console.error(hits.join("\n"));
  console.error(
    "\nUse the glossary's term instead. If the word means something else here, add it to IGNORED in scripts/check-glossary.ts."
  );
  process.exit(1);
}
console.log(`Glossary check: ${terms.length} avoided terms, no hits.`);
