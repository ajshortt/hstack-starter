import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { KIT_ROOT, KitError, ciPaths, guessName, pendingActions, plan, render, sha256, slugify, write } from "../lib/kit.mjs";

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
  assert.match(workflow, /name: hstack-kit-api-worker\n/);
  assert.match(workflow, /name: plan \(api-worker\)/);
  assert.match(workflow, /name: check \(api-worker \$\{\{ matrix.check \}\}\)/);
  assert.doesNotMatch(workflow, /package-lock\.json|turbo\.json/);
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

test("--adapter react adds the Vite verification driver, Playwright smoke check and react.mdc, and is idempotent", () => {
  const { target } = repo({ files: { "package.json": JSON.stringify({ name: "web", scripts: { dev: "vite", build: "vite build" } }) } });
  const result = apply(target, { adapter: "react" });
  assert.deepEqual(result.config.adapters, ["react"]);
  for (const path of [
    ".cursor/rules/react.mdc",
    "eslint.react.js",
    "tsconfig.react.json",
    "scripts/kit/eslint-rules-react.mjs",
    ".hstack-kit/checks/react.json",
    ".cursor/skills/verify-web/driver.mjs",
    ".cursor/skills/verify-web/DRIVER.md",
  ]) {
    assert.ok(existsSync(join(target, path)), path);
  }
  // No stack-specific guard pack: React's deploy and publish commands already match the core rules.
  assert.ok(!existsSync(join(target, ".cursor/hooks/hstack-kit-guard.rules")));
  const config = JSON.parse(read(target, ".cursor/skills/verify-web/verify.config.json"));
  assert.equal(config.driver, "driver.mjs");
  assert.match(config.launch.command, /npm run dev/);
  assert.deepEqual(config.doctor[0].page, { path: "/" });
  const checks = JSON.parse(read(target, ".hstack-kit/checks/react.json"));
  assert.deepEqual(checks.checks.map((c) => c.id).sort(), ["build", "lint", "test", "typecheck", "verify-smoke"]);
  assert.match(checks.checks.find((c) => c.id === "verify-smoke").run, /playwright install chromium/);
  const gitignore = read(target, ".gitignore");
  for (const line of [".verify/", ".hstack-kit/incoming/", "node_modules/", "dist/", ".vite/"]) assert.ok(gitignore.split("\n").includes(line), line);
  const agents = read(target, "AGENTS.md");
  assert.match(agents, /is a React front end built with Vite/);
  assert.match(agents, /`lint-react:react-hooks\/exhaustive-deps`/);
  assert.doesNotMatch(agents, /\{\{/);
  assert.equal(pendingActions(plan(target)).length, 0, JSON.stringify(kinds(plan(target))));
});

test("react and workers apply independently to sibling nested projects in one repo", () => {
  const { root, target: api } = repo({ nested: true, files: { "package.json": JSON.stringify({ name: "@acme/api" }) } });
  const web = join(root, "services", "web");
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, "package.json"), JSON.stringify({ name: "web", scripts: { dev: "vite", build: "vite build" } }));
  apply(api, { adapter: "workers", owners: "@acme/api" });
  apply(web, { adapter: "react", owners: "@acme/web" });
  assert.ok(existsSync(join(api, ".cursor/skills/verify-api/driver.mjs")));
  assert.ok(existsSync(join(web, ".cursor/skills/verify-web/driver.mjs")));
  assert.ok(existsSync(join(root, ".github/workflows/hstack-kit-api.yml")));
  assert.ok(existsSync(join(root, ".github/workflows/hstack-kit-web.yml")));
  const apiWf = read(root, ".github/workflows/hstack-kit-api.yml");
  const webWf = read(root, ".github/workflows/hstack-kit-web.yml");
  assert.match(apiWf, /name: hstack-kit-api\n/);
  assert.match(webWf, /name: hstack-kit-web\n/);
  assert.match(apiWf, /name: plan \(api\)/);
  assert.match(webWf, /name: plan \(web\)/);
  assert.match(apiWf, /name: check \(api \$\{\{ matrix.check \}\}\)/);
  assert.match(webWf, /name: check \(web \$\{\{ matrix.check \}\}\)/);
  assert.notEqual(apiWf.match(/name: plan \([^)]+\)/)[0], webWf.match(/name: plan \([^)]+\)/)[0]);
  assert.equal(pendingActions(plan(api)).length, 0);
  assert.equal(pendingActions(plan(web)).length, 0);
});

