#!/usr/bin/env node
import { KitError, kitInfo, pendingActions, plan, write } from "../lib/kit.mjs";

const HELP = `pstack-kit: apply and update the team's pstack starter kit in a Cloudflare Workers project.

Usage:
  pstack-kit apply  --target <dir> [--name <worker>] [--phase 0|1|2] [--owners "@org/team"] [--write]
  pstack-kit status --target <dir>          exit 1 when the project is behind the kit or has conflicts
  pstack-kit version

apply is a dry run unless you pass --write. It is safe to re-run: it creates missing files,
updates kit-managed files you have not edited, never touches seeded files you own, and stages
the kit's version of files you edited under .pstack-kit/incoming/ for you to merge.

Resolve a conflict with one of:
  --accept-local <path>   keep your version as the baseline for this kit version
  --take-kit <path>       overwrite your version with the kit's
Add --json for machine-readable output.`;

const LABELS = {
  create: "create",
  update: "update",
  merge: "merge",
  unchanged: "ok",
  "keep-local": "keep (local edit)",
  "accept-local": "accept local",
  conflict: "CONFLICT",
  "seed-exists": "ok (yours)",
  "deleted-locally": "skip (deleted locally)",
  orphan: "orphan",
};

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) throw new KitError(`Unexpected argument ${rest[i]}.`);
    const key = rest[i].slice(2);
    const value = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
    flags[key] = key in flags ? [flags[key], value].flat() : value;
  }
  return { command, flags };
}

function report(result, { json, wrote }) {
  const pending = pendingActions(result);
  if (json) {
    console.log(JSON.stringify({ target: result.target, config: result.config, wrote, pending: pending.length, actions: result.actions.map(({ content, abs, ...a }) => a) }, null, 2));
    return;
  }
  const kit = kitInfo();
  console.log(`pstack-kit ${kit.version} (pstack ${kit.pstackVersion}) -> ${result.target}`);
  console.log(`project ${result.config.projectName}, phase ${result.config.phase}${result.isNew ? " (new adoption)" : ""}\n`);
  const width = Math.max(...Object.values(LABELS).map((l) => l.length));
  for (const a of result.actions) {
    if (a.kind === "unchanged" || a.kind === "seed-exists") continue;
    console.log(`  ${LABELS[a.kind].padEnd(width)}  ${a.path}${a.detail ? `  (${a.detail})` : ""}${a.staged ? `\n  ${"".padEnd(width)}  kit version staged at ${a.staged}` : ""}`);
  }
  const quiet = result.actions.filter((a) => a.kind === "unchanged" || a.kind === "seed-exists").length;
  console.log(`  ${"ok".padEnd(width)}  ${quiet} files already match or are yours\n`);
  if (!wrote) console.log(pending.length ? `Dry run. ${pending.length} pending. Re-run with --write to apply.` : "Up to date.");
  else console.log(`Applied. Review with \`git status\`, then commit${pending.some((a) => a.kind === "conflict") ? " after merging the staged files" : ""}.`);
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "version") return console.log(JSON.stringify(kitInfo()));
  if (command !== "apply" && command !== "status") return console.log(HELP);
  if (!flags.target) throw new KitError("--target <dir> is required.");
  const result = plan(String(flags.target), flags);
  const wrote = command === "apply" && flags.write === true;
  if (wrote) write(result);
  report(result, { json: flags.json === true, wrote });
  if (command === "status" && pendingActions(result).length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  if (!(error instanceof KitError)) throw error;
  console.error(`pstack-kit: ${error.message}`);
  process.exitCode = 2;
}
