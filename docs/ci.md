# CI on Origin

The workflows in `.github/workflows/` are GitHub Actions files. **Origin does not run them.** This repo is hosted on Origin (`mirrorStatus: no-mirror`, no GitHub repository behind it), so a push to `main` does not start `kit.yml` or `hstack-kit-shortlinks.yml`. No Origin ruleset requires a check. This session could not list check suites: the public checks API rejects the agent token. There are no pull requests for a check to appear on.

Checked on 2026-11-02 against [hugeinc/pstack-kit](https://cursor.com/codebase/hugeinc/pstack-kit):

| Check | Result |
|---|---|
| `origin repo view --json mirrorStatus,githubNodeId` | `no-mirror`, `githubNodeId: null`. GitHub is not in the path, so GitHub Actions has nowhere to run. |
| `origin pr list` | No pull requests, so no checks UI. |
| `origin ruleset list` | No rulesets. Nothing is a required check. |
| Workflow files | Present only as files in the repo. |

Until one of the setups below is in place, the same commands run locally: `npm test` at the repo root, and `node scripts/kit/checks.mjs run --all` in `examples/shortlinks`.

## CI for projects: one runner, any CI

A project's checks are defined in `.hstack-kit/checks/*.json` and run by `scripts/kit/checks.mjs`, which needs only Node.js 22+ and `sh`. Any CI system runs them the same way:

```bash
node scripts/kit/checks.mjs setup                     # once per job: install what the checks need
node scripts/kit/checks.mjs list --json --event pull_request   # the check ids for this event
node scripts/kit/checks.mjs run <id>                  # one check per job, or run --all in a single job
```

`run` exits 1 when a check fails and prints `::group::` markers under GitHub Actions. The verification smoke writes `.verify/evidence/<run-id>/summary.md`; collect `.verify/evidence/` as an artifact. The diff-limit check needs the base branch fetched (`fetch-depth: 0` or `git fetch origin main`), and skips with a message when the base ref is missing.

`.github/workflows/hstack-kit.yml` is the kit's GitHub Actions wrapper: a `plan` job lists the checks for the event, and a matrix job runs each as `check (<id>)`. For GitLab CI, Buildkite, CircleCI or Jenkins, write the same three commands in that system's format. The kit ships only the GitHub Actions wrapper.

## What runs the workflows

Cursor's CI apps for Origin are [Depot](https://depot.dev/docs/ci/integrations/origin) and [Buildkite](https://buildkite.com/resources/changelog/392-buildkite-is-a-cursor-origin-launch-partner/). Both can run GitHub Actions workflow syntax. Origin itself has no workflow runner. Connecting an app is done by someone with access to the hugeinc codebase settings. A commit cannot turn it on. Whether Depot or Buildkite is already installed was not visible from this session.

### Depot

Depot receives push and pull request events from Origin directly. It does not execute `.github/workflows/` in place. A migrate step copies them to `.depot/workflows/`, and they start only after that directory is on the default branch.

1. Open the Depot app from the hugeinc codebase (or from this repo's Apps tab) and install it on `hugeinc/pstack-kit`.
2. Install the Depot CLI, run `depot login`, and select that Depot organization.
3. From a checkout of this repo, run `depot ci migrate --forge=origin`. Review the Origin compatibility findings. These workflows use `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact`, and they read `github.event_name` and `github.base_ref`. They do not call the GitHub release, code scanning, or dependency snapshot APIs.
4. Run `depot ci migrate secrets-and-vars --forge=origin` only if a later workflow grows secrets. The current workflows need none: no cloud credentials, `contents: read` only.
5. Commit `.depot/workflows/` and merge it to `main`.
6. Confirm a run with `depot ci run list`. The jobs show up on the Origin commit and on pull requests.

### Buildkite

1. Install Buildkite from the Origin marketplace and grant it `hugeinc/pstack-kit`.
2. Create a pipeline whose repository is this Origin repo. Hosted agents check out private Origin repos with short-lived read credentials.
3. Point the pipeline at the existing workflows, or at a native Buildkite pipeline that runs the same commands (`npm test`, then `node scripts/kit/checks.mjs setup` and `run --all` in `examples/shortlinks`).
4. Pushes, pull requests, and tags trigger builds, and Buildkite publishes the checks back to Origin.

## After checks exist

Add an Origin ruleset (`origin ruleset`) on `main` that requires those checks and one human approval. The kit's GitHub branch-protection notes in [github-settings.md](github-settings.md) are for a project repo that lives on GitHub. This repo does not.

A project that adopts the kit and is itself Origin-hosted has the same gap: `hstack-kit.yml` sits in the repo and runs only after that project connects Depot or Buildkite. A project mirrored from GitHub keeps GitHub as the source of truth, and GitHub Actions runs `.github/workflows/` there without Depot.
