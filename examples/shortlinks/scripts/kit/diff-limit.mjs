#!/usr/bin/env node
// Managed by pstack-kit. Counts changed lines in a PR and warns above the review limit.
// Usage: node scripts/kit/diff-limit.mjs [--base origin/main] [--limit 400] [--fail]
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_EXCLUDE = ["**/package-lock.json", "**/pnpm-lock.yaml", "**/yarn.lock", "**/bun.lock", "**/worker-configuration.d.ts", "**/*.snap", "**/vendor/**"];

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export const renamedPath = (path) => (path.includes("{") ? path.replace(/\{[^}]*? => ([^}]*)\}/, "$1").replace(/\/\//g, "/") : path.replace(/^.* => /, ""));

export function countDiff(numstat, exclude, generated = new Set()) {
  const patterns = exclude.map(globToRegExp);
  const files = [];
  for (const line of numstat.split("\n").filter(Boolean)) {
    const [added, deleted, ...rest] = line.split("\t");
    const path = renamedPath(rest.join("\t"));
    const binary = added === "-";
    const excluded = binary || generated.has(path) || patterns.some((re) => re.test(path));
    files.push({ path, changed: binary ? 0 : Number(added) + Number(deleted), excluded });
  }
  const counted = files.filter((f) => !f.excluded);
  return { total: counted.reduce((sum, f) => sum + f.changed, 0), files, counted };
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    flags[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return flags;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const configPath = join(PROJECT_ROOT, ".pstack-kit", "config.json");
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")).diffLimit ?? {} : {};
  const limit = Number(flags.limit ?? config.lines ?? 400);
  const exclude = [...DEFAULT_EXCLUDE, ...(config.exclude ?? [])];
  const base = flags.base ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main");
  const git = (...args) => execFileSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

  const numstat = git("diff", "--numstat", "-M", `${base}...HEAD`);
  const paths = numstat.split("\n").filter(Boolean).map((l) => renamedPath(l.split("\t").slice(2).join("\t")));
  const generated = new Set();
  if (paths.length) {
    const attrs = execFileSync("git", ["check-attr", "linguist-generated", "--stdin"], { cwd: git("rev-parse", "--show-toplevel").trim(), input: paths.join("\n"), encoding: "utf8" });
    for (const line of attrs.split("\n")) {
      const match = line.match(/^(.*): linguist-generated: (set|true)$/);
      if (match) generated.add(match[1]);
    }
  }
  const { total, counted } = countDiff(numstat, exclude, generated);
  const over = total > limit;
  const top = [...counted].sort((a, b) => b.changed - a.changed).slice(0, 10);
  const message = `${total} changed lines against ${base} (limit ${limit}, generated and lock files excluded).`;

  if (process.env.GITHUB_ACTIONS) {
    console.log(over ? `::warning title=Diff over review limit::${message} Split the PR or explain why in the PR template's Diff size section.` : `::notice title=Diff size::${message}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = top.map((f) => `| \`${f.path}\` | ${f.changed} |`).join("\n");
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Diff size: ${over ? "over" : "within"} limit\n\n${message}\n\n| File | Changed lines |\n|---|---|\n${rows}\n`);
    }
  }
  console.log(JSON.stringify({ ok: !over, total, limit, base, top }, null, 2));
  if (over && flags.fail) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
