# CI

Checks run on GitHub Actions. The kit is [ajshortt/hstack-starter](https://github.com/ajshortt/hstack-starter). A project that adopts the kit gets the same kind of workflow. The commands underneath it need only Node.js 22+ and `sh`, so another CI system can run them the same way.

## This repository

[`.github/workflows/kit.yml`](../.github/workflows/kit.yml) runs on every pull request and on every push to `main`:

| Job | What it runs |
|---|---|
| kit tests | `npm test` |
| vendored pstack matches the pin | `node scripts/vendor-pstack.mjs check`. A pull request that touches `vendor/` or `.cursor-plugin/` also passes `--require-approval`. |
| example matches core + adapter | `node bin/hstack-kit.mjs status` for `examples/shortlinks` (workers) and `examples/react-counter` (react) |

[`.github/workflows/hstack-kit-shortlinks.yml`](../.github/workflows/hstack-kit-shortlinks.yml) and [`.github/workflows/hstack-kit-react-counter.yml`](../.github/workflows/hstack-kit-react-counter.yml) run that example's checks when the example, its workflow, or the workspace manifest and lockfiles change. Each check is a job named `check (<project> <id>)`.

The same commands run locally: `npm test` at the repo root, and `node scripts/kit/checks.mjs run --all` in an example. Branch protection is in [github-settings.md](github-settings.md).

## CI for a project: one runner, any CI

A project's checks are defined in `.hstack-kit/checks/*.json` and run by `scripts/kit/checks.mjs`, which needs only Node.js 22+ and `sh`. Any CI system runs them the same way:

```bash
node scripts/kit/checks.mjs setup                     # once per job: install what the checks need
node scripts/kit/checks.mjs list --json --event pull_request   # the check ids for this event
node scripts/kit/checks.mjs run <id>                  # one check per job, or run --all in a single job
```

`run` exits 1 when a check fails and prints `::group::` markers under GitHub Actions. The verification smoke writes `.verify/evidence/<run-id>/summary.md`; collect `.verify/evidence/` as an artifact. The diff-limit check needs the base branch fetched (`fetch-depth: 0`, which the shipped workflow sets, or `git fetch origin main` from the git remote). It skips with a message when the base ref is missing.

`.github/workflows/hstack-kit.yml` is the kit's GitHub Actions wrapper. The workflow is named `hstack-kit-<project>`. A `plan (<project>)` job lists the checks for the event, and a matrix job runs each as `check (<project> <id>)`, so an api target and a web target in one repo do not publish the same check name. For a nested project the path filters also include the root manifest, lockfile, `turbo.json`, `tsconfig*` and `extraPaths` from `.hstack-kit/config.json`. `setup` runs `checks.mjs install` when an adapter defines it, and that command uses the lockfile in the project or a parent up to the git root. For GitLab CI, Buildkite, CircleCI or Jenkins, write the same three commands in that system's format. The kit ships only the GitHub Actions wrapper.

## After checks exist

On GitHub, require those `check (<project> <id>)` jobs and one human approval. The settings are in [github-settings.md](github-settings.md).
