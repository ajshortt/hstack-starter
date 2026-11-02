#!/usr/bin/env node
// Managed by pstack-kit. Fails when a row in AGENTS.md's rule table does not name a real enforcer.
// Enforcer tokens (in backticks): a repo path, `ci:<job>`, `lint:<rule>`, `hook:<rule-id>`, or `docs-only` (allowed, warned).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function parseRuleTable(markdown) {
  const lines = markdown.split("\n");
  const header = lines.findIndex((l) => /^\|\s*Rule\s*\|.*Enforced by\s*\|/i.test(l));
  if (header === -1) return null;
  const cols = lines[header].split("|").map((c) => c.trim().toLowerCase());
  const enforcerCol = cols.findIndex((c) => c === "enforced by");
  const rows = [];
  for (let i = header + 2; i < lines.length && lines[i].startsWith("|"); i++) {
    const cells = lines[i].split("|").map((c) => c.trim());
    rows.push({ line: i + 1, rule: cells[1], enforcer: cells[enforcerCol] ?? "" });
  }
  return rows;
}

export function checkRows(rows, { pathExists, ciJobs, lintRules, hookRules }) {
  const errors = [];
  const warnings = [];
  for (const row of rows) {
    const tokens = [...row.enforcer.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    if (tokens.length === 0) {
      errors.push(`AGENTS.md:${row.line} "${row.rule}" names no enforcer. Put a path, \`ci:<job>\`, \`lint:<rule>\`, \`hook:<id>\` or \`docs-only\` in backticks.`);
      continue;
    }
    for (const token of tokens) {
      if (token === "docs-only") warnings.push(`AGENTS.md:${row.line} "${row.rule}" is docs-only. Nothing fails when an agent skips it; run /correct if it repeats.`);
      else if (token.startsWith("ci:")) {
        if (!ciJobs.has(token.slice(3))) errors.push(`AGENTS.md:${row.line} \`${token}\` is not a job in .github/workflows. Jobs: ${[...ciJobs].join(", ") || "none"}.`);
      } else if (token.startsWith("lint:")) {
        if (!lintRules(token.slice(5))) errors.push(`AGENTS.md:${row.line} \`${token}\` is not configured in eslint.config.js or eslint.workers.js.`);
      } else if (token.startsWith("hook:")) {
        if (!hookRules.has(token.slice(5))) errors.push(`AGENTS.md:${row.line} \`${token}\` is not a rule id in .cursor/hooks/pstack-kit-guard.mjs.`);
      } else if (!pathExists(token.replace(/[#:].*$/, ""))) {
        errors.push(`AGENTS.md:${row.line} \`${token}\` does not exist. Fix the path or name a different enforcer.`);
      }
    }
  }
  return { errors, warnings };
}

let lintCache;
function enabledLintRules() {
  if (lintCache) return lintCache;
  lintCache = new Set();
  const sample = ["src/index.ts", "src/worker.ts", "src/main.ts"].find((f) => existsSync(join(PROJECT_ROOT, f)));
  if (!sample) return lintCache;
  try {
    const eslint = join(PROJECT_ROOT, "node_modules", ".bin", "eslint");
    const out = execFileSync(eslint, ["--print-config", sample], { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    for (const [rule, setting] of Object.entries(JSON.parse(out).rules ?? {})) {
      const level = Array.isArray(setting) ? setting[0] : setting;
      if (level === 2 || level === "error") lintCache.add(rule);
    }
  } catch (error) {
    console.error(`Could not resolve ESLint config for ${sample}: ${error.message.split("\n")[0]}`);
  }
  return lintCache;
}

function main() {
  const agentsPath = join(PROJECT_ROOT, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    console.log("No AGENTS.md yet; nothing to check.");
    return;
  }
  const rows = parseRuleTable(readFileSync(agentsPath, "utf8"));
  if (!rows) {
    console.error("AGENTS.md has no rule table. Add a table with `| Rule | Enforced by |` columns (see the pstack-kit template).");
    process.exitCode = 1;
    return;
  }
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  const workflowsDir = join(gitRoot, ".github", "workflows");
  const ciJobs = new Set();
  for (const file of existsSync(workflowsDir) ? readdirSync(workflowsDir) : []) {
    const text = readFileSync(join(workflowsDir, file), "utf8");
    const jobsAt = text.search(/^jobs:\s*$/m);
    if (jobsAt === -1) continue;
    for (const m of text.slice(jobsAt).matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)) ciJobs.add(m[1]);
  }
  const guardPath = join(gitRoot, ".cursor", "hooks", "pstack-kit-guard.mjs");
  const hookRules = new Set(existsSync(guardPath) ? [...readFileSync(guardPath, "utf8").matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1]) : []);
  const { errors, warnings } = checkRows(rows, {
    pathExists: (p) => existsSync(join(PROJECT_ROOT, p)) || existsSync(join(gitRoot, p)),
    ciJobs,
    lintRules: (name) => enabledLintRules().has(name),
    hookRules,
  });
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  console.log(`${rows.length} rules checked, ${errors.length} errors, ${warnings.length} docs-only.`);
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
