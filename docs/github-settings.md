# GitHub settings for a kit project

These settings are for a project repo whose source of truth is GitHub. The kit itself lives on Origin, and Origin does not run the workflows it ships. What has to be connected for `hugeinc/pstack-kit` is in [ci.md](ci.md). A project hosted on Origin uses an Origin ruleset the same way, once Depot or Buildkite is posting checks.

The hook guard stops agents from running merge, deploy and secret commands, but hooks can be bypassed by anything outside Cursor. The forge is the real merge boundary. Configure these once per repository; an org admin can apply them to every kit repo with a ruleset.

## Branch protection (or a ruleset) on the default branch

- Require a pull request before merging.
- Require **1 approval** from someone other than the last pusher. Dismiss stale approvals when new commits are pushed.
- Require review from **Code Owners**. The kit's `CODEOWNERS` routes `AGENTS.md`, `.cursor/`, `.pstack-kit/`, `scripts/kit/` and `.github/` to the project owners.
- Require status checks to pass, and require branches to be up to date. Required checks come from `.github/workflows/pstack-kit*.yml`, one job per check, named `check (<id>)`. `node scripts/kit/checks.mjs list --event pull_request` prints the ids. Every project has:
  - `check (agents-rules)`, `check (plans)` and `check (verify-smoke)`
  - `check (diff-limit)`. It only warns, but requiring it guarantees the size report exists.
  - plus one per check in `.pstack-kit/checks/local.json` and in adapter files (the workers adapter adds `check (typecheck)`, `check (lint)` and `check (test)`).
- When you add, rename or disable a check, update the required list in the same PR, or merges block on a check that never runs.
- Block force pushes and deletions.
- Do not let bot accounts or the engineer bot bypass the rules. Do not enable auto-merge for bots.

## Accounts and tokens

- Agents and the engineer bot open PRs with their own identity (the Cursor GitHub app, or the bot's account). They have write access to push branches, but cannot approve or merge because of the rules above.
- No production or cloud credentials in GitHub Actions secrets for these workflows. The kit's checks and verification smoke run against local, disposable instances.
- Deploys stay in a separate, human-triggered workflow or a human's terminal, with a token scoped to that project. That workflow should use a GitHub environment with required reviewers.

## Labels and settings that help

- Turn on "Automatically delete head branches".
- Add `linguist-generated=true` in `.gitattributes` for generated files you want excluded from the diff limit.
- Keep Actions permissions at read-only by default. The kit's workflows only need `contents: read`.
