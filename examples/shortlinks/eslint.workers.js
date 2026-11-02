// Managed by pstack-kit. Local edits are detected on update; put project rules in eslint.config.js.
// Each message names the fix, so an agent that trips a rule knows what to do instead.

const SRC = ["src/**/*.ts"];

const nodeOnlyModules = ["fs", "child_process", "net", "tls", "dgram", "cluster", "worker_threads", "os", "vm", "http", "https"];

export default [
  {
    files: SRC,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: nodeOnlyModules.flatMap((name) => [name, `node:${name}`]).map((name) => ({
            name,
            message:
              "Workers do not provide this Node module. Use Web APIs (fetch, crypto.subtle, streams) or a binding (D1, KV, R2). See .cursor/rules/workers.mdc.",
          })),
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "process", message: "Read configuration from the `env` argument of fetch/queue/scheduled (typed by `wrangler types`), not process.env." },
        { name: "require", message: "Use ES module `import`. Workers run ES modules." },
        { name: "__dirname", message: "There is no filesystem in Workers. Store assets in R2 or bundle them as imports." },
        { name: "Buffer", message: "Use Uint8Array, TextEncoder and TextDecoder. Buffer needs nodejs_compat." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program > VariableDeclaration[kind='let']",
          message:
            "Module-scope `let` is shared across requests in an isolate and lost on eviction. Keep state in a Durable Object, KV or D1.",
        },
        {
          selector: "CallExpression[callee.property.name='prepare'] > TemplateLiteral[expressions.length>0]",
          message: "Never interpolate values into SQL. Use `?1` placeholders and `.bind(...)`.",
        },
        {
          selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']",
          message: "Parse untrusted JSON with a zod schema at the boundary (`Schema.parse(await request.json())`), not bare JSON.parse.",
        },
      ],
    },
  },
];