const SHAPING_SKILLS = ["grilling", "grill-me", "to-questionnaire", "to-tickets", "grill-with-docs", "to-spec", "wayfinder", "triage", "code-review"];

test("--with shaping seeds the shaping skills and is remembered; without it they are absent", () => {
  const { target } = repo();
  const plain = apply(target);
  assert.equal(plain.config.with, undefined);
  assert.equal(JSON.parse(read(target, ".hstack-kit/config.json")).with, undefined);
  assert.equal(JSON.parse(read(target, ".hstack-kit/lock.json")).with, undefined);
  for (const name of [...SHAPING_SKILLS, "implement"]) assert.ok(!existsSync(join(target, ".cursor/skills", name)), name);

  const opted = apply(target, { with: "shaping" });
  assert.deepEqual(opted.config.with, ["shaping"]);
  for (const name of SHAPING_SKILLS) {
    const copied = read(target, ".cursor/skills", name, "SKILL.md");
    assert.equal(copied, read(KIT_ROOT, "shaping", name, "SKILL.md"));
    assert.match(copied, /Copyright \(c\) 2026 Matt Pocock/);
    assert.match(copied, /LICENSE-mattpocock-skills/);
  }
  assert.ok(!existsSync(join(target, ".cursor/skills/implement")));
  for (const name of ["README.md", "TODO.md", "LICENSE-mattpocock-skills", "upstream.lock.json", "pack.json"]) {
    assert.ok(!existsSync(join(target, ".cursor/skills", name)), name);
    assert.ok(!existsSync(join(target, name)), name);
  }
  const lock = JSON.parse(read(target, ".hstack-kit/lock.json"));
  assert.deepEqual(lock.with, ["shaping"]);
  assert.equal(lock.files[".cursor/skills/grilling/SKILL.md"].mode, "seed");
  assert.equal(lock.files[".cursor/skills/code-review/SKILL.md"].mode, "seed");
  assert.equal(opted.root, target);

  writeFileSync(join(target, ".cursor/skills/grilling/SKILL.md"), "project edit\n");
  const again = apply(target);
  assert.equal(read(target, ".cursor/skills/grilling/SKILL.md"), "project edit\n");
  assert.equal(kinds(again)[".cursor/skills/grilling/SKILL.md"], "seed-exists");
  assert.deepEqual(again.config.with, ["shaping"]);
  assert.equal(pendingActions(plan(target)).length, 0);

  assert.throws(() => plan(target, { with: "none" }), /already applied and the kit never removes one/);
  assert.throws(() => plan(target, { with: "nope" }), /Unknown pack "nope"/);
  const fresh = repo().target;
  assert.throws(() => plan(fresh, { with: true }), /--with needs a value/);
  assert.throws(() => plan(fresh, { with: "none,shaping" }), /cannot be combined/);
  assert.equal(plan(fresh, { with: "none" }).config.with, undefined);

  const early = repo();
  apply(early.target, { phase: "0", with: "shaping" });
  assert.ok(existsSync(join(early.target, ".cursor/skills/grill-me/SKILL.md")));
  assert.ok(!existsSync(join(early.target, "AGENTS.md")));
  assert.ok(!existsSync(join(early.target, ".cursor/skills/implement")));

  const both = repo();
  apply(both.target, { adapter: "workers", with: "shaping" });
  assert.ok(existsSync(join(both.target, ".cursor/rules/workers.mdc")));
  assert.ok(existsSync(join(both.target, ".cursor/skills/to-tickets/SKILL.md")));
  assert.match(read(both.target, "AGENTS.md"), /is a Cloudflare Worker/);
  assert.deepEqual(JSON.parse(read(both.target, ".hstack-kit/config.json")).with, ["shaping"]);
});

