# Writing a pstack-kit adapter

The core works in any repo without an adapter. Write one when several projects share a stack and would otherwise each hand-write the same launch config, checks and rules. An adapter is a directory here; projects opt in with `pstack-kit apply --adapter <name>`.

`workers/` is the reference adapter. Read it alongside this page.

## What an adapter contributes

| Piece | Lands in the project as | Why |
|---|---|---|
| Stack rules | `.cursor/rules/<name>.mdc`, `.cursor/rules/autonomy-<name>.mdc` | What agents must know about the runtime, and the stack's forms of the always-pause actions |
| Guard rule pack | `.cursor/hooks/pstack-kit-guard.rules/<name>.mjs` | Blocks the stack's deploy, secret and remote-data commands |
| Verification driver | `.cursor/skills/verify-<project>/driver.mjs` and `DRIVER.md` | How to prepare, launch, check and read back the app |
| Skill seeds | `verify.config.json`, `smoke.json`, `features/*.md` in the same skill | A starting config that uses the driver |
| Checks | `.pstack-kit/checks/<name>.json` | Install, typecheck, lint and test commands, run by `scripts/kit/checks.mjs` in any CI |
| AGENTS.md fragments | Rendered into the seeded `AGENTS.md` | The map rows, commands and rule-table rows for the stack |
| Other files | Anywhere | Shared config such as a strict `tsconfig`, a lint preset or an `.env` example |

Everything is optional. An adapter that ships only a checks file and a rules file is fine.

## Layout

```
adapters/<name>/
  adapter.json        manifest (below)
  README.md           how a project adopts this stack: scaffold, toolchain, wiring, tailoring
  agents/             AGENTS.md fragments: summary.md, map.md, commands.md, rules.md, autonomy.md
  files/              the files projects receive, at their destination paths
```

## `adapter.json`

```json
{
  "name": "rails",
  "description": "Ruby on Rails with Postgres",
  "requires": ["Gemfile"],
  "agents": { "summary": "agents/summary.md", "map": "agents/map.md", "commands": "agents/commands.md", "rules": "agents/rules.md", "autonomy": "agents/autonomy.md" },
  "files": [
    { "src": ".cursor/rules/autonomy-rails.mdc", "mode": "managed", "phase": 0 },
    { "src": ".cursor/hooks/pstack-kit-guard.rules/rails.mjs", "mode": "managed", "phase": 0, "root": "git" },
    { "src": ".gitignore.rails", "dest": ".gitignore", "mode": "lines", "phase": 0 },
    { "src": ".cursor/skills/verify-{{projectName}}/driver.mjs", "mode": "managed", "phase": 1 },
    { "src": ".cursor/skills/verify-{{projectName}}/verify.config.json", "mode": "seed", "phase": 1 },
    { "src": ".pstack-kit/checks/rails.json", "mode": "managed", "phase": 1 },
    { "src": ".cursor/rules/rails.mdc", "mode": "managed", "phase": 2 }
  ]
}
```

- `requires`: paths the stack expects in the project. Missing ones print a warning at apply time; they never block.
- `files`: same entry format as `core/manifest.json`. `mode` is `managed`, `seed`, `json-merge` or `lines`. `phase` is when the file arrives (0 safety, 1 verification and CI, 2 the full garden). `root: "git"` writes at the git root instead of the project directory, which is how hooks and `.github/` files work in monorepos.
- An entry with the **same destination as a core file replaces it**. That is how an adapter swaps in its own `verify.config.json`, `smoke.json` and feature map seeds. Entries in `lines` mode with the same destination are combined instead, so `.gitignore` gets both sets of lines.
- Templates can use `{{projectName}}`, `{{verifySkill}}`, `{{owners}}`, `{{nodeVersion}}`, `{{diffLimit}}`, `{{pstackVersion}}`, `{{adapters}}`, `{{workingDirectory}}`, `{{workdirPrefix}}`, `{{pathsGlob}}` and `{{workflowFile}}`. Write `{{!name}}` to emit a literal `{{name}}`, for placeholders the harness fills in at run time such as `{{!port}}` and `{{!runId}}`. An unknown variable fails the apply, so typos surface immediately.

## Checks: `.pstack-kit/checks/<name>.json`

```json
{
  "setup": ["bundle install"],
  "checks": [
    { "id": "lint", "name": "rubocop", "run": "bundle exec rubocop", "requires": ".rubocop.yml" },
    { "id": "test", "name": "rspec", "run": "bundle exec rspec" }
  ],
  "diffExclude": ["db/schema.rb"],
  "enforcers": { "rubocop": { "list": "ruby scripts/kit/rubocop-cops.rb", "describe": "an enabled RuboCop cop" } }
}
```

