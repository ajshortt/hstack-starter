#!/usr/bin/env node
// Managed by hstack-kit (react adapter). Prints the ESLint rules enabled at error level as a JSON array.
// check-agents-rules.mjs uses it to resolve `lint-react:<rule>` enforcers in AGENTS.md.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sample = ["src/main.tsx", "src/App.tsx", "src/main.ts", "src/index.tsx"].find((f) => existsSync(join(PROJECT_ROOT, f)));
const rules = [];
if (sample) {
  const out = execFileSync(join(PROJECT_ROOT, "node_modules", ".bin", "eslint"), ["--print-config", sample], { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  for (const [rule, setting] of Object.entries(JSON.parse(out).rules ?? {})) {
    const level = Array.isArray(setting) ? setting[0] : setting;
    if (level === 2 || level === "error") rules.push(rule);
  }
}
console.log(JSON.stringify(rules.sort()));
