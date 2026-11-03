import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CORE_MCP_RULES, CORE_RULES, decideMcp, decideShell, loadRules } from "../core/files/.cursor/hooks/hstack-kit-guard.mjs";
import { countDiff, DEFAULT_EXCLUDE, globToRegExp } from "../core/files/scripts/kit/diff-limit.mjs";
import { checkRows, parseRuleTable } from "../core/files/scripts/kit/check-agents-rules.mjs";
import { checkPlan } from "../core/files/scripts/kit/check-plans.mjs";
import { loadChecks, mergeChecks, selectChecks } from "../core/files/scripts/kit/checks.mjs";
import { judge, render, subsetMismatch } from "../core/files/.cursor/skills/verify-{{projectName}}/control.mjs";
import { declaredBindings, parseBindingTable, parseJsonc } from "../adapters/workers/files/.cursor/skills/verify-{{projectName}}/driver.mjs";
import * as workersPack from "../adapters/workers/files/.cursor/hooks/hstack-kit-guard.rules/workers.mjs";

const WORKERS_SHELL = [...CORE_RULES, ...workersPack.RULES];
const WORKERS_MCP = [...CORE_MCP_RULES, ...workersPack.MCP_RULES];

test("core guard blocks the stack-neutral always-pause actions", () => {
  const blocked = {
    "gh pr merge 12 --squash": "merge",
    "gh pr merge --auto 12": "merge",
    "gh pr review 12 --approve": "merge",
    "origin pr merge 4": "merge",
    "glab mr merge 7": "merge",
    "npm run deploy": "deploy",
    "pnpm deploy": "deploy",
    "make deploy": "deploy",
    "make build deploy ENV=prod": "deploy",
    "fly deploy": "deploy",
    "vercel deploy --prod": "deploy",
    "gcloud run deploy api --image x": "deploy",
    "serverless deploy --stage prod": "deploy",
    "git push heroku main": "deploy",
    "gh secret set API_TOKEN": "secrets",
    "vault kv put secret/app key=v": "secrets",
    "aws secretsmanager put-secret-value --secret-id x": "secrets",
    "kubectl create secret generic db --from-literal=p=x": "secrets",
    "terraform apply -auto-approve": "infra",
    "pulumi up --yes": "infra",
    "kubectl apply -f deploy.yaml": "infra",
    "helm upgrade api ./chart": "infra",
    "git push --force origin feature": "shared-history",
    "git push origin main": "shared-history",
    "git push origin HEAD:main": "shared-history",
    "npm test && npm run deploy": "deploy",
    'git commit -m "x" && make deploy': "deploy",
  };
  for (const [command, rule] of Object.entries(blocked)) assert.equal(decideShell(command)?.id, rule, command);
});

test("core guard allows ordinary local work in any stack", () => {
  for (const command of [
    "npm ci",
    "pip install -r requirements.txt",
    "pytest -q",
    "cargo test",
    "go test ./...",
    "make test",
    "terraform plan",
    "kubectl get pods",
    "node scripts/kit/checks.mjs run --all",
    "node .cursor/skills/verify-api/control.mjs smoke",
    "git push -u origin cursor/fix-redirect",
    "git push --force-with-lease origin cursor/fix-redirect",
    'git commit -m "document why make deploy is human-only"',
    "gh pr create --fill",
    "grep -rn 'npm run deploy' docs",
  ]) {
    assert.equal(decideShell(command), null, command);
  }
});

test("workers rule pack adds the Wrangler and Cloudflare forms", () => {
  const blocked = {
    "npx wrangler deploy": "deploy-workers",
    "wrangler versions deploy 1@100%": "deploy-workers",
    "wrangler rollback": "deploy-workers",
    "echo $TOKEN | npx wrangler secret put API_KEY": "secrets-workers",
    "wrangler secret bulk secrets.json": "secrets-workers",
    "npx wrangler d1 execute DB --remote --command 'DELETE FROM links'": "remote-data",
    "wrangler d1 migrations apply DB --remote": "remote-data",
    "wrangler d1 delete shortlinks": "remote-data",
    "wrangler dev --remote": "remote-data",
    "wrangler r2 bucket delete archive": "remote-data",
    "wrangler d1 execute DB --command 'select 1'": "implicit-remote",
    "wrangler kv key put --binding CACHE k v": "implicit-remote",
    "curl -X POST https://api.cloudflare.com/client/v4/zones/abc/dns_records": "dns",
    "npm test && wrangler deploy": "deploy-workers",
  };
  for (const [command, rule] of Object.entries(blocked)) {
    assert.equal(decideShell(command, WORKERS_SHELL)?.id, rule, command);
    assert.equal(decideShell(command), null, `core alone does not know ${command}`);
  }
  for (const command of ["npx wrangler dev --local --port 4000", "npx wrangler types --check", "wrangler d1 execute DB --local --persist-to .verify/x --command 'select 1'", "wrangler d1 migrations apply DB --local"]) {
    assert.equal(decideShell(command, WORKERS_SHELL), null, command);
  }
});

