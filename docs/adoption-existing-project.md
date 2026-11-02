# Adopting the kit in an existing Worker

Existing projects adopt the kit in phases, so each step pays for itself before the next one adds process. Phases 0 to 2 install files and map to `pstack-kit apply --phase`. Phases 3 to 5 change how the team works and install nothing. Do not skip ahead: every later phase depends on the verification skill from phase 1.

Before you start, pick one owner for the project's adoption and one Worker to go first. A well-tested internal Worker is the best pilot.

## Phase 0: pilot (`--phase 0`)

Goal: try pstack on real work with the guardrails on and nothing else changed.

```bash
npx --yes github:<org>/pstack-kit#v0.1.0 apply --target . --phase 0 --write
```

This adds `autonomy.mdc`, `pstack-models.mdc`, the hook guard and `.cursor/settings.json`. The build, CI and review process are untouched.

- Two or three engineers use `/poteto-mode` on real bugs and small features, and the read-only skills (`/how`, `/why`, `/teach`, `/recall`) for investigation and onboarding.
- Record a baseline from the last two months, before the pilot changes anything: PR cycle time, review time, first-pass merge rate, reverts, and Cursor usage spend. You need these numbers to decide on phase 5.
- Exit when the pilot engineers agree pstack helps on this codebase, or decide it does not and stop.

## Phase 1: make it verifiable (`--phase 1`)

Goal: an agent can start the Worker from empty and prove a change on it.

```bash
npx --yes github:<org>/pstack-kit#v0.1.0 apply --target . --phase 1 --owners "@<org>/<team>" --write
```

This adds the verification skill draft, the cloud-agent environment, `tsconfig.kit.json`, the CI workflow, the PR template, CODEOWNERS and the diff-limit script. If the repo already has a CODEOWNERS file, the kit leaves it alone.

1. **Fix "doesn't start from empty".** `wrangler dev --local` must start with only `npm ci` and the files in the repo. Typical fixes: commit the D1 migrations, replace a dependency on a remote binding with a local one, move required secrets into `.dev.vars.example` with dev-only values.
2. **Add Vitest in `workerd`** if the project has no tests, using `@cloudflare/vitest-plugin` as in the example. Before refactoring anything, add characterization tests for current behavior.
3. **Tighten TypeScript in steps.** Extend `tsconfig.kit.json` from your `tsconfig.json`. If the error count is large, override the noisiest flags in your own `tsconfig.json` for now and remove one override per PR.
4. **Tailor the verification skill** exactly as in step 6 of the [new-project guide](adoption-new-project.md#6-make-the-verification-skill-real), and run the smoke once end to end.
5. **CI.** The kit's workflow sits next to your existing one. Once its jobs pass, make them required (see [github-settings.md](github-settings.md)) and remove what your old workflow duplicates.
6. **Engineer bot.** Set it up now ([engineer-bot.md](engineer-bot.md)). A verification skill nobody maintains goes stale within weeks.

Exit when `npm run verify:smoke` passes in CI on every PR and the engineer bot has run for a week.

## Phase 2: encode the garden (`--phase 2`)

Goal: turn what reviewers keep repeating into checks.

```bash
npx --yes github:<org>/pstack-kit#v0.1.0 apply --target . --write
```

This adds `AGENTS.md` (only if you do not have one), `workers.mdc`, `eslint.workers.js`, the rule-table and plan checks, and `docs/plans/`.

1. Wire `eslint.workers.js` into your ESLint config. Fix the violations it finds, or scope it down with `files`/`ignores` and record the gap as a plan.
2. If you already had an `AGENTS.md`, merge the kit's sections into it by hand: the Map, Commands, Autonomy and the Rules table. The kit's version is in `template/files/AGENTS.md`. Keep it near 100 lines.
3. Run `/correct` over the last one or two months of review comments and reverts. Every repeated correction becomes a type, a lint rule, a CI check or a test, and a row in the Rules table.
4. Start using the PR template and the diff-limit warning. Track how often lint and tests catch what reviewers used to catch.

Exit when the Rules table has no more than one or two `docs-only` rows and reviewers stop leaving the same comments.

## Phase 3: parallelize under supervision

No kit change. Agents take small queues of work in parallel (`/poteto-mode` with the autopilot-stack shape: agents build and verify a stack of PRs, a human lands each one). Overnight runs on migrations leave decision logs (`/show-me-your-work`). Contested changes get `/interrogate`. A human still merges every PR; the hook guard and branch protection make sure of it.

## Phase 4: outer loop (future)

Deferred, for every project. When the team decides to start it: a Slack feedback channel feeds Linear triage, an agent reproduces each issue with the verification skill, and opens a draft PR with evidence. A Cursor Project holds each standing program of work.

## Phase 5: selective autonomy

Only after reviewing the phase 0 baseline against current numbers. Autonomy is set per repository class. Internal, low-risk repos with strong verification might allow more; client and production-critical repos keep human merge and human deploy. Changing any of the team's locked decisions (human merge, the always-pause list) is a team decision recorded in this repo, not a per-project setting.

## Keeping up to date

Re-run `apply` with a newer kit tag whenever the kit releases. It updates managed files you have not edited, never touches seeded files, and stages conflicts in `.pstack-kit/incoming/`. `status` exits 1 while anything is pending, so a scheduled CI job or the engineer bot can flag drift.
