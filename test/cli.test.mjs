import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { KitError, guessName, pendingActions, plan, render, sha256, slugify, write } from "../lib/kit.mjs";

function repo({ nested = false, files = { "package.json": JSON.stringify({ name: "@acme/api-worker" }) } } = {}) {
  const root = mkdtempSync(join(tmpdir(), "kit-test-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const target = nested ? join(root, "services", "api") : root;
  mkdirSync(target, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(target, name), content);
  return { root, target };
}

const kinds = (result) => Object.fromEntries(result.actions.map((a) => [a.path, a.kind]));
const apply = (target, flags = {}) => write(plan(target, flags));
const read = (...p) => readFileSync(join(...p), "utf8");

test("render substitutes variables, keeps GitHub expressions, honours escapes and rejects unknown names", () => {
  assert.equal(render("a {{x}} ${{ github.ref }} {{!y}}", { x: 1 }, "t"), "a 1 ${{ github.ref }} {{y}}");
  assert.throws(() => render("{{nope}}", {}, "t"), KitError);
});

test("project names come from package.json, pyproject.toml, Cargo.toml or the directory", () => {
  assert.equal(slugify("@acme/Api_Worker"), "api-worker");
  assert.equal(guessName(repo().target), "api-worker");
  assert.equal(guessName(repo({ files: { "pyproject.toml": '[build-system]\nname = "nope"\n[project]\nname = "billing_service"\n' } }).target), "billing-service");
  assert.equal(guessName(repo({ files: { "Cargo.toml": '[package]\nname = "edge-proxy"\n' } }).target), "edge-proxy");
  const plain = repo({ files: {} });
  assert.match(guessName(plain.target), /^kit-test-[a-z0-9]+$/);
});

test("core-only is the default: no stack files, a thin workflow, and a re-run is a no-op", () => {
  const { target } = repo();
  const first = apply(target);
  assert.deepEqual(first.config.adapters, []);
  assert.ok(first.actions.every((a) => a.kind === "create"), JSON.stringify(kinds(first)));
  for (const path of [".cursor/rules/workers.mdc", "eslint.workers.js", "tsconfig.kit.json", ".cursor/hooks/hstack-kit-guard.rules", ".hstack-kit/checks/workers.json"]) {
    assert.ok(!existsSync(join(target, path)), `${path} is adapter-only`);
  }
  assert.ok(existsSync(join(target, ".cursor/skills/verify-api-worker/control.mjs")));
  assert.ok(!existsSync(join(target, ".cursor/skills/verify-api-worker/driver.mjs")));
  const workflow = read(target, ".github/workflows/hstack-kit.yml");
  assert.match(workflow, /working-directory: \.\n/);
  assert.match(workflow, /node scripts\/kit\/checks.mjs run \$\{\{ matrix.check \}\}/);
  assert.doesNotMatch(workflow, /npm|wrangler|vitest/);
  assert.doesNotMatch(read(target, ".gitignore"), /node_modules|wrangler/);
  assert.doesNotMatch(read(target, "AGENTS.md"), /\{\{|Worker|wrangler/);
  assert.equal(JSON.parse(read(target, ".cursor/environment.json")).install, "node scripts/kit/checks.mjs setup");
  const again = plan(target);
  assert.equal(pendingActions(again).length, 0, JSON.stringify(kinds(again)));
});

test("--adapter workers adds the stack layer, overrides the skill seeds and merges .gitignore", () => {
  const { target } = repo();
  const result = apply(target, { adapter: "workers" });
  assert.deepEqual(result.config.adapters, ["workers"]);
  for (const path of [".cursor/rules/workers.mdc", ".cursor/rules/autonomy-workers.mdc", "eslint.workers.js", ".cursor/hooks/hstack-kit-guard.rules/workers.mjs", ".hstack-kit/checks/workers.json", ".cursor/skills/verify-api-worker/driver.mjs"]) {
    assert.ok(existsSync(join(target, path)), path);
  }
  assert.equal(JSON.parse(read(target, ".cursor/skills/verify-api-worker/verify.config.json")).driver, "driver.mjs");
  const gitignore = read(target, ".gitignore");
  for (const line of [".verify/", ".hstack-kit/incoming/", "node_modules/", ".wrangler/", ".dev.vars"]) assert.ok(gitignore.split("\n").includes(line), line);
  const agents = read(target, "AGENTS.md");
  assert.match(agents, /is a Cloudflare Worker/);
  assert.match(agents, /`lint:no-restricted-globals`/);
  assert.match(agents, /autonomy-workers\.mdc/);
  assert.doesNotMatch(agents, /\{\{/);
  assert.equal(JSON.parse(read(target, ".hstack-kit/lock.json")).adapters[0], "workers");
  assert.equal(pendingActions(plan(target)).length, 0, JSON.stringify(kinds(plan(target))));
});

test("adapters are remembered and never dropped silently", () => {
  const { target } = repo();
  apply(target, { adapter: "workers" });
  assert.deepEqual(plan(target).config.adapters, ["workers"]);
  assert.throws(() => plan(target, { adapter: "none" }), /already applied and the kit never removes one/);
  assert.throws(() => plan(target, { adapter: "rails" }), /Unknown adapter "rails"\. Available: workers/);
  assert.throws(() => plan(target, { adapter: "none,workers" }), /cannot be combined/);
  const core = repo().target;
  apply(core);
  assert.deepEqual(plan(core, { adapter: "workers" }).config.adapters, ["workers"]);
});

test("a 0.1 project must choose an adapter explicitly", () => {
  const { target } = repo();
  mkdirSync(join(target, ".hstack-kit"));
  writeFileSync(join(target, ".hstack-kit/config.json"), JSON.stringify({ projectName: "api-worker", phase: 2, owners: "@a/b", nodeVersion: "22", diffLimit: { lines: 400, exclude: [] } }));
  assert.throws(() => plan(target), /adopted with pstack-kit 0\.1.*--adapter workers.*--adapter none/s);
  assert.deepEqual(plan(target, { adapter: "workers" }).config.adapters, ["workers"]);
  assert.deepEqual(plan(target, { adapter: "none" }).config.adapters, []);
});

test("a project applied before the rename keeps its settings and lock, and moves them to .hstack-kit", () => {
  const { target } = repo();
  apply(target, { adapter: "workers", owners: "@a/b" });
  mkdirSync(join(target, ".pstack-kit"));
  for (const name of ["config.json", "lock.json"]) renameSync(join(target, ".hstack-kit", name), join(target, ".pstack-kit", name));
  const lock = JSON.parse(read(target, ".pstack-kit/lock.json"));
  lock.files[".cursor/hooks/pstack-kit-guard.mjs"] = { mode: "managed", hash: "old" };
  writeFileSync(join(target, ".pstack-kit/lock.json"), JSON.stringify(lock));
  writeFileSync(join(target, ".cursor/hooks/pstack-kit-guard.mjs"), "old guard\n");
  const result = plan(target);
  assert.deepEqual([result.config.adapters, result.config.owners], [["workers"], "@a/b"]);
  assert.equal(kinds(result)[".cursor/hooks/pstack-kit-guard.mjs"], "orphan");
  write(result);
  assert.equal(JSON.parse(read(target, ".hstack-kit/config.json")).owners, "@a/b");
  assert.ok(JSON.parse(read(target, ".hstack-kit/lock.json")).files[".cursor/hooks/pstack-kit-guard.mjs"]);
});

test("phase 0 writes only the safety files, and phases only go up", () => {
  const { target } = repo();
  const result = apply(target, { phase: "0", adapter: "workers" });
  assert.deepEqual(result.actions.map((a) => a.path).sort(), [
    ".cursor/hooks.json",
    ".cursor/hooks/hstack-kit-guard.mjs",
    ".cursor/hooks/hstack-kit-guard.rules/workers.mjs",
    ".cursor/rules/autonomy-workers.mdc",
    ".cursor/rules/autonomy.mdc",
    ".cursor/rules/pstack-models.mdc",
    ".cursor/settings.json",
    ".gitignore",
  ]);
  assert.throws(() => plan(target, { phase: "-1" }), KitError);
  apply(target, { phase: "1" });
  assert.throws(() => plan(target, { phase: "0" }), /lower than the applied phase/);
});

test("kit changes update unedited managed files", () => {
  const { target } = repo();
  apply(target);
  const file = join(target, ".cursor/rules/autonomy.mdc");
  const lockFile = join(target, ".hstack-kit/lock.json");
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  writeFileSync(file, "old kit version\n");
  lock.files[".cursor/rules/autonomy.mdc"].hash = sha256("old kit version\n");
  writeFileSync(lockFile, JSON.stringify(lock));
  assert.equal(kinds(plan(target))[".cursor/rules/autonomy.mdc"], "update");
  apply(target);
  assert.match(readFileSync(file, "utf8"), /Autonomy policy/);
});

test("local edits survive: kept when the kit is unchanged, staged when both changed", () => {
  const { target } = repo();
  apply(target);
  const rel = ".cursor/rules/pstack-models.mdc";
  const file = join(target, rel);
  writeFileSync(file, `${readFileSync(file, "utf8")}\nlocal rule\n`);
  assert.equal(kinds(plan(target))[rel], "keep-local");

  const lockFile = join(target, ".hstack-kit/lock.json");
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  lock.files[rel].hash = sha256("an older kit version");
  writeFileSync(lockFile, JSON.stringify(lock));
  const result = apply(target);
  assert.equal(kinds(result)[rel], "conflict");
  assert.match(readFileSync(file, "utf8"), /local rule/);
  assert.ok(existsSync(join(target, ".hstack-kit/incoming", rel)));

  apply(target, { "accept-local": rel });
  assert.equal(kinds(plan(target))[rel], "keep-local");
  apply(target, { "take-kit": rel });
  assert.doesNotMatch(readFileSync(file, "utf8"), /local rule/);
  assert.equal(pendingActions(plan(target)).length, 0);
});

test("pre-existing files are never overwritten on first adoption", () => {
  const { target } = repo();
  mkdirSync(join(target, ".cursor/rules"), { recursive: true });
  writeFileSync(join(target, ".cursor/rules/autonomy.mdc"), "ours\n");
  writeFileSync(join(target, "AGENTS.md"), "# ours\n");
  writeFileSync(join(target, ".gitignore"), "dist/\nnode_modules/\n");
  writeFileSync(join(target, ".cursor/settings.json"), JSON.stringify({ editor: { tabSize: 2 }, plugins: { other: { enabled: true } } }));
  const result = apply(target, { adapter: "workers" });
  const k = kinds(result);
  assert.equal(k[".cursor/rules/autonomy.mdc"], "conflict");
  assert.equal(k["AGENTS.md"], "seed-exists");
  assert.equal(k[".gitignore"], "merge");
  assert.equal(k[".cursor/settings.json"], "merge");
  assert.equal(read(target, ".cursor/rules/autonomy.mdc"), "ours\n");
  assert.equal(read(target, "AGENTS.md"), "# ours\n");
  const gitignore = read(target, ".gitignore");
  assert.equal(gitignore.match(/node_modules\//g).length, 1);
  assert.match(gitignore, /\.verify\//);
  const settings = JSON.parse(read(target, ".cursor/settings.json"));
  assert.deepEqual(settings, { editor: { tabSize: 2 }, plugins: { other: { enabled: true }, pstack: { enabled: true } } });
});

test("a user's explicit setting wins over the kit's json-merge", () => {
  const { target } = repo();
  mkdirSync(join(target, ".cursor"), { recursive: true });
  writeFileSync(join(target, ".cursor/settings.json"), JSON.stringify({ plugins: { pstack: { enabled: false } } }));
  assert.equal(kinds(plan(target))[".cursor/settings.json"], "unchanged");
});

test("deleted seed and managed files are not recreated silently", () => {
  const { target } = repo();
  apply(target, { adapter: "workers" });
  execFileSync("rm", [join(target, "AGENTS.md"), join(target, ".cursor/rules/workers.mdc")]);
  const k = kinds(plan(target));
  assert.equal(k["AGENTS.md"], "deleted-locally");
  assert.equal(k[".cursor/rules/workers.mdc"], "deleted-locally");
  apply(target, { "take-kit": ".cursor/rules/workers.mdc" });
  assert.ok(existsSync(join(target, ".cursor/rules/workers.mdc")));
});

test("files the kit stopped shipping are reported as orphans", () => {
  const { target } = repo();
  apply(target);
  const lockFile = join(target, ".hstack-kit/lock.json");
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  lock.files[".github/workflows/worker-ci.yml"] = { mode: "managed", hash: "x" };
  writeFileSync(lockFile, JSON.stringify(lock));
  writeFileSync(join(target, ".github/workflows/worker-ci.yml"), "old\n");
  assert.equal(kinds(plan(target))[".github/workflows/worker-ci.yml"], "orphan");
  execFileSync("rm", [join(target, ".github/workflows/worker-ci.yml")]);
  assert.equal(kinds(plan(target))[".github/workflows/worker-ci.yml"], "forget");
  apply(target);
  assert.equal(JSON.parse(read(target, ".hstack-kit/lock.json")).files[".github/workflows/worker-ci.yml"], undefined);
  assert.equal(pendingActions(plan(target)).length, 0);
});

test("nested projects put shared files at the git root with a scoped workflow", () => {
  const { root, target } = repo({ nested: true });
  apply(target, { owners: "@acme/api" });
  const workflow = read(root, ".github/workflows/hstack-kit-api-worker.yml");
  assert.match(workflow, /working-directory: services\/api\n/);
  assert.match(workflow, /paths: \["services\/api\/\*\*"/);
  assert.match(workflow, /path: services\/api\/\.verify\/evidence\//);
  assert.ok(existsSync(join(root, ".cursor/hooks.json")));
  assert.ok(existsSync(join(target, ".cursor/skills/verify-api-worker/SKILL.md")));
  assert.match(read(root, ".github/CODEOWNERS"), /\/services\/api\/AGENTS.md @acme\/api/);
  assert.equal(JSON.parse(read(root, ".cursor/environment.json")).install, "cd services/api && node scripts/kit/checks.mjs setup");
});

test("the CLI is a dry run by default, status exits 1 when behind, and adapter warnings print", () => {
  const { target } = repo({ files: {} });
  const bin = new URL("../bin/hstack-kit.mjs", import.meta.url).pathname;
  const dry = execFileSync("node", [bin, "apply", "--target", target], { encoding: "utf8" });
  assert.match(dry, /adapters: none \(core only\)/);
  assert.match(dry, /Dry run\. \d+ pending/);
  assert.ok(!existsSync(join(target, "AGENTS.md")));
  assert.throws(() => execFileSync("node", [bin, "status", "--target", target], { stdio: "pipe" }), (e) => e.status === 1);
  execFileSync("node", [bin, "apply", "--target", target, "--write"]);
  execFileSync("node", [bin, "status", "--target", target]);
  const withAdapter = execFileSync("node", [bin, "apply", "--target", target, "--adapter", "workers"], { encoding: "utf8" });
  assert.match(withAdapter, /warning: adapter workers expects package\.json/);
  assert.equal(execFileSync("node", [bin, "adapters"], { encoding: "utf8" }).trim(), "workers");
  assert.throws(() => execFileSync("node", [bin, "apply", "--target", target, "--adapter", "nope"], { stdio: "pipe" }), (e) => e.status === 2);
});
