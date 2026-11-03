#!/usr/bin/env node
// Managed by hstack-kit. Validates plan files in docs/plans/ against the lifecycle in docs/plans/README.md.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED = ["title", "status", "owner", "linear", "created", "updated"];
const STATUS_DIR = { proposed: "active", active: "active", landed: "done", abandoned: "done" };
const STALE_DAYS = 21;

export function parseFrontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([A-Za-z_]+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, "").trim()]),
  );
}

const section = (text, heading) => {
  const start = text.search(new RegExp(`^## ${heading}\\s*$`, "m"));
  if (start === -1) return null;
  const rest = text.slice(start).split("\n").slice(1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
};

export function checkPlan(name, dir, text, today = new Date()) {
  const errors = [];
  const warnings = [];
  const fm = parseFrontMatter(text);
  if (!fm) return { errors: [`${name}: missing front matter. Copy docs/plans/_template.md.`], warnings };
  for (const key of REQUIRED) if (!fm[key] || fm[key].startsWith("<")) errors.push(`${name}: front matter \`${key}\` is missing or still a placeholder.`);
  const expectedDir = STATUS_DIR[fm.status];
  if (!expectedDir) errors.push(`${name}: status \`${fm.status}\` is not one of ${Object.keys(STATUS_DIR).join(", ")}.`);
  else if (expectedDir !== dir) errors.push(`${name}: status \`${fm.status}\` belongs in docs/plans/${expectedDir}/, not ${dir}/.`);

  const tasks = section(text, "Tasks");
  const boxes = (tasks ?? "").split("\n").filter((l) => /^\s*- \[[ xX]\]/.test(l));
  if (boxes.length === 0) errors.push(`${name}: \`## Tasks\` has no checkbox tasks.`);
  for (const box of boxes) {
    if (!/Proof:\s*\S/.test(box) || /Proof:\s*</.test(box)) errors.push(`${name}: task "${box.trim().slice(0, 60)}" does not name its proof (\`Proof: ...\`).`);
    if (/^\s*- \[[xX]\]/.test(box) && !/PR:\s*(https?:\/\/|#\d+)/.test(box)) errors.push(`${name}: ticked task "${box.trim().slice(0, 60)}" does not link its PR (\`PR: <url>\`).`);
  }
  if (dir === "done") {
    const outcome = section(text, "Outcome");
    if (!outcome || outcome.startsWith("<")) errors.push(`${name}: a plan in done/ needs a filled \`## Outcome\`.`);
  }
  if (fm.status === "active" && /^\d{4}-\d{2}-\d{2}$/.test(fm.updated ?? "")) {
    const age = (today - new Date(`${fm.updated}T00:00:00Z`)) / 86400000;
    if (age > STALE_DAYS) warnings.push(`${name}: active but not updated for ${Math.floor(age)} days. Update it or move it to done/ as abandoned.`);
  }
  return { errors, warnings };
}

function main() {
  const root = join(PROJECT_ROOT, "docs", "plans");
  let errors = [];
  let warnings = [];
  let count = 0;
  for (const dir of ["active", "done"]) {
    const full = join(root, dir);
    for (const file of existsSync(full) ? readdirSync(full).filter((f) => f.endsWith(".md")) : []) {
      count++;
      const result = checkPlan(`docs/plans/${dir}/${file}`, dir, readFileSync(join(full, file), "utf8"));
      errors = errors.concat(result.errors);
      warnings = warnings.concat(result.warnings);
    }
  }
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  console.log(`${count} plans checked, ${errors.length} errors, ${warnings.length} warnings.`);
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
