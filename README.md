# hstack-kit

The team's starter kit for agentic engineering in any repo, built on [pstack](https://github.com/cursor/plugins/tree/main/pstack) pinned at **0.15.36**. It is a stack-agnostic **core** plus optional **stack adapters**.

A project pulls the kit in once and re-runs it to update. After that, every agent working in the repo (local Cursor, Cursor cloud agents, the project's engineer bot) starts from the same map, the same guardrails and the same way of proving a change works.

## What the core gives every repo

The core assumes nothing about language, framework, package manager or how the app runs. It works the same in a Python service, a Go CLI, a Rails app or a static site.

- **`AGENTS.md`** (about 100 lines): a map of the repo, the commands, the autonomy line, and a rule table where every rule names the thing that enforces it. CI fails if an enforcer does not exist.
- **Cursor rules**: `autonomy.mdc` (what agents do alone and what always pauses for a human) and `pstack-models.mdc` (cheaper models by default).
- **A hook guard** that denies merges, deploys, secret changes, infrastructure changes and history rewrites before the shell or an MCP tool runs them. Adapters add rule packs for their stack's commands.
- **A verification skill** with a stack-neutral harness: isolated runs, a doctor, drive steps (`request`, `run`, `log`, `file`) against a feature map, smoke journeys and an evidence trail. How the app starts is project config (a launch command and a ready check), or an adapter's driver. Libraries and CLIs skip the launch and drive commands directly.
- **Checks any CI can call**: `node scripts/kit/checks.mjs run --all` runs the checks defined in `.hstack-kit/checks/*.json`: the rule table, plans, the verification smoke and a diff-size warning at 400 changed lines, plus whatever your stack and adapters add. The GitHub Actions workflow is a thin wrapper that runs each check as a job.
- **Review and planning conventions**: an evidence-first PR template, CODEOWNERS, and committed plans in `docs/plans/` with a lifecycle.
- **pstack itself**, pinned and vendored, served from this repo as a Cursor team marketplace.

The only runtime the core needs is **Node.js 22+ and a POSIX shell**, to run the CLI, the check runner, the guard and the harness. It never creates a `package.json` or installs npm packages in your repo.

## Adapters

An adapter adds one stack's rules, a verification driver, guard rules and CI checks. You choose adapters when you apply the kit; the default is none.

| Adapter | Adds | Reference example |
|---|---|---|
| [`workers`](adapters/workers/README.md) | Cloudflare Workers: `workers.mdc`, Wrangler guard rules, a `wrangler dev --local` driver with D1/KV/R2 seeding and read-back, and `npm ci` / `tsc` / ESLint / Vitest-in-`workerd` checks | [`examples/shortlinks`](examples/shortlinks) |
| [`react`](adapters/react/README.md) | React (Vite): `react.mdc`, a Playwright-backed driver that renders routes and asserts a clean console, and `tsc` / ESLint / Vitest (jsdom/happy-dom + Testing Library) / `vite build` checks | [`examples/react-counter`](examples/react-counter) |

Writing a new adapter is described in [adapters/README.md](adapters/README.md). Without one, add your stack's commands to `.hstack-kit/checks/local.json` and your launch command to the skill's `verify.config.json`; that is often all a project needs. A repo with more than one stack (say, a Worker API and a React web app) applies the matching adapter to each target directory separately, rather than combining adapters on one target: see [combining adapters](adapters/react/README.md#combining-with-another-adapter).

## How a project pulls the kit in

**Recommended: the `hstack-kit` CLI for project files, and a Cursor team marketplace for pstack itself.**

| What | Mechanism | Why |
|---|---|---|
| Rules, hooks, checks, templates, verification harness | `hstack-kit apply` copies them into the project and records a lockfile | Files live in the project, so cloud agents, CI and code review see exactly what runs. Updates are a normal reviewed PR. |
| pstack 0.15.36 | This repo is a Cursor **team marketplace** that serves a vendored, hash-checked copy. Set pstack to **Required** for the team. | The public marketplace auto-updates; a team marketplace is the only way to keep everyone on a reviewed version. |

Alternatives we rejected: a git submodule or subtree (files must sit at fixed paths such as `.cursor/rules/` and `.github/workflows/`, which a submodule cannot provide, and subtree merges of shared config conflict constantly); a GitHub template repository (one-shot copy with no update path, and useless for existing projects); a language package (rules, hooks and workflows still have to be copied out of the package directory to take effect, so it needs this same CLI anyway, and it would tie the kit to one ecosystem).

### Apply or update

The kit is the GitHub repo [ajshortt/hstack-starter](https://github.com/ajshortt/hstack-starter). `npx` installs it from the git URL and only runs the CLI; the target repo does not need to be a Node project.

Once per machine, install the GitHub CLI from [cli.github.com](https://cli.github.com) (or `brew install gh`), then:

```bash
gh auth login       # signs in to GitHub
gh auth setup-git   # makes git use the gh credentials
```

That covers HTTPS (`https://github.com/ajshortt/hstack-starter.git`). To use SSH instead, register a key with `gh ssh-key add ~/.ssh/id_ed25519.pub` and call `npx` with `git+ssh://git@github.com/ajshortt/hstack-starter.git`. Confirm the host key fingerprint against [GitHub's SSH key fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) before accepting it.

From the project root, or from the project's directory in a monorepo:

```bash
KIT=git+https://github.com/ajshortt/hstack-starter.git#v0.2.0
npx --yes $KIT apply --target .                          # core only, dry run
npx --yes $KIT apply --target . --write                  # writes files, .hstack-kit/config.json and lock.json
npx --yes $KIT apply --target . --adapter workers --write  # core plus the workers adapter
npx --yes $KIT apply --target . --adapter react --write     # core plus the react adapter
npx --yes $KIT status --target .                         # exit 1 when the project is behind the kit
npx --yes $KIT adapters                                  # adapters this kit version ships
```

`#v0.2.0` is the release tag for the core-plus-adapters layout. It is cut after this layout merges; until then, pin a commit SHA from `main`. `v0.1.0` is the earlier Workers-only kit. A newer kit release is a new tag; projects change the tag in this command. Projects applied before the kit was renamed from pstack-kit follow the [upgrade note](docs/adoption-existing-project.md#upgrading-from-pstack-kit-the-kits-name-before-hstack).

`--owners` sets the CODEOWNERS team. `@hugeinc/REPLACE-WITH-TEAM` is a placeholder, not a real team. Pass the team's actual handle, or code owner review requests nobody. See [CODEOWNERS](.github/CODEOWNERS).

`apply` is safe to re-run. Each file has a mode:

| Mode | First apply | Later applies |
|---|---|---|
| `managed` (rules, hook guard, check runner and checks, CI workflow, PR template, harness, adapter driver) | Created | Updated if you have not edited it. If you have, your file stays, the kit's version is staged in `.hstack-kit/incoming/`, and `status` reports a conflict until you resolve it with `--accept-local <path>` or `--take-kit <path>`. |
| `seed` (`AGENTS.md`, `SKILL.md`, `verify.config.json`, smoke journeys, feature map, `CODEOWNERS`) | Created if missing; existing files are never touched | Never touched. They are yours. |
| `json-merge` (`.cursor/settings.json`) | Adds the kit's keys | Adds missing keys only. Your values win. |
| `lines` (`.gitignore`) | Appends missing lines | Appends missing lines |

Flags:

- `--adapter <name>|none`: repeat it or pass a comma-separated list. The choice is saved in `.hstack-kit/config.json`, and later runs reuse it. The kit never removes an adapter: dropping one is a hand edit. A project adopted with 0.1 must pass `--adapter workers` or `--adapter none` once.
- `--name <project>`: defaults to the name in `package.json`, `pyproject.toml` or `Cargo.toml`, else the directory name.
- `--phase 0|1|2`: how much of the kit to install (see below). It never goes down.
- `--owners "@hugeinc/<team>"`: the CODEOWNERS team.
- `--json`: machine-readable output.

The kit detects the git root. In a monorepo, the hooks, `.github/` files and cloud-agent environment go to the git root, and the CI workflow is named `hstack-kit-<name>.yml` with path filters for that project.

### Phases

| Phase | Core installs | The workers adapter adds | The react adapter adds | Use it when |
|---|---|---|---|---|
| 0 | `autonomy.mdc`, `pstack-models.mdc`, hook guard, `.cursor/settings.json` enabling pstack, `.gitignore` lines | `autonomy-workers.mdc`, the Wrangler guard rules | `.gitignore` lines for `dist/`, `.vite/` | Piloting pstack in any repo. Changes nothing about the build. |
| 1 | The verification skill, cloud-agent environment, check runner and core checks, CI wrapper, PR template, CODEOWNERS, diff-limit | The `wrangler dev` driver and its skill seeds, Workers checks, `.dev.vars.example`, `tsconfig.kit.json` | The Playwright-backed driver and its skill seeds, React checks, `tsconfig.react.json` | You are ready to prove changes on the running app. |
| 2 (default) | `AGENTS.md`, the rule-table and plan checks, `docs/plans/` | `workers.mdc`, `eslint.workers.js`, the ESLint rule lister for the rule table | `react.mdc`, `eslint.react.js`, the ESLint rule lister for the rule table | The full kit. New projects start here. |

Guides: [new project](docs/adoption-new-project.md), [existing project](docs/adoption-existing-project.md), [workers adapter](adapters/workers/README.md), [react adapter](adapters/react/README.md).

## Policies the kit encodes

| Decision | Where it lives |
|---|---|
| pstack pinned at 0.15.36; every bump reviewed by the named owner | [docs/pstack-upgrades.md](docs/pstack-upgrades.md), `vendor/pstack.lock.json`, `scripts/vendor-pstack.mjs` |
| Agents build and verify PRs; a human merges every one. Deploys, secrets, remote data, infrastructure and production DNS always pause for a human | `core/files/.cursor/rules/autonomy.mdc`, `core/files/.cursor/hooks/hstack-kit-guard.mjs`, adapter rule packs, [docs/github-settings.md](docs/github-settings.md) |
| Cheaper models by default; frontier models only when someone asks | [docs/model-policy.md](docs/model-policy.md), `core/files/.cursor/rules/pstack-models.mdc` |
| Each project has a dedicated engineer bot that maintains its verification skill daily | [docs/engineer-bot.md](docs/engineer-bot.md) |
| Evidence-first review; about 400 changed lines per PR | [docs/review.md](docs/review.md), `core/files/.github/pull_request_template.md`, `core/files/scripts/kit/diff-limit.mjs` |
| Plans are committed in `docs/plans/` with a lifecycle | `core/files/docs/plans/README.md`, `core/files/scripts/kit/check-plans.mjs` |

## Repository layout

```
bin/hstack-kit.mjs            CLI: apply, status, adapters, version
lib/kit.mjs                   Layering (core + adapters), three-way updates, rendering, lockfile
core/manifest.json            Every core file: source, destination, mode, phase, project or git root
core/agents/                  Default AGENTS.md fragments, used when no adapter supplies its own
core/files/                   Files every project receives ({{variables}} are rendered per project)
  AGENTS.md                   Seed: map, commands, autonomy, rule→enforcer table
  .cursor/rules/              autonomy.mdc, pstack-models.mdc
  .cursor/hooks.json          Runs the guard before shell and MCP calls (fails closed)
  .cursor/hooks/hstack-kit-guard.mjs  Core rules; loads adapter packs from hstack-kit-guard.rules/
  .cursor/skills/verify-{{projectName}}/
                              control.mjs (managed harness), SKILL.md, verify.config.json, smoke.json, features/
  .hstack-kit/checks/core.json  Core check definitions
  scripts/kit/                checks.mjs (runner), diff-limit.mjs, check-agents-rules.mjs, check-plans.mjs
  .github/                    workflows/hstack-kit.yml (thin wrapper), pull_request_template.md, CODEOWNERS
  docs/plans/                 README (lifecycle) and _template.md
adapters/README.md            How to write an adapter
adapters/workers/             Cloudflare Workers adapter: adapter.json, agents/ fragments, files/
adapters/react/               React (Vite) adapter: adapter.json, agents/ fragments, files/
vendor/pstack/                pstack 0.15.36, byte-for-byte from cursor/plugins
vendor/pstack.lock.json       Upstream commit, tree hash, reviewer
.cursor-plugin/marketplace.json  Team marketplace entry serving vendor/pstack
scripts/vendor-pstack.mjs     check (tree hash and approval) and bump
examples/shortlinks/          The workers adapter's reference project: D1, KV, R2, Queue, Durable Object, cron
examples/react-counter/       The react adapter's reference project: Vite, React Router, Vitest, Playwright smoke
.github/workflows/kit.yml     CI for this repo: kit tests, vendor check, example in sync
.github/workflows/hstack-kit-shortlinks.yml  The kit's CI wrapper, applied to the shortlinks example
.github/workflows/hstack-kit-react-counter.yml  The kit's CI wrapper, applied to the react-counter example
docs/                         Adoption, CI, upgrades, models, engineer bot, review, GitHub settings
test/                         node:test suites: CLI, core and adapter scripts, core-only end to end on a Python repo
```

## Working on the kit

```bash
npm test                                   # CLI, script and core-only end-to-end tests (Node 22+, python3 for the end-to-end test)
npm run vendor:check                       # vendored pstack matches the lock
npm run example:status                     # shortlinks example is in sync with core + workers
npm run example:react:status               # react-counter example is in sync with core + react
node bin/hstack-kit.mjs apply --target examples/shortlinks --write   # after editing core/ or adapters/workers/
node bin/hstack-kit.mjs apply --target examples/react-counter --write # after editing core/ or adapters/react/
cd examples/shortlinks && node scripts/kit/checks.mjs setup && node scripts/kit/checks.mjs run --all
```

A kit change ships as: edit `core/` or `adapters/`, re-apply to the matching example (or both, for a core change), run the example's checks (which include a verification smoke), bump `version` in `package.json`, tag `vX.Y.Z` and push the tag. Projects pick it up by changing the tag in their `apply` command. Core changes must keep `test/core-only.test.mjs` green: that test is the proof the core still works with no adapter and no Node project.

The workflows in `.github/workflows/` run on GitHub Actions: `kit.yml` on every pull request and push to `main`, and `hstack-kit-shortlinks.yml` / `hstack-kit-react-counter.yml` when the matching example changes. Running the same checks on another CI system is described in [docs/ci.md](docs/ci.md).

## Future phase: Slack → Linear → draft PR

Deferred. Once verification skills are proven and the engineer bots are reliable, the next step is the outer loop from the research notes: a Slack feedback channel feeds Linear triage, an agent reproduces the issue with the verification skill, and opens a draft PR with evidence for a human to pick up. Nothing in the kit implements this yet.
