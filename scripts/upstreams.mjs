#!/usr/bin/env node
// Keeps hstack-kit current with its two upstreams: pstack (vendored, see vendor-pstack.mjs) and mattpocock/skills (copied into shaping/).
//   node scripts/upstreams.mjs check [--root <dir>]                     offline: shaping lock, local copies and MIT notices agree
//   node scripts/upstreams.mjs report [--pstack-ref <ref>] [--matt-ref <ref>] [--only pstack|matt]
//                                                                       what changed upstream since the pins, for review
//   node scripts/upstreams.mjs diff --skill <name> [--ref <ref>]       upstream diff of one Matt skill from our copy to <ref>
//   node scripts/upstreams.mjs record --ref <commit> [--skill <name>]... mark Matt's repo reviewed up to <commit>; refresh the named skills' trees
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PSTACK_LOCK = "vendor/pstack.lock.json";
const SHAPING_LOCK = "shaping/upstream.lock.json";
const NOTICE = "Copyright (c) 2026 Matt Pocock";
const RISKY = /(\.(mjs|cjs|js|ts|sh|py)$|package\.json$|bun\.lock$|hooks\.json$|mcp\.json$|plugin\.json$|\/scripts\/|\/automations\/)/;

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const flags = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));
const readJson = (root, path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const run = (cwd, gitArgs) => execFileSync("git", gitArgs, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();

function check(root) {
  const lock = readJson(root, SHAPING_LOCK);
  const problems = [];
  const license = join(root, lock.license.file);
  if (!existsSync(license) || !readFileSync(license, "utf8").includes(lock.license.copyright)) problems.push(`${lock.license.file} must exist and contain "${lock.license.copyright}".`);
  const locals = new Set(Object.values(lock.skills).map((s) => s.local));
  for (const local of locals) {
    const skill = join(root, local, "SKILL.md");
    if (!existsSync(skill)) {
      problems.push(`${local}/SKILL.md is in ${SHAPING_LOCK} but does not exist.`);
      continue;
    }
    const text = readFileSync(skill, "utf8");
    if (!text.includes(NOTICE) || !text.includes("LICENSE-mattpocock-skills")) problems.push(`${local}/SKILL.md copies or adapts Matt Pocock's text and must keep the notice "${NOTICE}" and point at shaping/LICENSE-mattpocock-skills.`);
  }
  const shaping = join(root, "shaping");
  for (const entry of readdirSync(shaping, { withFileTypes: true })) {
    if (entry.isDirectory() && !locals.has(`shaping/${entry.name}`)) problems.push(`shaping/${entry.name}/ is not recorded in ${SHAPING_LOCK}. Record its upstream source, or move it out of shaping/.`);
  }
  if (!existsSync(join(root, lock.review.checklist))) problems.push(`${lock.review.checklist} (the review checklist) does not exist.`);
  const result = { ok: problems.length === 0, upstreamCommit: lock.upstreamCommit, skills: Object.keys(lock.skills).length, problems };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

function withClone(repo, fn) {
  const scratch = mkdtempSync(join(tmpdir(), "hstack-upstream-"));
  try {
    execFileSync("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", repo, scratch], { stdio: ["ignore", "ignore", "inherit"] });
    return fn(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Directories exactly `depth` levels below `prefix`, as { name: { path, tree } }.
function skillTrees(cwd, commit, prefix, depth) {
  const out = {};
  for (const line of run(cwd, ["ls-tree", "-r", "-t", commit, "--", prefix]).split("\n").filter(Boolean)) {
    const [meta, path] = line.split("\t");
    const [, type, hash] = meta.split(" ");
    if (type === "tree" && path.split("/").length === prefix.split("/").length + depth) out[path.split("/").pop()] = { path, tree: hash };
  }
  return out;
}

function reportPstack(ref) {
  const lock = readJson(KIT_ROOT, PSTACK_LOCK);
  return withClone(lock.upstreamRepo, (cwd) => {
    const commit = run(cwd, ["rev-parse", `${ref}^{commit}`]);
    const version = JSON.parse(run(cwd, ["show", `${commit}:pstack/.cursor-plugin/plugin.json`])).version;
    const before = skillTrees(cwd, lock.upstreamCommit, "pstack/skills", 1);
    const after = skillTrees(cwd, commit, "pstack/skills", 1);
    const changed = run(cwd, ["diff", "--name-only", lock.upstreamCommit, commit, "--", "pstack"]).split("\n").filter(Boolean);
    return {
      pinned: { version: lock.version, commit: lock.upstreamCommit, approvedBy: lock.review?.approvedBy ?? null },
      upstream: { ref, commit, version },
      skillsAdded: Object.keys(after).filter((n) => !before[n]),
      skillsRemoved: Object.keys(before).filter((n) => !after[n]),
      skillsChanged: Object.keys(after).filter((n) => before[n] && before[n].tree !== after[n].tree),
      changedFiles: changed.length,
      riskyFiles: changed.filter((f) => RISKY.test(f)),
      next: version === lock.version ? "Nothing to bump." : `Review per docs/pstack-upgrades.md, then: node scripts/vendor-pstack.mjs bump --ref ${commit}`,
    };
  });
}

function reportMatt(ref) {
  const lock = readJson(KIT_ROOT, SHAPING_LOCK);
  return withClone(lock.upstreamRepo, (cwd) => {
    const commit = run(cwd, ["rev-parse", `${ref}^{commit}`]);
    const reviewed = skillTrees(cwd, lock.upstreamCommit, "skills", 2);
    const now = skillTrees(cwd, commit, "skills", 2);
    const known = new Set([...Object.keys(lock.skills), ...Object.keys(lock.watch ?? {}), ...Object.keys(lock.dropped ?? {})]);
    const followed = { ...lock.skills, ...(lock.watch ?? {}) };
    const tracked = Object.entries(followed).map(([name, s]) => {
      const up = now[name];
      if (!up) return { name, verdict: s.verdict ?? "watch", status: "removed upstream" };
      return {
        name,
        verdict: s.verdict ?? "watch",
        status: up.tree === s.upstreamTree ? "unchanged" : "changed since our copy",
        newSinceReview: reviewed[name]?.tree !== up.tree,
        ...(up.path !== s.upstreamPath ? { movedTo: up.path } : {}),
      };
    });
    return {
      pinned: { reviewedUpTo: lock.upstreamCommit, approvedBy: lock.review?.approvedBy ?? null },
      upstream: { ref, commit },
      tracked,
      newSkills: Object.keys(now).filter((n) => !reviewed[n]).map((n) => now[n].path),
      otherChanged: Object.keys(now).filter((n) => !known.has(n) && reviewed[n] && reviewed[n].tree !== now[n].tree).map((n) => now[n].path),
      next: "Review per docs/upstream-updates.md. Pull approved changes with `diff --skill <name>`, adapt into shaping/, then `record --ref <commit> --skill <name>`.",
    };
  });
}

function diffSkill(name, ref) {
  const lock = readJson(KIT_ROOT, SHAPING_LOCK);
  const skill = lock.skills[name] ?? lock.watch?.[name];
  if (!skill) throw new Error(`${name} is not in ${SHAPING_LOCK} skills or watch.`);
  withClone(lock.upstreamRepo, (cwd) => {
    const commit = run(cwd, ["rev-parse", `${ref}^{commit}`]);
    const path = skillTrees(cwd, commit, "skills", 2)[name]?.path ?? skill.upstreamPath;
    process.stdout.write(`${run(cwd, ["diff", skill.upstreamTree, `${commit}:${path}`])}\n`);
  });
}

function record(ref, names) {
  if (!ref) throw new Error("record needs --ref <upstream commit sha>");
  const lock = readJson(KIT_ROOT, SHAPING_LOCK);
  withClone(lock.upstreamRepo, (cwd) => {
    const commit = run(cwd, ["rev-parse", `${ref}^{commit}`]);
    const now = skillTrees(cwd, commit, "skills", 2);
    for (const name of names) {
      const entry = lock.skills[name] ?? lock.watch?.[name];
      if (!entry || !now[name]) throw new Error(`${name} must be in ${SHAPING_LOCK} and exist upstream at ${commit}.`);
      Object.assign(entry, { upstreamPath: now[name].path, upstreamTree: now[name].tree });
    }
    Object.assign(lock, { upstreamCommit: commit, syncedAt: new Date().toISOString().slice(0, 10) });
    lock.review.approvedBy = null;
  });
  writeFileSync(join(KIT_ROOT, SHAPING_LOCK), `${JSON.stringify(lock, null, 2)}\n`);
  console.log(JSON.stringify({ upstreamCommit: lock.upstreamCommit, refreshed: names, next: "Set review.approvedBy after the owner reviews the PR." }, null, 2));
}

if (command === "check") check(resolve(flag("root") ?? KIT_ROOT));
else if (command === "report") {
  const only = flag("only");
  const out = {};
  if (only !== "matt") out.pstack = reportPstack(flag("pstack-ref") ?? "main");
  if (only !== "pstack") out.mattpocockSkills = reportMatt(flag("matt-ref") ?? "main");
  console.log(JSON.stringify(out, null, 2));
} else if (command === "diff") diffSkill(flag("skill"), flag("ref") ?? "main");
else if (command === "record") record(flag("ref"), flags("skill"));
else {
  console.log("Usage: upstreams.mjs check [--root <dir>] | report [--pstack-ref <ref>] [--matt-ref <ref>] [--only pstack|matt] | diff --skill <name> [--ref <ref>] | record --ref <commit> [--skill <name>]...");
  process.exitCode = 2;
}