test("guard MCP rules: any merge in core, Cloudflare writes in the workers pack", () => {
  assert.equal(decideMcp({ mcp_server_name: "Linear", tool_name: "merge_diff" })?.id, "mcp-merge");
  assert.equal(decideMcp({ mcp_server_name: "Linear", tool_name: "save_issue" }), null);
  assert.equal(decideMcp({ mcp_server_name: "Cloudflare-bindings", tool_name: "d1_database_query" }), null);
  assert.equal(decideMcp({ mcp_server_name: "Cloudflare-bindings", tool_name: "d1_database_query" }, WORKERS_MCP)?.id, "mcp-cloudflare-write");
  assert.equal(decideMcp({ mcp_server_name: "Cloudflare-builds", tool_name: "workers_builds_list" }, WORKERS_MCP), null);
});

test("guard loads adapter rule packs from its rules directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  writeFileSync(join(dir, "acme.mjs"), 'export const RULES = [{ id: "acme-deploy", why: "x", re: [/\\bacme ship\\b/] }];');
  const rules = await loadRules(dir);
  assert.equal(decideShell("acme ship prod", rules.shell)?.id, "acme-deploy");
  assert.equal((await loadRules(join(dir, "missing"))).shell.length, CORE_RULES.length);
});

test("diff limit excludes lock files across ecosystems, generated, vendored and binary files", () => {
  for (const path of ["package-lock.json", "a/b/package-lock.json", "poetry.lock", "svc/Cargo.lock", "go.sum", "vendor/pstack/README.md"]) {
    assert.ok(DEFAULT_EXCLUDE.some((g) => globToRegExp(g).test(path)), path);
  }
  assert.ok(!globToRegExp("src/*.ts").test("src/a/b.ts"));
  const numstat = ["10\t5\tsrc/index.ts", "900\t0\tpackage-lock.json", "300\t0\tworker-configuration.d.ts", "-\t-\tassets/logo.png", "50\t0\tgen/api.ts", "1\t1\tsrc/{old => new}.ts"].join("\n");
  const { total, counted } = countDiff(numstat, ["**/package-lock.json", "**/worker-configuration.d.ts"], new Set(["gen/api.ts"]));
  assert.equal(total, 17);
  assert.deepEqual(counted.map((f) => f.path), ["src/index.ts", "src/new.ts"]);
});

test("check registry merges core, adapters and local overrides in order", () => {
  const merged = mergeChecks([
    { name: "core.json", spec: { checks: [{ id: "agents-rules", run: "a" }, { id: "diff-limit", run: "d", events: ["pull_request"] }] } },
    { name: "workers.json", spec: { setup: ["npm ci"], checks: [{ id: "test", run: "vitest" }], diffExclude: ["**/gen.d.ts"], enforcers: { lint: { list: "x" } } } },
    { name: "local.json", spec: { setup: ["make deps"], checks: [{ id: "test", run: "make test" }, { id: "diff-limit", disabled: true }] } },
  ]);
  assert.deepEqual(merged.setup, ["npm ci", "make deps"]);
  assert.deepEqual(merged.checks.map((c) => [c.id, c.run, c.source]), [["agents-rules", "a", "core.json"], ["test", "make test", "local.json"]]);
  assert.deepEqual(merged.diffExclude, ["**/gen.d.ts"]);
  assert.deepEqual(Object.keys(merged.enforcers), ["lint"]);
  const all = mergeChecks([{ name: "core.json", spec: { checks: [{ id: "a", run: "x" }, { id: "b", run: "y", events: ["pull_request"] }] } }]).checks;
  assert.deepEqual(selectChecks(all, { event: "push" }).map((c) => c.id), ["a"]);
  assert.deepEqual(selectChecks(all, { event: "pull_request" }).map((c) => c.id), ["a", "b"]);
  assert.throws(() => selectChecks(all, { ids: ["nope"] }), /Unknown check nope/);
  assert.throws(() => mergeChecks([{ name: "x.json", spec: { checks: [{ id: "Bad Id", run: "x" }] } }]), /must be lowercase/);
});

