# Adopting the kit in an existing project

Existing projects adopt the kit in phases, so each step pays for itself before the next one adds process. Phases 0 to 2 install files and map to `pstack-kit apply --phase`. Phases 3 to 5 change how the team works and install nothing. Do not skip ahead: every later phase depends on the verification skill from phase 1.

Before you start, pick one owner for the project's adoption and one project to go first. A well-tested internal service is the best pilot. The steps are the same for any stack. If an adapter fits it, pass `--adapter <name>` on every `apply` and follow the adapter README's notes per phase (for Cloudflare Workers: [adapters/workers](../adapters/workers/README.md#existing-worker)). The project only needs Node.js 22+ available to run the kit.

## Phase 0: pilot (`--phase 0`)

Goal: try pstack on real work with the guardrails on and nothing else changed. Sign in to the private Origin repo first ([README](../README.md#apply-or-update)).

```bash
npx --yes git+https://origin.cursor.com/hugeinc/pstack-kit.git#v0.2.0 apply --target . --phase 0 --write
```

This adds `autonomy.mdc`, `pstack-models.mdc`, the hook guard and `.cursor/settings.json` (plus the adapter's autonomy rule and guard rules, if you chose one). The build, CI and review process are untouched.

- Two or three engineers use `/poteto-mode` on real bugs and small features, and the read-only skills (`/how`, `/why`, `/teach`, `/recall`) for investigation and onboarding.
- Record a baseline from the last two months, before the pilot changes anything: PR cycle time, review time, first-pass merge rate, reverts, and Cursor usage spend. You need these numbers to decide on phase 5.
- Exit when the pilot engineers agree pstack helps on this codebase, or decide it does not and stop.

## Phase 1: make it verifiable (`--phase 1`)

Goal: an agent can start the project from empty and prove a change on it.

```bash
npx --yes git+https://origin.cursor.com/hugeinc/pstack-kit.git#v0.2.0 apply --target . --phase 1 --owners "@hugeinc/REPLACE-WITH-TEAM" --write
```

This adds the verification skill draft, the cloud-agent environment, the check runner and core checks, the CI wrapper, the PR template, CODEOWNERS and the diff-limit check (plus the adapter's driver, checks and config files). If the repo already has a CODEOWNERS file, the kit leaves it alone. `@hugeinc/REPLACE-WITH-TEAM` is a placeholder, not a real team: pass the team's actual handle.

1. **Fix "doesn't start from empty".** The app must start with only the setup commands and the files in the repo: no shared database, no remote service that only exists in staging, no secret a new machine lacks. Typical fixes: commit migrations and seed data, swap a remote dependency for a local or containerised one, and put dev-only values in an example env file.
2. **Register the existing build, lint and test commands as checks** in `.pstack-kit/checks/local.json` ([new-project guide, step 2](adoption-new-project.md#2-tell-the-checks-how-to-build-and-test)). If the project has no tests, add characterization tests for current behavior before refactoring anything.
3. **Tighten static checks in steps.** Turn on the stricter compiler or linter settings you want, override the noisiest ones for now, and remove one override per PR.
4. **Tailor the verification skill** as in steps 3 and 4 of the [new-project guide](adoption-new-project.md#3-tell-the-verification-skill-how-to-run-the-app), and run the smoke once end to end.
5. **CI.** The kit's `pstack-kit.yml` wrapper sits next to your existing workflow, or call `node scripts/kit/checks.mjs` from your existing CI instead. Once the checks pass, make them required (see [github-settings.md](github-settings.md)) and remove what your old pipeline duplicates.
6. **Engineer bot.** Set it up now ([engineer-bot.md](engineer-bot.md)). A verification skill nobody maintains goes stale within weeks.

Exit when the `verify-smoke` check passes in CI on every PR and the engineer bot has run for a week.

## Phase 2: encode the garden (`--phase 2`)

Goal: turn what reviewers keep repeating into checks.

```bash
npx --yes git+https://origin.cursor.com/hugeinc/pstack-kit.git#v0.2.0 apply --target . --write
```

This adds `AGENTS.md` (only if you do not have one), the rule-table and plan checks, and `docs/plans/` (plus the adapter's stack rules and lint preset).

1. If you already had an `AGENTS.md`, merge the kit's sections into it by hand: the Map, Commands, Autonomy and the Rules table. The kit's version is `core/files/AGENTS.md`, plus the adapter's `agents/` fragments. Keep it near 100 lines.
2. Run `/correct` over the last one or two months of review comments and reverts. Every repeated correction becomes a type, a lint rule, a CI check or a test, and a row in the Rules table.
3. Start using the PR template and the diff-limit warning. Track how often lint and tests catch what reviewers used to catch.

Exit when the Rules table has no more than one or two `docs-only` rows and reviewers stop leaving the same comments.

## Phase 3: parallelize under supervision

No kit change. Agents take small queues of work in parallel (`/poteto-mode` with the autopilot-stack shape: agents build and verify a stack of PRs, a human lands each one). Overnight runs on migrations leave decision logs (`/show-me-your-work`). Contested changes get `/interrogate`. A human still merges every PR; the hook guard and branch protection make sure of it.

## Phase 4: outer loop (future)

Deferred, for every project. When the team decides to start it: a Slack feedback channel feeds Linear triage, an agent reproduces each issue with the verification skill, and opens a draft PR with evidence. A Cursor Project holds each standing program of work.

## Phase 5: selective autonomy

Only after reviewing the phase 0 baseline against current numbers. Autonomy is set per repository class. Internal, low-risk repos with strong verification might allow more; client and production-critical repos keep human merge and human deploy. Changing any of the team's locked decisions (human merge, the always-pause list) is a team decision recorded in this repo, not a per-project setting.

## Keeping up to date

Re-run `apply` with a newer kit tag whenever the kit releases. Your adapter choice is remembered in `.pstack-kit/config.json`. A project adopted with kit 0.1 (Workers-only) must pass `--adapter workers` or `--adapter none` on its first 0.2 apply; the migration steps are in the [workers adapter README](../adapters/workers/README.md#upgrading-a-project-adopted-with-kit-01). It updates managed files you have not edited, never touches seeded files, and stages conflicts in `.pstack-kit/incoming/`. `status` exits 1 while anything is pending, so a scheduled CI job or the engineer bot can flag drift.