test("the published package includes the shaping tree apply copies from", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.files.includes("shaping"));
});

test("two targets under one git root share shaping seeds at the root and do not overwrite them", () => {
  const root = mkdtempSync(join(tmpdir(), "kit-test-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const api = join(root, "apps", "api");
  const web = join(root, "apps", "web");
  mkdirSync(api, { recursive: true });
  mkdirSync(web, { recursive: true });
  writeFileSync(join(api, "package.json"), JSON.stringify({ name: "api" }));
  writeFileSync(join(web, "package.json"), JSON.stringify({ name: "web" }));

  const first = apply(api, { with: "shaping" });
  assert.equal(kinds(first)[".cursor/skills/grilling/SKILL.md"], "create");
  assert.equal(JSON.parse(read(api, ".hstack-kit/lock.json")).files[".cursor/skills/grilling/SKILL.md"].mode, "seed");
  for (const name of SHAPING_SKILLS) {
    assert.equal(read(root, ".cursor/skills", name, "SKILL.md"), read(KIT_ROOT, "shaping", name, "SKILL.md"));
    assert.ok(!existsSync(join(api, ".cursor/skills", name)), name);
  }
  assert.ok(existsSync(join(api, ".cursor/skills/verify-api/SKILL.md")));
  assert.ok(!existsSync(join(root, ".cursor/skills/verify-api")));

  writeFileSync(join(root, ".cursor/skills/grilling/SKILL.md"), "project edit\n");
  const second = apply(web, { with: "shaping" });
  assert.equal(kinds(second)[".cursor/skills/grilling/SKILL.md"], "seed-exists");
  assert.equal(read(root, ".cursor/skills/grilling/SKILL.md"), "project edit\n");
  for (const name of SHAPING_SKILLS) assert.ok(!existsSync(join(web, ".cursor/skills", name)), name);
  assert.equal(JSON.parse(read(web, ".hstack-kit/lock.json")).files["apps/web/.cursor/skills/grilling/SKILL.md"], undefined);
  assert.ok(!second.actions.some((a) => a.path.startsWith(".cursor/skills/") && a.kind === "conflict"));

  apply(api);
  apply(web);
  assert.equal(pendingActions(plan(api)).length, 0, JSON.stringify(kinds(plan(api))));
  assert.equal(pendingActions(plan(web)).length, 0, JSON.stringify(kinds(plan(web))));
  assert.equal(kinds(plan(api))[".cursor/skills/grilling/SKILL.md"], "seed-exists");
  assert.equal(kinds(plan(web))[".cursor/skills/grilling/SKILL.md"], "seed-exists");
  assert.equal(read(root, ".cursor/skills/grilling/SKILL.md"), "project edit\n");
  assert.equal(JSON.parse(read(api, ".hstack-kit/lock.json")).files[".cursor/skills/grilling/SKILL.md"].mode, "seed");
});

test("a nested v0.3.1 shaping install keeps stale seed lock entries until the old files are gone", () => {
  const root = mkdtempSync(join(tmpdir(), "kit-test-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const web = join(root, "apps", "web");
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, "package.json"), JSON.stringify({ name: "web" }));
  apply(web);

  const config = JSON.parse(read(web, ".hstack-kit/config.json"));
  config.with = ["shaping"];
  writeFileSync(join(web, ".hstack-kit/config.json"), `${JSON.stringify(config, null, 2)}\n`);
  const lock = JSON.parse(read(web, ".hstack-kit/lock.json"));
  lock.kit = "0.3.1";
  lock.with = ["shaping"];
  for (const name of SHAPING_SKILLS) {
    const rel = `apps/web/.cursor/skills/${name}/SKILL.md`;
    mkdirSync(join(root, "apps/web/.cursor/skills", name), { recursive: true });
    writeFileSync(join(root, rel), `old ${name}\n`);
    lock.files[rel] = { mode: "seed" };
  }
  writeFileSync(join(web, ".hstack-kit/lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

  const bin = new URL("../bin/hstack-kit.mjs", import.meta.url).pathname;
  const dry = execFileSync("node", [bin, "apply", "--target", web], { encoding: "utf8" });
  assert.match(dry, /apps\/web\/\.cursor\/skills\/grilling\/SKILL\.md/);
  assert.match(dry, /you can delete this old copy/);
  assert.match(dry, /The kit never deletes files/);
  assert.equal(read(root, "apps/web/.cursor/skills/grilling/SKILL.md"), "old grilling\n");
  assert.ok(!existsSync(join(root, ".cursor/skills/grilling/SKILL.md")));

  const migrated = apply(web);
  for (const name of SHAPING_SKILLS) {
    assert.equal(kinds(migrated)[`.cursor/skills/${name}/SKILL.md`], "create");
    assert.equal(read(root, ".cursor/skills", name, "SKILL.md"), read(KIT_ROOT, "shaping", name, "SKILL.md"));
    assert.equal(read(root, "apps/web/.cursor/skills", name, "SKILL.md"), `old ${name}\n`);
    assert.equal(kinds(migrated)[`apps/web/.cursor/skills/${name}/SKILL.md`], "orphan");
  }
  const lockAfter = JSON.parse(read(web, ".hstack-kit/lock.json"));
  assert.equal(lockAfter.files[".cursor/skills/grilling/SKILL.md"].mode, "seed");
  assert.equal(lockAfter.files["apps/web/.cursor/skills/grilling/SKILL.md"].mode, "seed");
  assert.match(migrated.actions.find((a) => a.path === "apps/web/.cursor/skills/grilling/SKILL.md").detail, /you can delete this old copy/);

  for (const name of SHAPING_SKILLS) rmSync(join(root, "apps/web/.cursor/skills", name), { recursive: true });
  const forgotten = plan(web);
  for (const name of SHAPING_SKILLS) assert.equal(kinds(forgotten)[`apps/web/.cursor/skills/${name}/SKILL.md`], "forget");
  assert.throws(() => execFileSync("node", [bin, "status", "--target", web], { stdio: "pipe" }), (e) => e.status === 1);
  apply(web);
  const lockFinal = JSON.parse(read(web, ".hstack-kit/lock.json"));
  for (const name of SHAPING_SKILLS) {
    assert.equal(lockFinal.files[`apps/web/.cursor/skills/${name}/SKILL.md`], undefined);
    assert.equal(lockFinal.files[`.cursor/skills/${name}/SKILL.md`].mode, "seed");
    assert.equal(read(root, ".cursor/skills", name, "SKILL.md"), read(KIT_ROOT, "shaping", name, "SKILL.md"));
    assert.ok(!existsSync(join(root, "apps/web/.cursor/skills", name, "SKILL.md")));
  }
  assert.equal(pendingActions(plan(web)).length, 0);
});

test("adapters are remembered and never dropped silently", () => {
  const { target } = repo();
  apply(target, { adapter: "workers" });
  assert.deepEqual(plan(target).config.adapters, ["workers"]);
  assert.throws(() => plan(target, { adapter: "none" }), /already applied and the kit never removes one/);
  assert.throws(() => plan(target, { adapter: "rails" }), /Unknown adapter "rails"\. Available: react, workers/);
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
  assert.match(workflow, /"package.json"/);
  assert.match(workflow, /package-lock\.json/);
  assert.match(workflow, /turbo\.json/);
  assert.match(workflow, /tsconfig\*/);
  assert.match(workflow, /path: services\/api\/\.verify\/evidence\//);
  assert.ok(existsSync(join(root, ".cursor/hooks.json")));
  assert.ok(existsSync(join(target, ".cursor/skills/verify-api-worker/SKILL.md")));
  assert.match(read(root, ".github/CODEOWNERS"), /\/services\/api\/AGENTS.md @acme\/api/);
  assert.equal(JSON.parse(read(root, ".cursor/environment.json")).install, "cd services/api && node scripts/kit/checks.mjs setup");
});

test("ci path filters add the workspace root for a nested project, and extraPaths is preserved", () => {
  assert.deepEqual(ciPaths({ nested: false, workingDirectory: ".", workflowFile: "hstack-kit.yml" }), ["**", ".github/workflows/hstack-kit.yml"]);
  const paths = ciPaths({ nested: true, workingDirectory: "apps/api", workflowFile: "hstack-kit-api.yml", extraPaths: ["packages/**"] });
  for (const glob of ["apps/api/**", "package.json", "package-lock.json", "pnpm-lock.yaml", "turbo.json", "tsconfig*", "packages/**"]) assert.ok(paths.includes(glob), glob);
  const { root, target } = repo({ nested: true });
  apply(target);
  const config = JSON.parse(read(target, ".hstack-kit/config.json"));
  config.extraPaths = ["packages/**"];
  writeFileSync(join(target, ".hstack-kit/config.json"), JSON.stringify(config));
  apply(target);
  assert.match(read(root, ".github/workflows/hstack-kit-api-worker.yml"), /packages\/\*\*/);
  assert.deepEqual(JSON.parse(read(target, ".hstack-kit/config.json")).extraPaths, ["packages/**"]);
  config.extraPaths = ["../outside"];
  writeFileSync(join(target, ".hstack-kit/config.json"), JSON.stringify(config));
  assert.throws(() => plan(target), /extraPaths/);
});

test("the CLI is a dry run by default, status exits 1 when behind, and adapter warnings print", () => {
  const { target } = repo({ files: {} });
  const bin = new URL("../bin/hstack-kit.mjs", import.meta.url).pathname;
  const dry = execFileSync("node", [bin, "apply", "--target", target], { encoding: "utf8" });
  assert.match(dry, /adapters: none \(core only\)/);
  assert.match(dry, /with: none/);
  assert.match(dry, /Dry run\. \d+ pending/);
  assert.ok(!existsSync(join(target, "AGENTS.md")));
  assert.throws(() => execFileSync("node", [bin, "status", "--target", target], { stdio: "pipe" }), (e) => e.status === 1);
  execFileSync("node", [bin, "apply", "--target", target, "--write"]);
  assert.match(execFileSync("node", [bin, "status", "--target", target], { encoding: "utf8" }), /with: none/);
  assert.ok(!existsSync(join(target, ".cursor/skills/grilling")));
  const withAdapter = execFileSync("node", [bin, "apply", "--target", target, "--adapter", "workers"], { encoding: "utf8" });
  assert.match(withAdapter, /warning: adapter workers expects package\.json/);
  assert.equal(execFileSync("node", [bin, "adapters"], { encoding: "utf8" }).trim(), "react\nworkers");
  assert.throws(() => execFileSync("node", [bin, "apply", "--target", target, "--adapter", "nope"], { stdio: "pipe" }), (e) => e.status === 2);
  const dryShaping = execFileSync("node", [bin, "apply", "--target", target, "--with", "shaping"], { encoding: "utf8" });
  assert.match(dryShaping, /with: shaping/);
  assert.match(dryShaping, /Dry run/);
  assert.ok(!existsSync(join(target, ".cursor/skills/grilling/SKILL.md")));
  const wroteShaping = execFileSync("node", [bin, "apply", "--target", target, "--with", "shaping", "--write"], { encoding: "utf8" });
  assert.match(wroteShaping, /with: shaping/);
  assert.ok(existsSync(join(target, ".cursor/skills/grilling/SKILL.md")));
  assert.ok(!existsSync(join(target, ".cursor/skills/implement")));
  assert.match(execFileSync("node", [bin, "status", "--target", target], { encoding: "utf8" }), /with: shaping[\s\S]*Up to date/);
  assert.throws(() => execFileSync("node", [bin, "apply", "--target", target, "--with"], { stdio: "pipe" }), (e) => e.status === 2);
});
