import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const BIN = new URL("../bin/pstack-kit.mjs", import.meta.url).pathname;
const hasPython = spawnSync("python3", ["--version"]).status === 0;

function pythonRepo() {
  const root = mkdtempSync(join(tmpdir(), "kit-py-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(join(root, "pyproject.toml"), '[project]\nname = "greeter"\nversion = "0.1.0"\n');
  mkdirSync(join(root, "greeter"));
  writeFileSync(join(root, "greeter", "__init__.py"), "def greet(name):\n    return f'hello {name}'\n");
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "tests", "__init__.py"), "");
  writeFileSync(join(root, "tests", "test_greet.py"), "import unittest\nfrom greeter import greet\n\nclass T(unittest.TestCase):\n    def test_greet(self):\n        self.assertEqual(greet('a'), 'hello a')\n");
  writeFileSync(join(root, "server.py"), [
    "import json, sys",
    "from http.server import BaseHTTPRequestHandler, HTTPServer",
    "from greeter import greet",
    "class H(BaseHTTPRequestHandler):",
    "    def log_message(self, *a): print(self.requestline, flush=True)",
    "    def do_GET(self):",
    "        body = {'ok': True} if self.path == '/health' else {'greeting': greet(self.path.strip('/'))}",
    "        out = json.dumps(body).encode()",
    "        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(out)",
    "print('listening', flush=True)",
    "HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()",
    "",
  ].join("\n"));
  git("add", ".");
  git("commit", "-q", "-m", "init");
  return root;
}

const kit = (...args) => execFileSync("node", [BIN, ...args], { encoding: "utf8", stdio: "pipe" });
const run = (root, cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });

test("core-only apply on a Python repo works, is idempotent, and its checks and verification harness run", { skip: !hasPython && "python3 not installed" }, () => {
  const root = pythonRepo();
  const out = kit("apply", "--target", root, "--write");
  assert.match(out, /project greeter, phase 2, adapters: none \(core only\)/);
  assert.ok(!existsSync(join(root, "package.json")), "core must not create an npm layout");
  assert.ok(!existsSync(join(root, "node_modules")));
  assert.match(kit("status", "--target", root), /Up to date\./);
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "adopt pstack-kit"], { cwd: root });
  assert.match(kit("apply", "--target", root, "--write"), /0 files already match|files already match/);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }), "", "a second apply changes nothing");

  const untailored = run(root, "node", ["scripts/kit/checks.mjs", "run", "--all"]);
  assert.equal(untailored.status, 0, untailored.stdout + untailored.stderr);
  assert.match(untailored.stdout, /pass\s+agents-rules/);
  assert.match(untailored.stdout, /pass\s+plans/);
  assert.match(untailored.stdout, /pass\s+verify-smoke/);
  assert.match(untailored.stderr, /still has "_template": true/);
  assert.deepEqual(JSON.parse(run(root, "node", ["scripts/kit/checks.mjs", "list", "--json", "--event", "push"]).stdout), ["agents-rules", "plans", "verify-smoke"]);

  writeFileSync(join(root, ".pstack-kit/checks/local.json"), JSON.stringify({ setup: ["python3 --version"], checks: [{ id: "test", name: "unittest", run: "python3 -m unittest -q" }] }));
  const skill = join(root, ".cursor/skills/verify-greeter");
  writeFileSync(
    join(skill, "verify.config.json"),
    JSON.stringify({
      app: "greeter",
      launch: { command: "python3 server.py {{port}}", timeoutMs: 20000 },
      ready: { request: { path: "/health" }, expect: { status: 200, json: { ok: true } } },
      doctor: [{ name: "log", log: { pattern: "listening" }, expect: { matched: true } }],
      smoke: "smoke.json",
    }),
  );
  writeFileSync(
    join(skill, "smoke.json"),
    JSON.stringify({
      journeys: [
        { feature: "health", steps: [{ label: "health-ok", request: { path: "/health" }, expect: { status: 200, json: { ok: true } } }] },
        {
          feature: "greet",
          steps: [
            { label: "http", request: { path: "/ada" }, expect: { status: 200, json: { greeting: "hello ada" } } },
            { label: "cli", run: { command: "python3 -c \"from greeter import greet; print(greet('{{shortId}}'))\"" }, expect: { exitCode: 0, stdout: "$match:^hello " } },
            { label: "file", file: { path: "pyproject.toml" }, expect: { exists: true } },
          ],
        },
      ],
    }),
  );
  assert.equal(run(root, "node", ["scripts/kit/checks.mjs", "setup"]).status, 0);
  const tailored = run(root, "node", ["scripts/kit/checks.mjs", "run", "--all"]);
  assert.equal(tailored.status, 0, tailored.stdout + tailored.stderr);
  assert.match(tailored.stdout, /pass\s+test/);
  assert.match(tailored.stdout, /"journeys": \[\s*\{\s*"feature": "health",\s*"ok": true/);
  const evidence = execFileSync("sh", ["-c", "cat .verify/evidence/*/summary.md"], { cwd: root, encoding: "utf8" });
  assert.match(evidence, /\| greet \| cli \| pass \|/);
  assert.match(evidence, /Doctor: pass/);
  assert.ok(!existsSync(join(root, ".verify/current")), "smoke stops what it started");
});
