// Managed by hstack-kit (workers adapter). Rule pack loaded by ../hstack-kit-guard.mjs; see .cursor/rules/autonomy-workers.mdc.
export const RULES = [
  {
    id: "deploy-workers",
    why: "Deploys and traffic changes are human-owned.",
    re: [/\bwrangler\s+(deploy|publish|rollback)\b/, /\bwrangler\s+(versions|triggers|pages)\s+deploy\b/],
  },
  {
    id: "secrets-workers",
    why: "Agents never create, change or delete secrets.",
    re: [/\bwrangler\s+(versions\s+|pages\s+)?secret\s+(put|delete|bulk)\b/, /\bwrangler\s+secrets-store\b/],
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
    re: [/api\.cloudflare\.com\/client\/v4\/zones\b/, /\bflarectl\b[^\n]*\bdns\b/],
  },
];

export const MCP_RULES = [
  { id: "mcp-cloudflare-write", why: "Cloudflare MCP tools reach remote accounts.", server: /cloudflare/i, tool: /(deploy|dns|secret|delete|create|update|put|query|purge|route|domain|zone|execute)/i },
];
