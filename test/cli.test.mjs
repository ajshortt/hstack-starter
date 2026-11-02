import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { KitError, pendingActions, plan, render, sha256, write } from "../lib/kit.mjs";

function repo({ nested = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "kit-test-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const target = nested ? join(root, "workers", "api") : root;
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "package.json"), JSON.stringify({ name: "@acme/api-worker" }));
  return { root, target };
}

const kinds = (result) => Object.fromEntries(result.actions.map((a) => [a.path, a.kind]));
const apply = (target, flags = {}) => write(plan(target, flags));

test("render substitutes variables, keeps GitHub expressions, honours escapes and rejects unknown names", () => {
  assert.equal(render("a {{x}} ${{ github.ref }} {{!y}}", { x: 1 }, "t"), "a 1 ${{ github.ref }} {{y}}");
  assert.throws(() => render("{{nope}}", {}, "t"), KitError);
});

test("first apply creates every phase-2 file and a re-run is a no-op", () => {
  const { target } = repo();
  const first = apply(target);
  assert.equal(first.config.projectName, "api-worker");
  assert.ok(first.actions.every((a) => a.kind === "create"), JSON.stringify(kinds(first)));
  assert.ok(existsSync(join(target, ".cursor/skills/verify-api-worker/control.mjs")));
  assert.ok(existsSync(join(target, ".github/workflows/worker-ci.yml")));
  assert.match(readFileSync(join(target, ".github/workflows/worker-ci.yml"), "utf8"), /working-directory: \.\n/);
  const again = plan(target);
  assert.equal(pendingActions(again).length, 0, JSON.stringify(kinds(again)));
});

test("phase 0 writes only the safety files, and phases only go up", () => {
  const { target } = repo();
  const result = apply(target, { phase: "0" });
  assert.deepEqual(result.actions.map((a) => a.path).sort(), [".cursor/hooks.json", ".cursor/hooks/pstack-kit-guard.mjs", ".cursor/rules/autonomy.mdc", ".cursor/rules/pstack-models.mdc", ".cursor/settings.json", ".gitignore"]);
  assert.throws(() => plan(target, { phase: "0" }) && plan(target, { phase: "-1" }), KitError);
  apply(target, { phase: "1" });
  assert.throws(() => plan(target, { phase: "0" }), /lower than the applied phase/);
});

test("kit changes update unedited managed files", () => {
  const { target } = repo();
  apply(target);
  const file = join(target, ".cursor/rules/autonomy.mdc");
  const lockFile = join(target, ".pstack-kit/lock.json");
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
  const rel = ".cursor/rules/workers.mdc";
  const file = join(target, rel);
  writeFileSync(file, `${readFileSync(file, "utf8")}\nlocal rule\n`);
  assert.equal(kinds(plan(target))[rel], "keep-local");

  const lockFile = join(target, ".pstack-kit/lock.json");
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  lock.files[rel].hash = sha256("an older kit version");
  writeFileSync(lockFile, JSON.stringify(lock));
  const result = apply(target);
  assert.equal(kinds(result)[rel], "conflict");
  assert.match(readFileSync(file, "utf8"), /local rule/);
  assert.ok(existsSync(join(target, ".pstack-kit/incoming", rel)));

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
  mkdirSync(join(target, ".cursor"), { recursive: true });
  writeFileSync(join(target, ".cursor/settings.json"), JSON.stringify({ editor: { tabSize: 2 }, plugins: { other: { enabled: true } } }));
  const result = apply(target);
  const k = kinds(result);
  assert.equal(k[".cursor/rules/autonomy.mdc"], "conflict");
  assert.equal(k["AGENTS.md"], "seed-exists");
  assert.equal(k[".gitignore"], "merge");
  assert.equal(k[".cursor/settings.json"], "merge");
  assert.equal(readFileSync(join(target, ".cursor/rules/autonomy.mdc"), "utf8"), "ours\n");
  assert.equal(readFileSync(join(target, "AGENTS.md"), "utf8"), "# ours\n");
  const gitignore = readFileSync(join(target, ".gitignore"), "utf8");
  assert.equal(gitignore.match(/node_modules\//g).length, 1);
  assert.match(gitignore, /\.verify\//);
  const settings = JSON.parse(readFileSync(join(target, ".cursor/settings.json"), "utf8"));
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
  apply(target);
  execFileSync("rm", [join(target, "AGENTS.md"), join(target, ".cursor/rules/workers.mdc")]);
  const k = kinds(plan(target));
  assert.equal(k["AGENTS.md"], "deleted-locally");
  assert.equal(k[".cursor/rules/workers.mdc"], "deleted-locally");
  apply(target, { "take-kit": ".cursor/rules/workers.mdc" });
  assert.ok(existsSync(join(target, ".cursor/rules/workers.mdc")));
});

test("nested projects put shared files at the git root with a scoped workflow", () => {
  const { root, target } = repo({ nested: true });
  apply(target, { owners: "@acme/api" });
  const workflow = readFileSync(join(root, ".github/workflows/worker-ci-api-worker.yml"), "utf8");
  assert.match(workflow, /working-directory: workers\/api\n/);
  assert.match(workflow, /paths: \["workers\/api\/\*\*"/);
  assert.match(workflow, /hashFiles\('workers\/api\/scripts\/kit\/check-plans.mjs'\)/);
  assert.ok(existsSync(join(root, ".cursor/hooks.json")));
  assert.ok(existsSync(join(target, ".cursor/skills/verify-api-worker/SKILL.md")));
  assert.match(readFileSync(join(root, ".github/CODEOWNERS"), "utf8"), /\/workers\/api\/AGENTS.md @acme\/api/);
  assert.equal(JSON.parse(readFileSync(join(root, ".cursor/environment.json"), "utf8")).install, "cd workers/api && npm ci");
});

test("the CLI is a dry run by default and status exits 1 when behind", () => {
  const { target } = repo();
  const bin = new URL("../bin/pstack-kit.mjs", import.meta.url).pathname;
  const dry = execFileSync("node", [bin, "apply", "--target", target], { encoding: "utf8" });
  assert.match(dry, /Dry run\. \d+ pending/);
  assert.ok(!existsSync(join(target, "AGENTS.md")));
  assert.throws(() => execFileSync("node", [bin, "status", "--target", target], { stdio: "pipe" }), (e) => e.status === 1);
  execFileSync("node", [bin, "apply", "--target", target, "--write"]);
  execFileSync("node", [bin, "status", "--target", target]);
});
