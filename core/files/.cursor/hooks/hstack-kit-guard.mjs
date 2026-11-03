#!/usr/bin/env node
// Managed by hstack-kit. Cursor beforeShellExecution / beforeMCPExecution hook enforcing .cursor/rules/autonomy.mdc.
// Denies instead of asking: cloud agents have no human to answer a prompt, and a human can run the command themselves.
// Stack adapters add rule packs in ./hstack-kit-guard.rules/*.mjs, each exporting RULES and/or MCP_RULES in the shape below.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CORE_RULES = [
  { id: "merge", why: "A human merges every PR.", re: [/\b(gh|origin|glab)\s+(pr|mr)\s+merge\b/, /\bgh\s+pr\s+review\b.*--approve\b/, /\bgh\s+api\b.*\/pulls\/\d+\/merge\b/] },
  {
    id: "deploy",
    why: "Deploys and traffic changes are human-owned.",
    re: [
      /\b(npm|pnpm|yarn|bun)\s+(run\s+)?deploy\b/,
      /\bmake\s+(\S+\s+)*(deploy|release|publish)\b/,
      /\b(fly|flyctl)\s+deploy\b/,
      /\bvercel\b[^\n]*\s--prod\b/,
      /\bnetlify\s+deploy\b[^\n]*\s--prod\b/,
      /\bgcloud\b[^\n]*\bdeploy\b/,
      /\b(serverless|sls)\s+deploy\b/,
      /\bheroku\s+(releases:rollback|container:release)\b/,
      /\bgit\s+push\s+heroku\b/,
    ],
  },
  {
    id: "secrets",
    why: "Agents never create, change or delete secrets.",
    re: [
      /\bgh\s+(secret|variable)\s+(set|delete|remove)\b/,
      /\bvault\s+(kv\s+)?(put|patch|delete|write|destroy)\b/,
      /\baws\s+secretsmanager\s+(create|put|update|delete|restore)/,
      /\bgcloud\s+secrets\s+(create|delete|versions\s+(add|destroy|disable))\b/,
      /\bkubectl\s+(create|delete|apply)\s+secret\b/,
    ],
  },
  {
    id: "infra",
    why: "Infrastructure, production data and DNS changes are human-owned.",
    re: [/\bterraform\s+(apply|destroy|import)\b/, /\bpulumi\s+(up|destroy|import)\b/, /\bkubectl\s+(apply|delete|replace|patch|scale|rollout|drain)\b/, /\bhelm\s+(install|upgrade|uninstall|rollback)\b/],
  },
  {
    id: "shared-history",
    why: "Never rewrite or push directly to shared branches.",
    re: [/\bgit\s+push\b[^\n]*\s(--force(?!-with-lease)|-f)\b/, /\bgit\s+push\b[^\n]*\s(\S+:)?(main|master)\b/],
  },
];

export const CORE_MCP_RULES = [{ id: "mcp-merge", why: "A human merges every PR.", server: /.*/, tool: /merge|approve/i }];

const PACK_DIR = join(dirname(fileURLToPath(import.meta.url)), "hstack-kit-guard.rules");

export async function loadRules(packDir = PACK_DIR) {
  const shell = [...CORE_RULES];
  const mcp = [...CORE_MCP_RULES];
  const files = existsSync(packDir) ? readdirSync(packDir).filter((f) => f.endsWith(".mjs")).sort() : [];
  for (const file of files) {
    const pack = await import(pathToFileURL(join(packDir, file)).href);
    shell.push(...(pack.RULES ?? []));
    mcp.push(...(pack.MCP_RULES ?? []));
  }
  return { shell, mcp };
}

const INERT = /^\s*(git\s+(commit|tag|log|show|diff)|echo|printf|cat|grep|rg|head|tail|less)\b/;
const CHAINED = /&&|\|\||;|\||\$\(|`/;

export function decideShell(command, rules = CORE_RULES) {
  if (INERT.test(command) && !CHAINED.test(command)) return null;
  for (const rule of rules) if (rule.re.some((re) => re.test(command))) return rule;
  return null;
}

export function decideMcp({ tool_name = "", mcp_server_name = "" }, rules = CORE_MCP_RULES) {
  return rules.find((rule) => rule.server.test(mcp_server_name) && rule.tool.test(tool_name)) ?? null;
}

function respond(rule, subject) {
  if (!rule) return { permission: "allow" };
  return {
    permission: "deny",
    user_message: `hstack-kit blocked this (${rule.id}): ${rule.why}`,
    agent_message: `Blocked by the autonomy policy in .cursor/rules/autonomy.mdc (${rule.id}). ${rule.why} ${rule.fix ?? "Stop. Tell the human exactly what you need run and why, then wait."} Blocked: ${subject}`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const mode = process.argv[2] ?? "shell";
  const rules = await loadRules();
  const out = mode === "mcp" ? respond(decideMcp(input, rules.mcp), `${input.mcp_server_name}/${input.tool_name}`) : respond(decideShell(String(input.command ?? ""), rules.shell), input.command);
  process.stdout.write(JSON.stringify(out));
}
