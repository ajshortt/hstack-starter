# AGENTS.md: shortlinks

<!-- Seeded by pstack-kit. This file is yours: edit it, and keep it near 100 lines. It is a map, not a manual. -->

shortlinks is a Cloudflare Worker that shortens URLs. It is the pstack-kit's reference project: every kit change must keep its CI and verification smoke green. Clients call `POST /api/links`; browsers follow `/r/<slug>`.

## Map

| Path | What lives there |
|---|---|
| `src/` | Worker entry (`src/index.ts`: `fetch`, `queue`, `scheduled`) and Durable Object classes |
| `migrations/` | D1 migrations. Add new files; never edit applied ones |
| `test/` | Vitest suites that run inside `workerd` via `@cloudflare/vitest-plugin` |
| `wrangler.jsonc` | Bindings, crons, queues, Durable Objects, environments |
| `.cursor/skills/verify-shortlinks/` | Verification skill: `control.mjs`, seed data, smoke journeys, feature map |
| `.cursor/rules/` | `workers.mdc`, `autonomy.mdc`, `pstack-models.mdc` (managed by pstack-kit) |
| `docs/plans/` | Plans for multi-PR work, with their lifecycle |
| `scripts/kit/` | Checks CI runs: diff limit, this file's rule table, plans |
| `.pstack-kit/` | Kit config and lock. Run the kit's `apply` command to update managed files |

## Commands

Run these before you say a change is done. CI runs the same ones.

```bash
npm ci
npx wrangler types --check && npx tsc --noEmit                  # typecheck
npx eslint . && node scripts/kit/check-agents-rules.mjs          # lint
npx vitest run                                                   # tests in workerd
node .cursor/skills/verify-shortlinks/control.mjs smoke            # verification smoke, evidence in .verify/evidence/
node scripts/kit/diff-limit.mjs                                  # PR size against origin/main
```

To drive the Worker by hand, read `.cursor/skills/verify-shortlinks/SKILL.md` and its `features/README.md` first.

## How we work

- Use `/poteto-mode` (pstack 0.15.36) for anything that needs rigor: bugs, features, refactors, investigations. Skip it for one-line edits.
- First message on a task: restate the goal in your own words and name the smallest change that meets it.
- Bugs: reproduce first with the verification skill, then fix, then show the same journey passing.
- Done means evidence from the verification skill for the changed behavior, not "tests pass".
- One PR is one verifiable change under 400 changed lines. Split bigger work into stacked PRs.
- Multi-PR work starts with a plan in `docs/plans/active/` (see `docs/plans/README.md`).
- Fill every section of `.github/pull_request_template.md`. Reviewers read Evidence first.
- Models: cheaper models by default per `.cursor/rules/pstack-models.mdc`. Use frontier models only when a human asks.

## Context sources

`/why` and `/recall` search these. Link to them from PRs and plans; do not copy them in.

| Source | Where |
|---|---|
| Linear | Team `KIT`, project "pstack kit" |
| Notion | "Agentic engineering / pstack kit" page |
| Slack | `#eng-pstack-kit` |
| Owners | @hugeinc/shortlinks-owners (also in `.github/CODEOWNERS`) |

## Autonomy

Agents build, verify and open PRs on their own. A human merges every PR. Deploys, secrets, remote D1, KV or R2, and production DNS always stop for a human. The full table is in `.cursor/rules/autonomy.mdc`; `.cursor/hooks/pstack-kit-guard.mjs` blocks the shell forms.

## Rules

Each rule names what enforces it, strongest first. `scripts/kit/check-agents-rules.mjs` fails CI if an enforcer does not exist. When a human corrects an agent twice for the same thing, run `/correct`: fix it at the highest level that works (architecture, then types, then lint or CI, then a test, then docs) and add or update the row here.

| Rule | Enforced by |
|---|---|
| Read config and bindings from `env`, never `process.env` | `lint:no-restricted-globals` |
| No Node-only modules in Worker code | `lint:no-restricted-imports` |
| No module-scope mutable state; SQL uses `.bind()` placeholders; untrusted JSON is parsed with zod | `lint:no-restricted-syntax` |
| Every promise is awaited or passed to `ctx.waitUntil` | `lint:@typescript-eslint/no-floating-promises` |
| TypeScript strict, no unchecked index access | `tsconfig.kit.json`, `ci:typecheck` |
| `worker-configuration.d.ts` matches `wrangler.jsonc` | `ci:typecheck` |
| Behavior is tested inside `workerd`, through the Worker's handlers | `ci:test` |
| Changed behavior is proven on the running Worker, with evidence in the PR | `ci:verify-smoke`, `.github/pull_request_template.md` |
| New routes, crons, consumers and Durable Objects get a feature-map entry and a smoke journey | `docs-only` |
| A human merges every PR | `hook:merge` |
| Deploys, secrets, remote data and DNS pause for a human | `hook:deploy`, `hook:secrets`, `hook:remote-data`, `hook:dns` |
| Data commands pass `--local` explicitly | `hook:implicit-remote` |
| PRs stay under the diff limit or explain why | `ci:diff-limit` |
| Plans follow the lifecycle and name the proof for each task | `scripts/kit/check-plans.mjs` |
| Every rule in this table names a real enforcer | `scripts/kit/check-agents-rules.mjs` |

## Project-specific notes

- The KV blocklist `config:blocklist` is operator-managed config. Agents read it locally from the verification seed; production values are changed by a human.
- Click counts live only in the `LinkCounter` Durable Object. Do not add a D1 column for them.