test("rule table check resolves ci:, hook:, adapter kinds, paths and docs-only", () => {
  const rows = parseRuleTable(
    ["| Rule | Enforced by |", "|---|---|", "| a | `ci:test` |", "| b | human review |", "| c | `ci:deploy` |", "| d | `lint:no-eval` |", "| e | `docs-only` |", "| f | `src/missing.ts` |", "| g | `hook:merge` |", "| h | `lint:no-console` |", "| i | `ruff:E501` |"].join("\n"),
  );
  const { errors, warnings } = checkRows(rows, { pathExists: () => false, ciChecks: new Set(["test"]), hookRules: new Set(["merge"]), enforcers: { lint: Object.assign(new Set(["no-console"]), { describe: "an ESLint rule" }) } });
  assert.equal(errors.length, 5, errors.join("\n"));
  assert.match(errors.join("\n"), /"b" names no enforcer/);
  assert.match(errors.join("\n"), /ci:deploy/);
  assert.match(errors.join("\n"), /`lint:no-eval` is not an ESLint rule/);
  assert.match(errors.join("\n"), /src\/missing.ts/);
  assert.match(errors.join("\n"), /no adapter provides `ruff:` enforcers/);
  assert.equal(warnings.length, 1);
});

test("plan check enforces front matter, directory, proof and outcome", () => {
  const good = "---\ntitle: T\nstatus: active\nowner: \"@a\"\nlinear: none\ncreated: 2026-11-01\nupdated: 2026-11-01\n---\n# T\n## Tasks\n- [x] Do it. Proof: smoke passes. PR: https://github.com/o/r/pull/1\n- [ ] Next. Proof: test. PR: <later>\n## Outcome\n";
  assert.deepEqual(checkPlan("p.md", "active", good, new Date("2026-11-02")), { errors: [], warnings: [] });
  const stale = checkPlan("p.md", "active", good, new Date("2026-12-31"));
  assert.equal(stale.warnings.length, 1);
  const wrongDir = checkPlan("p.md", "done", good, new Date("2026-11-02"));
  assert.match(wrongDir.errors.join("\n"), /belongs in docs\/plans\/active/);
  assert.match(wrongDir.errors.join("\n"), /needs a filled `## Outcome`/);
  const noProof = checkPlan("p.md", "active", good.replace("Proof: smoke passes. PR: https://github.com/o/r/pull/1", "no proof"), new Date("2026-11-02"));
  assert.match(noProof.errors.join("\n"), /does not name its proof/);
  assert.match(noProof.errors.join("\n"), /does not link its PR/);
});

test("generic harness judges results by field and renders run variables", () => {
  assert.equal(subsetMismatch({ a: { b: 1 }, c: "$present", d: "$match:^x" }, { a: { b: 1, z: 2 }, c: 0, d: "xyz" }), null);
  assert.match(subsetMismatch({ c: "$present" }, { c: null }), /expected a value/);
  assert.match(subsetMismatch([{ s: "a" }], [{ s: "b" }]), /\$\.0\.s/);
  assert.equal(judge({ status: 200, json: { ok: true } }, { status: 200, body: { ok: true, extra: 1 } }), null);
  assert.match(judge({ exitCode: 0, stdout: "$match:ready" }, { exitCode: 0, stdout: "booting" }), /stdout/);
  assert.deepEqual(render({ a: ["{{port}}", "{{unknown}}"] }, { port: 41 }), { a: ["41", "{{unknown}}"] });
});

test("workers driver parses wrangler config and output", () => {
  const wc = parseJsonc('{\n // comment\n "name": "x", "vars": {"URL": "https://a.b//c"}, /* block */ "d1_databases": [{"binding": "DB"},], "durable_objects": {"bindings": [{"name": "C"}]}\n}');
  assert.equal(wc.vars.URL, "https://a.b//c");
  assert.deepEqual(declaredBindings(wc), ["C", "DB", "URL"]);
  const table = parseBindingTable("env.DB (shortlinks)        D1 Database     local\nenv.C (Counter)    Durable Object   remote\nnoise");
  assert.deepEqual(table, [{ name: "DB", mode: "local" }, { name: "C", mode: "remote" }]);
});

test("checks still load from .pstack-kit/checks, and .hstack-kit/checks wins on the same file name", () => {
  const root = mkdtempSync(join(tmpdir(), "checks-"));
  mkdirSync(join(root, ".pstack-kit/checks"), { recursive: true });
  mkdirSync(join(root, ".hstack-kit/checks"), { recursive: true });
  writeFileSync(join(root, ".pstack-kit/checks/core.json"), JSON.stringify({ checks: [{ id: "old-core", run: "x" }] }));
  writeFileSync(join(root, ".pstack-kit/checks/local.json"), JSON.stringify({ checks: [{ id: "test", run: "y" }] }));
  writeFileSync(join(root, ".hstack-kit/checks/core.json"), JSON.stringify({ checks: [{ id: "plans", run: "z" }] }));
  assert.deepEqual(loadChecks(root).checks.map((c) => c.id), ["plans", "test"]);
});

test("shipped check files are valid", () => {
  for (const file of ["../core/files/.hstack-kit/checks/core.json", "../adapters/workers/files/.hstack-kit/checks/workers.json"]) {
    const spec = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
    assert.ok(mergeChecks([{ name: file, spec }]).checks.length >= 3, file);
  }
});
