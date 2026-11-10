# Adopting the kit in a new project

A new project takes the whole kit (phase 2) on day one. Getting from an empty repo to a first verified PR means applying the kit, telling it how to check and run your project, tailoring the verification skill, and setting up the engineer bot. Any language or framework works. If an adapter exists for your stack, it does steps 2 and 3 for you; see its README (for Cloudflare Workers, [adapters/workers](../adapters/workers/README.md), with [`examples/shortlinks`](../examples/shortlinks) as the finished result; for React on Vite, [adapters/react](../adapters/react/README.md), with [`examples/react-counter`](../examples/react-counter)).

You need Node.js 22+ on the machines and CI runners that run the kit, and a POSIX shell. Your project does not need to be a Node project.

## 1. Apply the kit

Sign in to GitHub once, as in the [README](../README.md#apply-or-update), then from the project root:

```bash
KIT=git+https://github.com/ajshortt/hstack-starter.git#v0.3.2
npx --yes $KIT apply --target . --owners "@your-org/your-team"           # dry run
npx --yes $KIT apply --target . --owners "@your-org/your-team" --write
```

Add `--adapter <name>` if one fits your stack (`npx --yes $KIT adapters` lists them). Add `--with shaping` on the same command to copy the shaping skills (`grilling`, `grill-me`, and the rest of the adopted set) into the git root `.cursor/skills/`. Leave it off and the project does not get them. The choice is remembered like an adapter. `@your-org/your-team` is a placeholder, not a real team. Put the team's actual handle there before you turn on required code owner review.

## 2. Tell the checks how to build and test

The core ships the checks every project has: the AGENTS.md rule table, plans, the verification smoke and the diff limit. Add your stack's commands in `.hstack-kit/checks/local.json`. That file is yours; the kit never touches it.

```json
{
  "setup": ["python -m pip install -r requirements-dev.txt"],
  "checks": [
    { "id": "lint", "name": "ruff", "run": "ruff check ." },
    { "id": "typecheck", "name": "mypy", "run": "mypy ." },
    { "id": "test", "name": "pytest", "run": "pytest -q" }
  ]
}
```

Run them the way CI will:

```bash
node scripts/kit/checks.mjs setup
node scripts/kit/checks.mjs list
node scripts/kit/checks.mjs run --all
```

`setup` is also the cloud agent's install command (`.cursor/environment.json`). If a toolchain is not on the runner image (a specific Python, Go or Ruby), install it in `setup` or in your CI's runner configuration. The check format and override rules are in [adapters/README.md](../adapters/README.md#checks-hstack-kitchecksnamejson).

## 3. Tell the verification skill how to run the app

Open `.cursor/skills/verify-<project>/verify.config.json`. For anything with a long-lived process (a web app, an API, a worker), set the launch command and a ready step that proves the app can reach its data, not only that a port is open:

```json
{
  "app": "billing",
  "launch": { "command": "uvicorn billing.app:app --port {{port}}", "env": { "DATABASE_URL": "sqlite:///{{runDir}}/db.sqlite" }, "timeoutMs": 60000 },
  "ready": { "request": { "path": "/health" }, "expect": { "status": 200, "json": { "ok": true } } },
  "doctor": [{ "name": "migrations applied", "run": { "command": "alembic current" }, "expect": { "exitCode": 0, "stdout": "$match:head" } }],
  "smoke": "smoke.json"
}
```

The harness picks a free port per run, so `{{port}}`, `{{runDir}}` and `{{runId}}` keep parallel runs apart. For a library or CLI, leave `launch` and `ready` out and drive it with `run` steps. Then remove `"_template": true`.

## 4. Make the verification skill real

1. In Cursor, run `/create-verification-skill` and say: "Extend the existing `.cursor/skills/verify-<project>/`. Keep `control.mjs`. Fill `verify.config.json`, `smoke.json` and `features/` from this repo."
2. Check what it produced: seed or fixture data the app starts from, doctor probes that prove it loaded, one feature file per entry point (route, command, job, consumer), and at least one smoke journey per feature that reads the changed state back.
3. Run `node .cursor/skills/verify-<project>/control.mjs smoke`. It must pass from a clean checkout, leave no process behind, and write `.verify/evidence/<run-id>/summary.md`.

## 5. Tailor `AGENTS.md`

Replace the placeholder sentences: what the project is, its map, the Linear team and project, the Notion space, the Slack channels. Keep it near 100 lines. Keep the rule table, and only add a rule when you can name its enforcer: a check (`ci:lint`), a guard rule (`hook:deploy`), a file, or an adapter enforcer kind. `node scripts/kit/check-agents-rules.mjs` tells you when an enforcer is missing.

## 6. Configure the forge and Cursor

- Push, connect CI as described in [ci.md](ci.md), then turn on branch protection as described in [github-settings.md](github-settings.md). The required checks are the `check (<id>)` jobs of `.github/workflows/hstack-kit.yml`, one per check in `node scripts/kit/checks.mjs list`.
- Make sure the team marketplace with pstack set to **Required** is in place ([pstack-upgrades.md](pstack-upgrades.md#how-the-pin-is-enforced)). The kit's `.cursor/settings.json` already enables pstack for the repo.
- Open the repo in a Cursor cloud agent once. The kit's `.cursor/environment.json` runs `node scripts/kit/checks.mjs setup`. Ask the agent to run `node scripts/kit/checks.mjs run --all`, and snapshot the environment once it passes.

## 7. Set up the engineer bot

Follow [engineer-bot.md](engineer-bot.md). Its first job is a `/maintain-verification-skill` pass on the skill you just tailored.

## Done means

- `node scripts/kit/checks.mjs run --all` passes locally and in CI on the first PR.
- The first PR's description includes the smoke `summary.md` table.
- `npx --yes $KIT status --target .` prints `Up to date.`
- The engineer bot's daily routine is scheduled.
