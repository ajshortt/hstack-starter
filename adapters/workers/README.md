# The workers adapter

Cloudflare Workers on top of the hstack-kit core: Wrangler, D1, KV, R2, Queues, Durable Objects and crons. It is the kit's reference adapter, and [`examples/shortlinks`](../../examples/shortlinks) is its reference project. Every kit change must keep that example's checks and its 19-step verification smoke green.

```bash
npx --yes git+https://github.com/ajshortt/hstack-starter.git#v0.3.2 apply --target . --adapter workers --owners "@your-org/your-team" --write
```

To also seed the shaping skills, add `--with shaping`. It is independent of this adapter and off by default. Skills land in the git root `.cursor/skills/`. See the [kit README](../../README.md#apply-or-update).

## What it adds

| Phase | Files | Purpose |
|---|---|---|
| 0 | `.cursor/rules/autonomy-workers.mdc`, `.cursor/hooks/hstack-kit-guard.rules/workers.mjs`, `.gitignore` lines (`node_modules/`, `.wrangler/`, `.dev.vars`) | Wrangler forms of the always-pause list. Guard rules `deploy-workers`, `secrets-workers`, `remote-data`, `implicit-remote` (data commands without `--local`), `dns`, and the MCP rule `mcp-cloudflare-write` |
| 1 | `driver.mjs` and `DRIVER.md` in the verification skill, Workers skill seeds, `.hstack-kit/checks/workers.json`, `.dev.vars.example`, `tsconfig.kit.json` | `wrangler dev --local` verification with migrations, seeding and D1/KV/R2 read-back; CI checks |
| 2 | `.cursor/rules/workers.mdc`, `eslint.workers.js`, `scripts/kit/eslint-rules.mjs` | Runtime rules, the ESLint preset, and `lint:<rule>` enforcers for the AGENTS.md rule table |

Checks it defines, run by `node scripts/kit/checks.mjs` locally and in CI:

| Check | Command |
|---|---|
| setup | `node scripts/kit/checks.mjs install` (nearest lockfile, up to the git root) |
| `typecheck` | `npx wrangler types --check && npx tsc --noEmit` |
| `lint` | `npx eslint . --max-warnings 0` (skipped until an `eslint.config.*` exists) |
| `test` | `npx vitest run` |

It also excludes `worker-configuration.d.ts` from the diff limit. The core adds `agents-rules`, `plans`, `verify-smoke` and `diff-limit`.

## New Worker

### 1. Scaffold

```bash
npm create cloudflare@latest -- my-worker --type=hello-world --lang=ts --git --no-deploy
cd my-worker
```

Add the bindings you need to `wrangler.jsonc`, and a `/health` route that proves the Worker can read its data (for example, `SELECT count(*)` on a seeded table), not only that it started. The verification skill's ready step uses it.

### 2. Toolchain

```bash
npm install -D wrangler@4 typescript@~6.0 vitest@5 @cloudflare/vitest-plugin \
  eslint@10 @eslint/js typescript-eslint globals
npm install zod
npx wrangler types
```

`@cloudflare/vitest-pool-workers` has been renamed to `@cloudflare/vitest-plugin`. The adapter and the example use the new package; the old name is deprecated. The example pins wrangler 4.156.1 and vitest 5.0.5.

### 3. Apply core plus the adapter

Run the `apply` command at the top of this page, dry run first.

### 4. Wire your config to the adapter's files

The kit does not rewrite your own config files. Make these edits, all of which match the example:

- **`tsconfig.json`** extends the strict settings:

```json
{
  "extends": "./tsconfig.kit.json",
  "compilerOptions": { "types": ["./worker-configuration.d.ts", "@cloudflare/vitest-plugin/types"] },
  "include": ["src", "test", "worker-configuration.d.ts"]
}
```

- **`eslint.config.js`** uses `strictTypeChecked` and the Workers rules. Copy `examples/shortlinks/eslint.config.js`; the line that matters is the last entry, `workers` from `./eslint.workers.js`.
- **`vitest.config.ts`** runs tests inside `workerd`, with D1 migrations applied. Copy `examples/shortlinks/vitest.config.ts`, `test/apply-migrations.ts` and `test/env.d.ts`.
- **`package.json` scripts** are optional shortcuts. The example uses `"check": "node scripts/kit/checks.mjs run --all"`.

### 5. Tailor the verification skill

The kit seeds `.cursor/skills/verify-my-worker/` with the Workers driver. `start` refuses to run until `"_template": true` is removed from `verify.config.json`.

1. In Cursor, run `/create-verification-skill` and say: "Extend the existing `.cursor/skills/verify-my-worker/`. Keep `control.mjs` and `driver.mjs`. Fill `verify.config.json` (the `ready` step, `doctor` probes, and `workers.seed`), `seed/`, `smoke.json` and `features/` from this repo. Read `DRIVER.md` first."
2. Compare the result with the example: a seed file per store under `seed/`, doctor probes that prove the seed loaded (`d1` and `kv` steps with `expect`), one feature file per route, cron, consumer and Durable Object, and at least one smoke journey per feature that reads state back.
3. Run `node .cursor/skills/verify-my-worker/control.mjs smoke`. It must pass from a clean checkout, leave no `workerd` process behind, and write `.verify/evidence/<run-id>/summary.md`.

Then continue with the core [new-project guide](../../docs/adoption-new-project.md) from "Tailor `AGENTS.md`".

## Existing Worker

Follow the core [existing-project guide](../../docs/adoption-existing-project.md) with `--adapter workers` on every `apply`. The Workers-specific work per phase:

- **Phase 1, start from empty.** `wrangler dev --local` must start with only `npm ci` and the files in the repo. Typical fixes: commit the D1 migrations, replace a dependency on a remote binding with a local one, move required secrets into `.dev.vars.example` with dev-only values.
- **Phase 1, tests.** If the project has no tests, add Vitest in `workerd` with `@cloudflare/vitest-plugin` as in the example. Before refactoring anything, add characterization tests for current behavior.
- **Phase 1, TypeScript.** Extend `tsconfig.kit.json` from your `tsconfig.json`. If the error count is large, override the noisiest flags in your own `tsconfig.json` for now and remove one override per PR.
- **Phase 2, ESLint.** Wire `eslint.workers.js` into your ESLint config. Fix the violations it finds, or scope it down with `files`/`ignores` and record the gap as a plan.

## Upgrading a project adopted with kit 0.1

Kit 0.1 always installed the Workers files. Since 0.2 they belong to this adapter, so the first apply with 0.2 needs the choice made explicitly:

```bash
npx --yes git+https://github.com/ajshortt/hstack-starter.git#v0.3.2 apply --target . --adapter workers --write
```

Then, by hand:

1. Delete `.github/workflows/worker-ci.yml` (or `worker-ci-<name>.yml`), which apply reports as an orphan. The new `hstack-kit.yml` wrapper runs the same checks. Update required status checks to the new `check (<id>)` names ([github-settings.md](../../docs/github-settings.md)).
2. Move `verify.config.json` to the driver shape. Compare with `examples/shortlinks/.cursor/skills/verify-shortlinks/verify.config.json`: add `"driver": "driver.mjs"`, turn `ready` into a step (`{ "request": { "path": "/health" }, "expect": { "status": 200, "json": {...} } }`), turn `doctor.d1`/`doctor.kv` into a list of `d1`/`kv` steps with `expect`, and move `wranglerConfig`, `vars` and `seed` under `"workers"`. `smoke.json` journeys keep working unchanged.
3. Update `AGENTS.md`: the commands are now `node scripts/kit/checks.mjs ...`, and the guard rule ids for Wrangler are `hook:deploy-workers` and `hook:secrets-workers` (core keeps `hook:deploy`, `hook:secrets` and adds `hook:infra`). `node scripts/kit/check-agents-rules.mjs` points at every row that needs a change.
4. Set the cloud-agent install command in `.cursor/environment.json` to `node scripts/kit/checks.mjs setup`.

Choosing `--adapter none` instead keeps the files already on disk but stops updating them; delete the Workers ones by hand if you mean to leave the stack layer.

## CI credentials

None. Every check runs locally under `wrangler dev --local` and `workerd`. Do not add a Cloudflare API token to CI for these checks; deploys stay in a separate, human-triggered workflow.
