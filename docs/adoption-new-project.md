# Adopting the kit in a new Worker

A new project takes the whole kit (phase 2) on day one. Getting from an empty repo to a first verified PR means installing the toolchain, applying the kit, tailoring the verification skill, and setting up the engineer bot. `examples/shortlinks/` is the finished result; copy from it whenever a step is unclear.

## 1. Scaffold the Worker

```bash
npm create cloudflare@latest -- my-worker --type=hello-world --lang=ts --git --no-deploy
cd my-worker
```

Add the bindings you need to `wrangler.jsonc`, and a `/health` route that proves the Worker can read its data (for example, `SELECT count(*)` on a seeded table), not only that it started. The verification skill's ready check uses it.

## 2. Install the toolchain the kit's CI expects

```bash
npm install -D wrangler@4 typescript@~6.0 vitest@5 @cloudflare/vitest-plugin \
  eslint@10 @eslint/js typescript-eslint globals
npm install zod
npx wrangler types
```

`@cloudflare/vitest-pool-workers` has been renamed to `@cloudflare/vitest-plugin`. The kit and the example use the new package; the old name is deprecated.

## 3. Apply the kit

```bash
npx --yes github:<org>/pstack-kit#v0.1.0 apply --target . --owners "@<org>/<team>"           # read the plan
npx --yes github:<org>/pstack-kit#v0.1.0 apply --target . --owners "@<org>/<team>" --write
```

## 4. Wire the project files to the kit

The kit does not rewrite your own config files. Make four small edits, all of which match the example:

- **`tsconfig.json`** extends the kit's strict settings:

```json
{
  "extends": "./tsconfig.kit.json",
  "compilerOptions": { "types": ["./worker-configuration.d.ts", "@cloudflare/vitest-plugin/types"] },
  "include": ["src", "test", "worker-configuration.d.ts"]
}
```

- **`eslint.config.js`** uses `strictTypeChecked` and the kit's Workers rules. Copy `examples/shortlinks/eslint.config.js`; the line that matters is the last entry, `workers` from `./eslint.workers.js`.
- **`vitest.config.ts`** runs tests inside `workerd`, with D1 migrations applied. Copy `examples/shortlinks/vitest.config.ts`, `test/apply-migrations.ts` and `test/env.d.ts`.
- **`package.json` scripts** match the commands in `AGENTS.md`:

```json
{
  "typecheck": "wrangler types --check && tsc --noEmit",
  "lint": "eslint . && node scripts/kit/check-agents-rules.mjs && node scripts/kit/check-plans.mjs",
  "test": "vitest run",
  "verify": "node .cursor/skills/verify-my-worker/control.mjs",
  "verify:smoke": "node .cursor/skills/verify-my-worker/control.mjs smoke",
  "check": "npm run typecheck && npm run lint && npm test && npm run verify:smoke"
}
```

## 5. Tailor `AGENTS.md`

Replace the placeholder sentences: what the Worker does, the Linear team and project, the Notion space, the Slack channels. Keep it near 100 lines. Keep the rule table, and only add a rule when you can name its enforcer. `node scripts/kit/check-agents-rules.mjs` tells you when an enforcer is missing.

## 6. Make the verification skill real

The kit seeds `.cursor/skills/verify-my-worker/` as a draft. `start` refuses to run until it is tailored.

1. In Cursor, run `/create-verification-skill` and say: "Extend the existing `.cursor/skills/verify-my-worker/`. Keep `control.mjs`. Fill `verify.config.json`, `seed/`, `smoke.json` and `features/` from this repo."
2. Check what it produced against the example: a seed file per store under `seed/`, doctor probes that prove the seed loaded, one feature file per route, cron, consumer and Durable Object, and at least one smoke journey per feature that reads state back.
3. Remove `"_template": true` from `verify.config.json`.
4. Run `npm run verify:smoke`. It must pass from a clean checkout, leave no `workerd` process behind, and write `.verify/evidence/<run-id>/summary.md`.

## 7. Configure GitHub and Cursor

- Push, then turn on branch protection as described in [github-settings.md](github-settings.md). The required checks are the jobs in `.github/workflows/worker-ci.yml`.
- Make sure the team marketplace with pstack set to **Required** is in place ([pstack-upgrades.md](pstack-upgrades.md#how-the-pin-is-enforced)). The kit's `.cursor/settings.json` already enables pstack for the repo.
- Open the repo in a Cursor cloud agent once. The kit's `.cursor/environment.json` runs `npm ci`. Ask the agent to run `npm run check`, and snapshot the environment once it passes.

## 8. Set up the engineer bot

Follow [engineer-bot.md](engineer-bot.md). Its first job is a `/maintain-verification-skill` pass on the skill you just tailored.

## Done means

- `npm run check` passes locally and in CI on the first PR.
- The first PR's description includes the smoke `summary.md` table.
- `npx --yes github:<org>/pstack-kit#v0.1.0 status --target .` prints `Up to date.`
- The engineer bot's daily routine is scheduled.
