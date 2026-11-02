#!/usr/bin/env node
// Pins pstack by vendoring an exact upstream tree into vendor/pstack/ and recording it in vendor/pstack.lock.json.
//   node scripts/vendor-pstack.mjs check [--require-approval]   prove vendor/pstack is byte-identical to the locked upstream tree
//   node scripts/vendor-pstack.mjs bump --ref <commit>     vendor a new upstream commit and print the review report
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(ROOT, "vendor", "pstack.lock.json");
const VENDOR = "vendor/pstack";
const UPSTREAM = "https://github.com/cursor/plugins.git";
const RISKY = /(\.(mjs|cjs|js|ts|sh|py)$|package\.json$|bun\.lock$|hooks\.json$|mcp\.json$|plugin\.json$|\/scripts\/|\/automations\/)/;

const git = (args, opts = {}) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });

function worktreeTreeHash() {
  const index = join(mkdtempSync(join(tmpdir(), "pstack-idx-")), "index");
  const env = { ...process.env, GIT_INDEX_FILE: index };
  git(["read-tree", "--empty"], { env });
  git(["add", "-f", "--", VENDOR], { env });
  const tree = git(["write-tree", `--prefix=${VENDOR}/`], { env }).trim();
  rmSync(dirname(index), { recursive: true, force: true });
  return tree;
}

function check(requireApproval) {
  const lock = JSON.parse(readFileSync(LOCK, "utf8"));
  const problems = [];
  const tree = worktreeTreeHash();
  if (tree !== lock.upstreamTree) problems.push(`vendor/pstack tree ${tree} does not match the locked upstream tree ${lock.upstreamTree}. Someone edited vendored files; re-run bump instead.`);
  const manifest = JSON.parse(readFileSync(join(ROOT, VENDOR, ".cursor-plugin", "plugin.json"), "utf8"));
  if (manifest.version !== lock.version) problems.push(`vendor/pstack manifest says ${manifest.version}, lock says ${lock.version}.`);
  const marketplace = JSON.parse(readFileSync(join(ROOT, ".cursor-plugin", "marketplace.json"), "utf8"));
  const entry = marketplace.plugins.find((p) => p.name === "pstack");
  if (!entry || entry.source !== VENDOR) problems.push(`.cursor-plugin/marketplace.json must list pstack with source "${VENDOR}".`);
  if (entry && entry.version !== lock.version) problems.push(`marketplace.json pins pstack ${entry?.version}, lock says ${lock.version}.`);
  const warnings = [];
  if (!lock.review?.approvedBy) {
    const message = `vendor/pstack.lock.json has no review.approvedBy. ${lock.review?.owner ?? "The pstack owner"} must review per docs/pstack-upgrades.md and record their name before this pin merges.`;
    (requireApproval ? problems : warnings).push(message);
  }
  const result = { ok: problems.length === 0, version: lock.version, upstreamCommit: lock.upstreamCommit, tree, problems, warnings };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

function bump(ref, repo) {
  if (!ref) throw new Error("bump needs --ref <upstream commit sha>");
  const previous = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : null;
  const scratch = mkdtempSync(join(tmpdir(), "pstack-upstream-"));
  try {
    execFileSync("git", ["clone", "--filter=blob:none", "--no-checkout", repo, scratch], { stdio: "inherit" });
    const commit = execFileSync("git", ["rev-parse", `${ref}^{commit}`], { cwd: scratch, encoding: "utf8" }).trim();
    const upstreamTree = execFileSync("git", ["rev-parse", `${commit}:pstack`], { cwd: scratch, encoding: "utf8" }).trim();
    const manifest = JSON.parse(execFileSync("git", ["show", `${commit}:pstack/.cursor-plugin/plugin.json`], { cwd: scratch, encoding: "utf8" }));
    const changed = previous
      ? execFileSync("git", ["diff", "--name-status", `${previous.upstreamCommit}`, commit, "--", "pstack"], { cwd: scratch, encoding: "utf8" }).trim().split("\n").filter(Boolean)
      : [];
    rmSync(join(ROOT, VENDOR), { recursive: true, force: true });
    const archive = execFileSync("git", ["archive", "--format=tar", commit, "pstack"], { cwd: scratch, maxBuffer: 256 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", join(ROOT, "vendor")], { input: archive });
    const lock = {
      name: "pstack",
      version: manifest.version,
      upstreamRepo: repo,
      upstreamPath: "pstack",
      upstreamCommit: commit,
      upstreamTree,
      vendoredAt: new Date().toISOString().slice(0, 10),
      review: { owner: previous?.review?.owner ?? null, approvedBy: null, notes: null, checklist: "docs/pstack-upgrades.md" },
    };
    writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
    const risky = changed.filter((line) => RISKY.test(line));
    console.log(JSON.stringify({ from: previous?.version ?? null, to: manifest.version, commit, upstreamTree, changedFiles: changed.length, riskyFiles: risky, next: "Update .cursor-plugin/marketplace.json version, review per docs/pstack-upgrades.md, then set review.approvedBy." }, null, 2));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const [command, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : rest[i + 1];
};
if (command === "check") check(rest.includes("--require-approval"));
else if (command === "bump") bump(flag("ref"), flag("repo") ?? UPSTREAM);
else {
  console.log("Usage: vendor-pstack.mjs check | bump --ref <commit> [--repo <url>]");
  process.exitCode = 2;
}
