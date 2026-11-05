import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts/upstreams.mjs");

function check(root) {
  try {
    return { code: 0, ...JSON.parse(execFileSync("node", [SCRIPT, "check", "--root", root], { encoding: "utf8" })) };
  } catch (error) {
    return { code: error.status, ...JSON.parse(error.stdout) };
  }
}

function copyOfKit() {
  const root = mkdtempSync(join(tmpdir(), "upstreams-"));
  cpSync(join(ROOT, "shaping"), join(root, "shaping"), { recursive: true });
  mkdirSync(join(root, "docs"));
  cpSync(join(ROOT, "docs/upstream-updates.md"), join(root, "docs/upstream-updates.md"));
  return root;
}

test("the shaping lock, local copies and MIT notices agree", () => {
  const result = check(ROOT);
  assert.deepEqual(result.problems, []);
  assert.equal(result.code, 0);
});

test("check fails when a copied skill loses Matt Pocock's copyright notice", () => {
  const root = copyOfKit();
  try {
    const skill = join(root, "shaping/grilling/SKILL.md");
    writeFileSync(skill, readFileSync(skill, "utf8").replace(/Copyright \(c\) 2026 Matt Pocock/g, ""));
    const result = check(root);
    assert.equal(result.code, 1);
    assert.match(result.problems.join("\n"), /shaping\/grilling\/SKILL\.md .* notice/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("check fails when a shaping folder is not recorded in the lock", () => {
  const root = copyOfKit();
  try {
    mkdirSync(join(root, "shaping/teach"));
    writeFileSync(join(root, "shaping/teach/SKILL.md"), "---\nname: teach\n---\n");
    const result = check(root);
    assert.equal(result.code, 1);
    assert.match(result.problems.join("\n"), /shaping\/teach\/ is not recorded/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
