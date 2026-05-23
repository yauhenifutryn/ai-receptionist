#!/usr/bin/env node
// env-doctor.mjs — onboarding helper. Reads .env.local and reports any
// required keys (from .env.example) that are missing or blank. Exits non-zero
// when a required key is absent so this can gate `pnpm dev` if desired.
//
// Required-key detection: anything in .env.example that does NOT have an
// inline comment containing `optional` (case-insensitive) on the line(s)
// immediately above it.
//
// Usage: `pnpm env:doctor` (or `node scripts/env-doctor.mjs`).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = join(root, ".env.example");
const localPath = join(root, ".env.local");

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

if (!existsSync(examplePath)) {
  console.error(c.red(".env.example not found"));
  process.exit(2);
}

const exampleLines = readFileSync(examplePath, "utf-8").split("\n");
const local = existsSync(localPath)
  ? Object.fromEntries(
      readFileSync(localPath, "utf-8")
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
        .map((l) => {
          const idx = l.indexOf("=");
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        }),
    )
  : {};

const required = [];
const optional = [];
let commentBuffer = "";
let sectionTag = ""; // last `# === ... ===` header

// Phrases that signal a key is NOT required in a fresh dev setup.
// Keep this list aligned with .env.example wording.
const OPTIONAL_HINTS = [
  /\boptional\b/,
  /\bonly needed\b/,
  /\bw2\+?\b/,
  /\bwave\s*2\b/,
  /\bin production\b/, // e.g. "required in production"
  /\bin dev,?\s*leaving this blank\b/,
  /\bnot yet\b/,
];

for (const raw of exampleLines) {
  const line = raw.trim();
  if (line.startsWith("#")) {
    const stripped = line.slice(1).trim();
    if (/^={2,}/.test(stripped)) {
      sectionTag = stripped.toLowerCase();
    }
    commentBuffer += " " + stripped.toLowerCase();
    continue;
  }
  if (!line || !line.includes("=")) {
    commentBuffer = "";
    continue;
  }
  const key = line.slice(0, line.indexOf("=")).trim();
  const context = `${sectionTag} ${commentBuffer}`;
  const isOptional = OPTIONAL_HINTS.some((re) => re.test(context));
  (isOptional ? optional : required).push(key);
  commentBuffer = "";
}

console.log(c.bold("\nenv-doctor: comparing .env.local against .env.example"));
console.log(`  example: ${examplePath}`);
console.log(`  local:   ${existsSync(localPath) ? localPath : c.yellow("(missing)")}`);
console.log();

const missingRequired = required.filter((k) => !local[k]);
const missingOptional = optional.filter((k) => !local[k]);

for (const k of required) {
  if (local[k]) console.log(c.green(`  OK    ${k}`));
}
for (const k of missingRequired) {
  console.log(c.red(`  MISS  ${k}  (required)`));
}
for (const k of missingOptional) {
  console.log(c.yellow(`  --    ${k}  (optional, unset)`));
}

console.log();
if (missingRequired.length > 0) {
  console.log(c.red(`env-doctor: ${missingRequired.length} required key(s) missing`));
  process.exit(1);
}
console.log(c.green("env-doctor: all required keys present"));
process.exit(0);
