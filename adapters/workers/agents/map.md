| `src/` | Worker entry (`src/index.ts`: `fetch`, `queue`, `scheduled`) and Durable Object classes |
| `migrations/` | D1 migrations. Add new files; never edit applied ones |
| `test/` | Vitest suites that run inside `workerd` via `@cloudflare/vitest-plugin` |
| `wrangler.jsonc` | Bindings, crons, queues, Durable Objects, environments |
