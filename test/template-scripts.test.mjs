import assert from "node:assert/strict";
import { test } from "node:test";
import { decideMcp, decideShell } from "../template/files/.cursor/hooks/pstack-kit-guard.mjs";
import { countDiff, globToRegExp } from "../template/files/scripts/kit/diff-limit.mjs";
import { checkRows, parseRuleTable } from "../template/files/scripts/kit/check-agents-rules.mjs";
import { checkPlan } from "../template/files/scripts/kit/check-plans.mjs";
import { declaredBindings, parseBindingTable, parseJsonc, subsetMismatch } from "../template/files/.cursor/skills/verify-{{projectName}}/control.mjs";

test("guard blocks every always-pause action", () => {
  const blocked = {
    "gh pr merge 12 --squash": "merge",
    "gh pr merge --auto 12": "merge",
    "gh pr review 12 --approve": "merge",
    "origin pr merge 4": "merge",
    "npx wrangler deploy": "deploy",
    "wrangler versions deploy 1@100%": "deploy",
    "npm run deploy": "deploy",
    "wrangler rollback": "deploy",
    "echo $TOKEN | npx wrangler secret put API_KEY": "secrets",
    "wrangler secret bulk secrets.json": "secrets",
    "gh secret set CLOUDFLARE_API_TOKEN": "secrets",
    "npx wrangler d1 execute DB --remote --command 'DELETE FROM links'": "remote-data",
    "wrangler d1 migrations apply DB --remote": "remote-data",
    "wrangler d1 delete shortlinks": "remote-data",
    "wrangler dev --remote": "remote-data",
    "wrangler r2 bucket delete archive": "remote-data",
    "wrangler d1 execute DB --command 'select 1'": "implicit-remote",
    "wrangler kv key put --binding CACHE k v": "implicit-remote",
    "curl -X POST https://api.cloudflare.com/client/v4/zones/abc/dns_records": "dns",
    "terraform apply -auto-approve": "dns",
    "git push --force origin feature": "shared-history",
    "git push origin main": "shared-history",
    "git push origin HEAD:main": "shared-history",
    "npm test && wrangler deploy": "deploy",
    'git commit -m "x" && wrangler deploy': "deploy",
  };
  for (const [command, rule] of Object.entries(blocked)) assert.equal(decideShell(command)?.id, rule, command);
});

test("guard allows ordinary local work", () => {
  for (const command of [
    "npm ci",
    "npx vitest run",
    "npx wrangler dev --local --port 4000",
    "npx wrangler types --check",
    "wrangler d1 execute DB --local --persist-to .verify/x --command 'select 1'",
    "wrangler d1 migrations apply DB --local",
    "node .cursor/skills/verify-api/control.mjs smoke",
    "git push -u origin cursor/fix-redirect",
    "git push --force-with-lease origin cursor/fix-redirect",
    'git commit -m "document why wrangler deploy is human-only"',
    "gh pr create --fill",
    "gh pr view 12 --comments",
    "grep -rn 'wrangler deploy' docs",
  ]) {
    assert.equal(decideShell(command), null, command);
  }
});

test("guard blocks Cloudflare MCP writes and any MCP merge", () => {
  assert.equal(decideMcp({ mcp_server_name: "Cloudflare-bindings", tool_name: "d1_database_query" })?.id, "mcp-cloudflare-write");
  assert.equal(decideMcp({ mcp_server_name: "Cloudflare-builds", tool_name: "workers_builds_list" }), null);
  assert.equal(decideMcp({ mcp_server_name: "Linear", tool_name: "merge_diff" })?.id, "mcp-merge");
  assert.equal(decideMcp({ mcp_server_name: "Linear", tool_name: "save_issue" }), null);
});

test("diff limit excludes lock, generated, vendored and binary files", () => {
  assert.ok(globToRegExp("**/package-lock.json").test("package-lock.json"));
  assert.ok(globToRegExp("**/package-lock.json").test("a/b/package-lock.json"));
  assert.ok(globToRegExp("**/vendor/**").test("vendor/pstack/README.md"));
  assert.ok(!globToRegExp("src/*.ts").test("src/a/b.ts"));
  const numstat = ["10\t5\tsrc/index.ts", "900\t0\tpackage-lock.json", "300\t0\tworker-configuration.d.ts", "-\t-\tassets/logo.png", "50\t0\tgen/api.ts", "1\t1\tsrc/{old => new}.ts"].join("\n");
  const { total, counted } = countDiff(numstat, ["**/package-lock.json", "**/worker-configuration.d.ts"], new Set(["gen/api.ts"]));
  assert.equal(total, 17);
  assert.deepEqual(counted.map((f) => f.path), ["src/index.ts", "src/new.ts"]);
});

test("rule table check rejects rows without a real enforcer", () => {
  const rows = parseRuleTable(["| Rule | Enforced by |", "|---|---|", "| a | `ci:test` |", "| b | human review |", "| c | `ci:deploy` |", "| d | `lint:no-eval` |", "| e | `docs-only` |", "| f | `src/missing.ts` |", "| g | `hook:merge` |"].join("\n"));
  const { errors, warnings } = checkRows(rows, { pathExists: () => false, ciJobs: new Set(["test"]), lintRules: (r) => r === "no-console", hookRules: new Set(["merge"]) });
  assert.equal(errors.length, 4);
  assert.match(errors.join("\n"), /"b" names no enforcer/);
  assert.match(errors.join("\n"), /ci:deploy/);
  assert.match(errors.join("\n"), /lint:no-eval/);
  assert.match(errors.join("\n"), /src\/missing.ts/);
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

test("verification harness parses wrangler config and output", () => {
  const wc = parseJsonc('{\n // comment\n "name": "x", "vars": {"URL": "https://a.b//c"}, /* block */ "d1_databases": [{"binding": "DB"},], "durable_objects": {"bindings": [{"name": "C"}]}\n}');
  assert.equal(wc.vars.URL, "https://a.b//c");
  assert.deepEqual(declaredBindings(wc), ["C", "DB", "URL"]);
  const table = parseBindingTable("env.DB (shortlinks)        D1 Database     local\nenv.C (Counter)    Durable Object   remote\nnoise");
  assert.deepEqual(table, [{ name: "DB", mode: "local" }, { name: "C", mode: "remote" }]);
  assert.equal(subsetMismatch({ a: { b: 1 }, c: "$present", d: "$match:^x" }, { a: { b: 1, z: 2 }, c: 0, d: "xyz" }), null);
  assert.match(subsetMismatch({ c: "$present" }, { c: null }), /expected a value/);
  assert.match(subsetMismatch([{ s: "a" }], [{ s: "b" }]), /\$\.0\.s/);
});
