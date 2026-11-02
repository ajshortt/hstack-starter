#!/usr/bin/env node
// Managed by pstack-kit. Cursor beforeShellExecution / beforeMCPExecution hook enforcing .cursor/rules/autonomy.mdc.
// Denies instead of asking: cloud agents have no human to answer a prompt, and a human can run the command themselves.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RULES = [
  { id: "merge", why: "A human merges every PR.", re: [/\b(gh|origin)\s+pr\s+merge\b/, /\bgh\s+pr\s+review\b.*--approve\b/, /\bgh\s+api\b.*\/pulls\/\d+\/merge\b/] },
  {
    id: "deploy",
    why: "Deploys and traffic changes are human-owned.",
    re: [/\bwrangler\s+(deploy|publish|rollback)\b/, /\bwrangler\s+(versions|triggers|pages)\s+deploy\b/, /\b(npm|pnpm|yarn|bun)\s+(run\s+)?deploy\b/],
  },
  {
    id: "secrets",
    why: "Agents never create, change or delete secrets.",
    re: [/\bwrangler\s+(versions\s+|pages\s+)?secret\s+(put|delete|bulk)\b/, /\bwrangler\s+secrets-store\b/, /\bgh\s+(secret|variable)\s+(set|delete|remove)\b/],
  },
  {
    id: "remote-data",
    why: "Remote D1, KV, R2 and Queues hold real data.",
    re: [
      /\bwrangler\b[^\n]*\s--remote\b/,
      /\bwrangler\s+d1\s+(create|delete|export|time-travel)\b/,
      /\bwrangler\s+(kv\s+namespace|r2\s+bucket|queues|vectorize|hyperdrive)\s+(create|delete|update)\b/,
    ],
  },
  {
    id: "implicit-remote",
    why: "Data commands must say --local explicitly so they can never fall through to a remote resource.",
    fix: "Add --local (and --persist-to if you are driving the verification skill's instance).",
    re: [/\bwrangler\s+(d1\s+(execute|migrations\s+apply)|kv\s+(key|bulk)\s+(put|delete)|r2\s+object\s+(put|delete))\b(?![^\n]*--local\b)/],
  },
  {
    id: "dns",
    why: "Production DNS and zone changes are human-owned.",
    re: [/api\.cloudflare\.com\/client\/v4\/zones\b/, /\bterraform\s+(apply|destroy|import)\b/, /\bflarectl\b[^\n]*\bdns\b/],
  },
  {
    id: "shared-history",
    why: "Never rewrite or push directly to shared branches.",
    re: [/\bgit\s+push\b[^\n]*\s(--force(?!-with-lease)|-f)\b/, /\bgit\s+push\b[^\n]*\s(\S+:)?(main|master)\b/],
  },
];

const MCP_RULES = [
  { id: "mcp-cloudflare-write", why: "Cloudflare MCP tools reach remote accounts.", server: /cloudflare/i, tool: /(deploy|dns|secret|delete|create|update|put|query|purge|route|domain|zone|execute)/i },
  { id: "mcp-merge", why: "A human merges every PR.", server: /.*/, tool: /merge|approve/i },
];

const INERT = /^\s*(git\s+(commit|tag|log|show|diff)|echo|printf|cat|grep|rg|head|tail|less)\b/;
const CHAINED = /&&|\|\||;|\||\$\(|`/;

export function decideShell(command) {
  if (INERT.test(command) && !CHAINED.test(command)) return null;
  for (const rule of RULES) if (rule.re.some((re) => re.test(command))) return rule;
  return null;
}

export function decideMcp({ tool_name = "", mcp_server_name = "" }) {
  return MCP_RULES.find((rule) => rule.server.test(mcp_server_name) && rule.tool.test(tool_name)) ?? null;
}

function respond(rule, subject) {
  if (!rule) return { permission: "allow" };
  return {
    permission: "deny",
    user_message: `pstack-kit blocked this (${rule.id}): ${rule.why}`,
    agent_message: `Blocked by the autonomy policy in .cursor/rules/autonomy.mdc (${rule.id}). ${rule.why} ${rule.fix ?? "Stop. Tell the human exactly what you need run and why, then wait."} Blocked: ${subject}`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const mode = process.argv[2] ?? "shell";
  const out = mode === "mcp" ? respond(decideMcp(input), `${input.mcp_server_name}/${input.tool_name}`) : respond(decideShell(String(input.command ?? "")), input.command);
  process.stdout.write(JSON.stringify(out));
}
