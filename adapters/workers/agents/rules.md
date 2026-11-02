| Read config and bindings from `env`, never `process.env` | `lint:no-restricted-globals` |
| No Node-only modules in Worker code | `lint:no-restricted-imports` |
| No module-scope mutable state; SQL uses `.bind()` placeholders; untrusted JSON is parsed with zod | `lint:no-restricted-syntax` |
| Every promise is awaited or passed to `ctx.waitUntil` | `lint:@typescript-eslint/no-floating-promises` |
| TypeScript strict, no unchecked index access | `tsconfig.kit.json`, `ci:typecheck` |
| `worker-configuration.d.ts` matches `wrangler.jsonc` | `ci:typecheck` |
| Behavior is tested inside `workerd`, through the Worker's handlers | `ci:test` |
| Wrangler deploys, secrets, remote data and DNS pause for a human | `hook:deploy-workers`, `hook:secrets-workers`, `hook:remote-data`, `hook:dns` |
| Data commands pass `--local` explicitly | `hook:implicit-remote` |
