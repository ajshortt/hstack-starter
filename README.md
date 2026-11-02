# pstack-kit

The team's starter kit for agentic engineering on Cloudflare Workers, built on [pstack](https://github.com/cursor/plugins/tree/main/pstack) pinned at **0.15.36**.

A project pulls the kit in once and re-runs it to update. After that, every agent working in the repo (local Cursor, Cursor cloud agents, the project's engineer bot) starts from the same map, the same guardrails and the same way of proving a change works:

- **`AGENTS.md`** (about 100 lines): a map of the repo, the commands, the autonomy line, and a rule table where every rule names the thing that enforces it. CI fails if an enforcer does not exist.
- **Cursor rules**: `workers.mdc` (Workers runtime and bindings), `autonomy.mdc` (what agents do alone and what always pauses for a human), and `pstack-models.mdc` (cheaper models by default).
- **A hook guard** that denies merges, deploys, secret changes, remote D1/KV/R2 access, production DNS and history rewrites before the shell runs them.
- **A Workers verification skill** that starts `wrangler dev` locally with D1, KV, R2, Queues, Durable Objects and seed data, checks itself with a doctor, drives routes, crons, queues and Durable Objects, captures evidence, and cleans up. It comes with a feature map.
- **CI**: strict typecheck, lint, Vitest inside `workerd`, the verification smoke, and a diff-size warning at 400 changed lines.
- **Review and planning conventions**: an evidence-first PR template and committed plans in `docs/plans/` with a lifecycle.

`examples/shortlinks/` is a real Worker with the kit applied. It is how the kit is tested.

## How a project pulls the kit in

**Recommended: the `pstack-kit` CLI for project files, and a Cursor team marketplace for pstack itself.**

| What | Mechanism | Why |
|---|---|---|
| Rules, hooks, CI, templates, verification harness | `pstack-kit apply` copies them into the project and records a lockfile | Files live in the project, so cloud agents, CI and code review see exactly what runs. Updates are a normal reviewed PR. |
| pstack 0.15.36 | This repo is a Cursor **team marketplace** that serves a vendored, hash-checked copy. Set pstack to **Required** for the team. | The public marketplace auto-updates; a team marketplace is the only way to keep everyone on a reviewed version. |

Alternatives we rejected: a git submodule or subtree (files must sit at fixed paths such as `.cursor/rules/` and `.github/workflows/`, which a submodule cannot provide, and subtree merges of shared config conflict constantly); a GitHub template repository (one-shot copy with no update path, and useless for existing projects); an npm package (rules, hooks and workflows still have to be copied out of `node_modules` to take effect, so it needs this same CLI anyway).

### Apply or update

The kit is the private Origin repo [hugeinc/pstack-kit](https://cursor.com/codebase/hugeinc/pstack-kit). npm's `github:` installer only talks to GitHub, so install from the Origin git URL instead. The repo is private: git has to be signed in to Origin before `npx` can clone it.

Once per machine:

```bash
curl -fsSL https://downloads.cursor.com/origin/install.sh | sh
origin auth login       # signs in and installs the git credential helper
origin auth setup-git   # run this if login did not configure git
```

`origin auth login` covers HTTPS (`https://origin.cursor.com/hugeinc/pstack-kit.git`). To use SSH instead, register a key with `origin ssh-key add ~/.ssh/id_ed25519.pub` and call `npx` with `git+ssh://git@origin.cursor.com/hugeinc/pstack-kit.git`. Confirm the host key fingerprint on the [clone docs](https://cursor.com/docs/origin/git) before accepting it.

From the project root, or from the Worker's directory in a monorepo:

```bash
npx --yes git+https://origin.cursor.com/hugeinc/pstack-kit.git#v0.1.0 apply --target .            # dry run
npx --yes git+https://origin.cursor.com/hugeinc/pstack-kit.git#v0.1.0 apply --target . --write    # writes files, .pstack-kit/config.json and lock.json
npx --yes git+https://origin.cursor.com/hugeinc/pstack-kit.git#v0.1.0 status --target .           # exit 1 when the project is behind the kit
```

`#v0.1.0` is the release tag. Drop the fragment to track the default branch. A newer kit release is a new tag; projects change the tag in this command.

`--owners` sets the CODEOWNERS team. `@hugeinc/REPLACE-WITH-TEAM` is a placeholder, not a real team. Pass the team's actual handle, or code owner review requests nobody. See [CODEOWNERS](.github/CODEOWNERS).

`apply` is safe to re-run. Each file has a mode:

| Mode | First apply | Later applies |
|---|---|---|
| `managed` (rules, hook guard, CI workflow, PR template, harness, check scripts) | Created | Updated if you have not edited it. If you have, your file stays, the kit's version is staged in `.pstack-kit/incoming/`, and `status` reports a conflict until you resolve it with `--accept-local <path>` or `--take-kit <path>`. |
| `seed` (`AGENTS.md`, `SKILL.md`, `verify.config.json`, smoke journeys, feature map, `CODEOWNERS`) | Created if missing; existing files are never touched | Never touched. They are yours. |
| `json-merge` (`.cursor/settings.json`) | Adds the kit's keys | Adds missing keys only. Your values win. |
| `lines` (`.gitignore`) | Appends missing lines | Appends missing lines |

Flags: `--name <worker>` (defaults to `package.json` name), `--phase 0|1|2` (how much of the kit to install, see below; never goes down), `--owners "@hugeinc/<team>"` (CODEOWNERS; the shipped example uses the placeholder `@hugeinc/REPLACE-WITH-TEAM`), `--json`.

The kit detects the git root. In a monorepo, the hooks, `.github/` files and cloud-agent environment go to the git root and the CI workflow is named `worker-ci-<name>.yml` with path filters for that Worker.

### Phases

| Phase | Installs | Use it when |
|---|---|---|
| 0 | `autonomy.mdc`, `pstack-models.mdc`, hook guard, `.cursor/settings.json` enabling pstack, `.gitignore` lines | Piloting pstack in any repo. Changes nothing about the build. |
| 1 | Phase 0 plus the verification skill, cloud-agent environment, `.dev.vars.example`, strict `tsconfig.kit.json`, CI workflow, PR template, CODEOWNERS, diff-limit script | The project can start from empty and you are ready to prove changes on the running Worker. |
| 2 (default) | Phase 1 plus `AGENTS.md`, `workers.mdc`, `eslint.workers.js`, the rule-table and plan checks, `docs/plans/` | The full kit. New projects start here. |

Guides: [new project](docs/adoption-new-project.md), [existing project](docs/adoption-existing-project.md).

## Policies the kit encodes

| Decision | Where it lives |
|---|---|
| pstack pinned at 0.15.36; every bump reviewed by the named owner | [docs/pstack-upgrades.md](docs/pstack-upgrades.md), `vendor/pstack.lock.json`, `scripts/vendor-pstack.mjs` |
| Agents build and verify PRs; a human merges every one. Deploys, secrets, remote D1/KV/R2 and production DNS always pause for a human | `template/files/.cursor/rules/autonomy.mdc`, `template/files/.cursor/hooks/pstack-kit-guard.mjs`, [docs/github-settings.md](docs/github-settings.md) |
| Cheaper models by default; frontier models only when someone asks | [docs/model-policy.md](docs/model-policy.md), `template/files/.cursor/rules/pstack-models.mdc` |
| Each project has a dedicated engineer bot that maintains its verification skill daily | [docs/engineer-bot.md](docs/engineer-bot.md) |
| Evidence-first review; about 400 changed lines per PR | [docs/review.md](docs/review.md), `template/files/.github/pull_request_template.md`, `template/files/scripts/kit/diff-limit.mjs` |
| Plans are committed in `docs/plans/` with a lifecycle | `template/files/docs/plans/README.md`, `template/files/scripts/kit/check-plans.mjs` |

## Repository layout

```
bin/pstack-kit.mjs            CLI: apply, status, version
lib/kit.mjs                   Planning, three-way update logic, rendering, lockfile
template/manifest.json        Every kit file: source, destination, mode, phase, project or git root
template/files/               The files projects receive ({{variables}} are rendered per project)
  AGENTS.md                   Seed: map, commands, autonomy, rule→enforcer table
  .cursor/rules/              autonomy.mdc, workers.mdc, pstack-models.mdc
  .cursor/hooks.json          Runs the guard before shell and MCP calls (fails closed)
  .cursor/hooks/pstack-kit-guard.mjs
  .cursor/skills/verify-{{projectName}}/
                              control.mjs (managed harness), SKILL.md, verify.config.json, smoke.json, features/
  .github/                    worker-ci.yml, pull_request_template.md, CODEOWNERS
  scripts/kit/                diff-limit.mjs, check-agents-rules.mjs, check-plans.mjs
  docs/plans/                 README (lifecycle) and _template.md
  tsconfig.kit.json, eslint.workers.js, .dev.vars.example
vendor/pstack/                pstack 0.15.36, byte-for-byte from cursor/plugins
vendor/pstack.lock.json       Upstream commit, tree hash, reviewer
.cursor-plugin/marketplace.json  Team marketplace entry serving vendor/pstack
scripts/vendor-pstack.mjs     check (tree hash and approval) and bump
examples/shortlinks/          Worker with the kit applied: D1, KV, R2, Queue, Durable Object, cron
.github/workflows/kit.yml     CI for this repo: kit tests, vendor check, example in sync
.github/workflows/worker-ci-shortlinks.yml  The kit's Worker CI, applied to the example
docs/                         Adoption, CI on Origin, upgrades, models, engineer bot, review, GitHub settings
test/                         node:test suites for the CLI and the template scripts
```

## Working on the kit

```bash
npm test                                   # CLI and template-script tests (Node 22+)
npm run vendor:check                       # vendored pstack matches the lock
npm run example:status                     # example is in sync with the templates
node bin/pstack-kit.mjs apply --target examples/shortlinks --write   # after editing template/files
cd examples/shortlinks && npm ci && npm run check && npm run verify:smoke
```

A template change ships as: edit `template/files/`, re-apply to the example, run the example's checks and smoke, bump `version` in `package.json`, tag `vX.Y.Z` and push the tag. Projects pick it up by changing the tag in their `apply` command.

The workflows in `.github/workflows/` do not run on Origin by themselves. What has to be connected is in [docs/ci.md](docs/ci.md). Until then, `npm test` and `cd examples/shortlinks && npm run check` are the checks.

## Future phase: Slack → Linear → draft PR

Deferred. Once verification skills are proven and the engineer bots are reliable, the next step is the outer loop from the research notes: a Slack feedback channel feeds Linear triage, an agent reproduces the issue with the verification skill, and opens a draft PR with evidence for a human to pick up. Nothing in the kit implements this yet.
