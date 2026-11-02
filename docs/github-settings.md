# GitHub settings for a kit project

These settings are for a Worker repo whose source of truth is GitHub. The kit itself lives on Origin, and Origin does not run the workflows it ships. What has to be connected for `hugeinc/pstack-kit` is in [ci.md](ci.md). A project hosted on Origin uses an Origin ruleset the same way, once Depot or Buildkite is posting checks.

The hook guard stops agents from running merge, deploy and secret commands, but hooks can be bypassed by anything outside Cursor. The forge is the real merge boundary. Configure these once per repository; an org admin can apply them to every Workers repo with a ruleset.

## Branch protection (or a ruleset) on the default branch

- Require a pull request before merging.
- Require **1 approval** from someone other than the last pusher. Dismiss stale approvals when new commits are pushed.
- Require review from **Code Owners**. The kit's `CODEOWNERS` routes `AGENTS.md`, `.cursor/`, `.pstack-kit/`, `scripts/kit/` and `.github/` to the project owners.
- Require status checks to pass, and require branches to be up to date. Required checks, from `.github/workflows/worker-ci*.yml`:
  - `typecheck (strict tsc + wrangler types --check)`
  - `lint (eslint + agent rules + plans)`
  - `test (vitest in workerd)`
  - `verify-smoke (wrangler dev --local + verification skill)`
  - `diff-limit (warn above review limit)`. It only warns, but requiring it guarantees the size report exists.
- Block force pushes and deletions.
- Do not let bot accounts or the engineer bot bypass the rules. Do not enable auto-merge for bots.

## Accounts and tokens

- Agents and the engineer bot open PRs with their own identity (the Cursor GitHub app, or the bot's account). They have write access to push branches, but cannot approve or merge because of the rules above.
- No Cloudflare API token in GitHub Actions secrets for these workflows. The kit's CI runs everything locally under `wrangler dev --local` and `workerd`.
- Deploys stay in a separate, human-triggered workflow or a human's terminal, with a token scoped to that Worker. That workflow should use a GitHub environment with required reviewers.

## Labels and settings that help

- Turn on "Automatically delete head branches".
- Add `linguist-generated=true` in `.gitattributes` for generated files you want excluded from the diff limit.
- Keep Actions permissions at read-only by default. The kit's workflows only need `contents: read`.
