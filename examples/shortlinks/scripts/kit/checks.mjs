#!/usr/bin/env node
// Managed by hstack-kit. Stack-neutral check runner. Any CI system calls this; the GitHub Actions workflow is one thin wrapper.
//   node scripts/kit/checks.mjs list [--event push|pull_request] [--json]
//   node scripts/kit/checks.mjs setup
//   node scripts/kit/checks.mjs run <id>... | --all [--event push|pull_request]
// Checks live in .hstack-kit/checks/*.json (.pstack-kit/checks/ is still read for projects applied before the rename).
// core.json and one file per adapter are managed by the kit.
// local.json is yours: it loads last, so a check there with an existing id replaces it, and "disabled": true removes it.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const fileOrder = (name) => (name === "core.json" ? 0 : name === "local.json" ? 2 : 1);

export function mergeChecks(sources) {
  const byId = new Map();
  const merged = { setup: [], checks: [], diffExclude: [], enforcers: {}, sources: [] };
  for (const { name, spec } of sources) {
    merged.sources.push(name);
    merged.setup.push(...(spec.setup ?? []));
    merged.diffExclude.push(...(spec.diffExclude ?? []));
    Object.assign(merged.enforcers, spec.enforcers ?? {});
    for (const check of spec.checks ?? []) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(check.id ?? "")) throw new Error(`${name}: check id ${JSON.stringify(check.id)} must be lowercase letters, digits and hyphens.`);
      byId.set(check.id, { ...check, source: name });
    }
  }
  merged.checks = [...byId.values()].filter((c) => !c.disabled);
  return merged;
}

export function loadChecks(root = PROJECT_ROOT) {
  // .pstack-kit/checks is the pre-rename location; a file of the same name in .hstack-kit/checks wins.
  const files = new Map();
  for (const dir of [".pstack-kit", ".hstack-kit"].map((d) => join(root, d, "checks")).filter((d) => existsSync(d))) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) files.set(name, join(dir, name));
  }
  const names = [...files.keys()].sort((a, b) => fileOrder(a) - fileOrder(b) || a.localeCompare(b));
  return mergeChecks(names.map((name) => ({ name, spec: JSON.parse(readFileSync(files.get(name), "utf8")) })));
}

export function selectChecks(checks, { event, ids } = {}) {
  if (ids?.length) {
    const unknown = ids.filter((id) => !checks.some((c) => c.id === id));
    if (unknown.length) throw new Error(`Unknown check ${unknown.join(", ")}. Defined: ${checks.map((c) => c.id).join(", ")}.`);
    return checks.filter((c) => ids.includes(c.id));
  }
  return checks.filter((c) => !event || !c.events || c.events.includes(event));
}

const missingRequirement = (check, root) => {
  const required = [check.requires ?? []].flat();
  return required.length && !required.some((p) => existsSync(join(root, p))) ? required.join(" or ") : null;
};

function sh(command, root) {
  return spawnSync("sh", ["-c", command], { cwd: root, stdio: "inherit", env: process.env }).status ?? 1;
}

function group(title, fn) {
  if (process.env.GITHUB_ACTIONS) console.log(`::group::${title}`);
  else console.log(`\n== ${title}`);
  try {
    return fn();
  } finally {
    if (process.env.GITHUB_ACTIONS) console.log("::endgroup::");
  }
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) positional.push(argv[i]);
    else {
      const key = argv[i].slice(2);
      flags[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    }
  }
  return { positional, flags };
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const event = typeof flags.event === "string" ? flags.event : undefined;
  const spec = loadChecks();

  if (command === "list") {
    const selected = selectChecks(spec.checks, { event });
    if (flags.json) console.log(JSON.stringify(selected.map((c) => c.id)));
    else for (const c of selected) console.log(`${c.id.padEnd(16)} ${c.name ?? ""}  [${c.source}]${c.events ? `  (${c.events.join(", ")} only)` : ""}`);
    return;
  }

  if (command === "setup") {
    for (const step of spec.setup) {
      const status = group(`setup: ${step}`, () => sh(step, PROJECT_ROOT));
      if (status !== 0) {
        console.error(`setup failed (${status}): ${step}`);
        process.exitCode = status;
        return;
      }
    }
    if (!spec.setup.length) console.log("No setup steps. Core checks only need Node.");
    return;
  }

  if (command === "run") {
    if (!flags.all && !positional.length) throw new Error("Name checks to run, or pass --all.");
    const selected = selectChecks(spec.checks, { event, ids: flags.all ? [] : positional });
    const results = [];
    for (const check of selected) {
      const missing = missingRequirement(check, PROJECT_ROOT);
      if (missing) {
        console.log(`${process.env.GITHUB_ACTIONS ? "::notice::" : ""}skip ${check.id}: ${missing} does not exist yet.`);
        results.push({ id: check.id, status: "skipped" });
        continue;
      }
      const status = group(`${check.id}: ${check.name ?? check.run}`, () => sh(check.run, PROJECT_ROOT));
      results.push({ id: check.id, status: status === 0 ? "pass" : "fail", exitCode: status });
    }
    console.log("");
    for (const r of results) console.log(`${r.status.padEnd(7)} ${r.id}`);
    if (results.some((r) => r.status === "fail")) process.exitCode = 1;
    return;
  }

  console.log("Usage: checks.mjs list [--event E] [--json] | setup | run <id>... | run --all [--event E]");
  process.exitCode = command ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`checks: ${error.message}`);
    process.exitCode = 2;
  }
}
