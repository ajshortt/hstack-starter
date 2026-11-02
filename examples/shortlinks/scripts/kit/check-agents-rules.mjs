#!/usr/bin/env node
// Managed by pstack-kit. Fails when a row in AGENTS.md's rule table does not name a real enforcer.
// Enforcer tokens (in backticks): a repo path, `ci:<check-id>` (from .pstack-kit/checks), `hook:<rule-id>` (the guard),
// `docs-only` (allowed, warned), or `<kind>:<name>` for a kind an adapter provides under "enforcers" (for example `lint:`).
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChecks } from "./checks.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const KIND = /^([a-z][a-z0-9-]*):(?!\/)(.+)$/;

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

export function checkRows(rows, { pathExists, ciChecks, hookRules, enforcers = {} }) {
  const errors = [];
  const warnings = [];
  for (const row of rows) {
    const tokens = [...row.enforcer.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    if (tokens.length === 0) {
      errors.push(`AGENTS.md:${row.line} "${row.rule}" names no enforcer. Put a path, \`ci:<check>\`, \`hook:<id>\`, an adapter enforcer such as \`lint:<rule>\`, or \`docs-only\` in backticks.`);
      continue;
    }
    for (const token of tokens) {
      const kind = token.match(KIND);
      if (token === "docs-only") warnings.push(`AGENTS.md:${row.line} "${row.rule}" is docs-only. Nothing fails when an agent skips it; run /correct if it repeats.`);
      else if (kind?.[1] === "ci") {
        if (!ciChecks.has(kind[2])) errors.push(`AGENTS.md:${row.line} \`${token}\` is not a check in .pstack-kit/checks. Checks: ${[...ciChecks].join(", ") || "none"}.`);
      } else if (kind?.[1] === "hook") {
        if (!hookRules.has(kind[2])) errors.push(`AGENTS.md:${row.line} \`${token}\` is not a rule id in the guard (.cursor/hooks/pstack-kit-guard.mjs and its rules/ packs).`);
      } else if (kind && enforcers[kind[1]]) {
        if (!enforcers[kind[1]].has(kind[2])) errors.push(`AGENTS.md:${row.line} \`${token}\` is not ${enforcers[kind[1]].describe ?? `a known ${kind[1]} enforcer`}.`);
      } else if (kind && !pathExists(token.replace(/[#:].*$/, ""))) {
        errors.push(`AGENTS.md:${row.line} \`${token}\`: no adapter provides \`${kind[1]}:\` enforcers. Kinds available: ci, hook${Object.keys(enforcers).length ? `, ${Object.keys(enforcers).join(", ")}` : ""}.`);
      } else if (!kind && !pathExists(token.replace(/#.*$/, ""))) {
        errors.push(`AGENTS.md:${row.line} \`${token}\` does not exist. Fix the path or name a different enforcer.`);
      }
    }
  }
  return { errors, warnings };
}

function guardRuleIds(gitRoot) {
  const hooksDir = join(gitRoot, ".cursor", "hooks");
  const packDir = join(hooksDir, "pstack-kit-guard.rules");
  const files = [join(hooksDir, "pstack-kit-guard.mjs"), ...(existsSync(packDir) ? readdirSync(packDir).filter((f) => f.endsWith(".mjs")).map((f) => join(packDir, f)) : [])];
  return new Set(files.filter(existsSync).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1])));
}

function adapterEnforcers(spec) {
  const out = {};
  for (const [kind, { list, describe }] of Object.entries(spec.enforcers ?? {})) {
    let names = [];
    try {
      names = JSON.parse(execSync(list, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }));
    } catch (error) {
      console.error(`Could not list \`${kind}:\` enforcers with \`${list}\`: ${String(error.message).split("\n")[0]}`);
    }
    out[kind] = Object.assign(new Set(names), { describe });
  }
  return out;
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
  const spec = loadChecks(PROJECT_ROOT);
  const { errors, warnings } = checkRows(rows, {
    pathExists: (p) => existsSync(join(PROJECT_ROOT, p)) || existsSync(join(gitRoot, p)),
    ciChecks: new Set(spec.checks.map((c) => c.id)),
    hookRules: guardRuleIds(gitRoot),
    enforcers: adapterEnforcers(spec),
  });
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  console.log(`${rows.length} rules checked, ${errors.length} errors, ${warnings.length} docs-only.`);
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