- `setup` commands run once per CI job, before any check, through `node scripts/kit/checks.mjs setup`. They are also the cloud-agent install command.
- Each check has an `id` (lowercase, digits and hyphens; it becomes the CI job name `check (<id>)` and the `ci:<id>` enforcer in AGENTS.md), a `run` shell command executed from the project directory, and optionally `name`, `events` (for example `["pull_request"]`), `requires` (a path or list; the check is skipped with a notice until one exists) and `artifacts`.
- Files load in this order: `core.json`, adapter files alphabetically, then the project's own `local.json`. A later check with the same `id` replaces the earlier one, and `{ "id": "...", "disabled": true }` removes it. Projects override adapter checks in `local.json`, never by editing the managed file.
- `diffExclude` globs are added to the diff-limit check's exclusions (generated files the stack produces).
- `enforcers` add a kind of AGENTS.md rule-table token. `list` is a command that prints a JSON array of valid names. With the example above, a row enforced by `` `rubocop:Style/FrozenStringLiteralComment` `` passes only if that cop is enabled. The workers adapter uses this for `lint:<eslint-rule>`.

Use the plain commands the stack already has. A check is a shell command any CI can run, so it must not depend on GitHub Actions features.

## Guard rule pack

```js
// .cursor/hooks/pstack-kit-guard.rules/rails.mjs
export const RULES = [
  { id: "deploy-rails", why: "Deploys are human-owned.", re: [/\bcap\s+production\s+deploy\b/, /\bkamal\s+deploy\b/] },
  { id: "remote-data", why: "Production data is real data.", re: [/\bRAILS_ENV=production\b[^\n]*\bdb:(migrate|seed|drop|reset)\b/] },
];
export const MCP_RULES = [];
```

- The core guard loads every `*.mjs` file in that directory, in name order, after its own rules. The first match denies.
- Each rule has a unique `id` (`check-agents-rules.mjs` resolves `hook:<id>` against core and pack ids), a `why`, the `re` list, and optionally a `fix` hint for the agent. MCP rules match `server` and `tool` regexes.
- Packs only add denials. They cannot allow what the core denies.
- Add a test for every pattern, blocked and allowed. See the workers cases in `test/template-scripts.test.mjs`.

## Verification driver

The core harness (`control.mjs`) owns runs, doctor, journeys, evidence and cleanup. A driver owns the stack-specific parts. Set `"driver": "driver.mjs"` in the seeded `verify.config.json`, and export a default object:

```js
export default {
  name: "rails (bin/rails server)",
  logName: "rails.log",
  async prepare(ctx) {},            // before launch: create a disposable database, migrate, seed
  launch(ctx) {},                   // spawn the app detached, logging to ctx.run.log; return the ChildProcess
  async doctor(ctx) { return []; }, // extra read-only checks: [{ name, ok, detail }]
  steps: {},                        // extra journey step kinds: { sql: (ctx, args) => result }
  commands: {},                     // extra CLI commands: { sql: { usage, run(ctx, positional, flags) } }
  async cleanup(ctx) {},            // after the process is stopped: drop what prepare created
};
```

`ctx` gives `config` (the whole `verify.config.json`; put stack settings under a key named after the adapter), `run` (`runId`, `runDir`, `port`, `baseUrl`, `log`; mutate it to persist state between commands), `vars` (the journey variables), `projectRoot`, `skillDir`, `env`, and helpers: `request(method, path, opts)`, `runCommand(cmd, opts)`, `render(value, vars)`, `parseMaybeJson`, `subsetMismatch`, `record(entry)` and `UsageError`.

Rules for drivers:

- Everything stays local and disposable. Each run gets its own state under `run.runDir`, so two runs can live side by side. Never point a driver at a shared or remote resource.
- `launch` must start the process `detached` so `stop` can kill exactly its process group. The harness records the start time and refuses to kill a process it did not start.
- Step results are plain objects whose fields `expect` can compare (`rows`, `value`, `status`...). Document every step and command in `DRIVER.md`.
- If the stack needs no special launch, skip the driver: a `launch` command and a `ready` step in `verify.config.json` are enough.

## AGENTS.md fragments

`agents/*.md` files are rendered into the seeded `AGENTS.md`. Without an adapter, the core's defaults in `core/agents/` are used. With several adapters, their fragments are concatenated.

| Fragment | Goes |
|---|---|
| `summary.md` | The opening paragraph ("{{!projectName}} is a ...") |
| `map.md` | Rows prepended to the Map table (`| path | what lives there |`) |
| `commands.md` | Prose and a code block after the core commands |
| `rules.md` | Rows prepended to the Rules table. Every row needs a real enforcer: `ci:<check-id>`, `hook:<rule-id>`, a path, or one of your `enforcers` kinds |
| `autonomy.md` | Inline text after "The policy is `.cursor/rules/autonomy.mdc`" |

`AGENTS.md` is a seed, so fragments only shape new adoptions. Existing projects merge by hand.

## Checklist for a new adapter

1. A reference project under `examples/<name>` with the adapter applied, whose `node scripts/kit/checks.mjs run --all` passes, including a verification smoke that reads state back.
2. Tests: guard patterns, any parser the driver has, and the checks file loads (`test/template-scripts.test.mjs`). Add the example to `.github/workflows/kit.yml`'s in-sync job.
3. `adapters/<name>/README.md`: scaffold, toolchain, the project files to wire up, and how to tailor the verification skill.
4. A row in the root README's adapter table.
5. No change to `core/` to make the adapter work. If the core is missing a hook, add a stack-neutral one in its own PR, with a core-only test.
