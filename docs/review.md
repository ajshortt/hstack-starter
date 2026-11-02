# Evidence-first review

Agents produce PRs faster than people can read every line of them. The kit moves the reviewer's attention to where it pays off: first check that the change is proven, then read the risky parts in full, then sample the rest. A human still approves and merges every PR.

## The author's side (agent or human)

Every PR fills in the four sections of `.github/pull_request_template.md`:

| Section | What it must contain |
|---|---|
| **Goal** | Who this is for and what changes for them, with the Linear issue and the plan if there is one |
| **Evidence** | Proof on the running Worker: the verification skill's `summary.md` table, the journeys driven, read-backs of the changed state (D1 rows, KV values, R2 objects, logs), and the evidence directory or CI artifact. "Tests pass" is not evidence. |
| **Risk** | Ticked areas (wrangler config, migrations, Durable Objects, queues, auth and parsing, agent policy), what could break, how we would notice, and how to roll back |
| **Diff size** | Changed lines from the CI check, and a reason if it is over the limit |

## The reviewer's side

1. **Evidence.** Does it prove the Goal? It should exercise the real path (no test-only routes), capture the resulting state, and poll async side effects instead of trusting a `202`. Open the `verify-evidence-<project>` CI artifact when the summary is not enough. If the evidence is missing or does not prove the goal, stop and request changes; do not read the code yet.
2. **CI.** Typecheck, lint, tests and the smoke job are green. The diff-limit job's summary shows the size.
3. **Risky areas, in full.** Read every file in a ticked Risk area, plus anything the Risk section does not tick but the diff touches: `wrangler.jsonc`, `migrations/`, Durable Object classes, queue consumers, input parsing and auth, and agent policy (`AGENTS.md`, `.cursor/`, `.github/`, `scripts/kit/`). CODEOWNERS routes agent-policy changes to the project owners.
4. **Sample the rest.** Read at least one complete change path end to end (route to storage, for example), and the tests added. If the sample turns up a real problem, read everything.
5. **Merge** after approving, and run any deploy, secret or DNS steps listed under Human gates yourself.

When a review comment repeats something reviewers have said before, do not just leave the comment: run `/correct` so a type, lint rule, CI check or test catches it next time, and add a row to the AGENTS.md rule table.

## The diff limit

About **400 changed lines** per PR, counting additions plus deletions. `scripts/kit/diff-limit.mjs` runs in CI on every PR. It warns and does not fail, because a few PRs (a generated migration, a large rename) are legitimately bigger.

- Lockfiles, `worker-configuration.d.ts`, snapshots, `vendor/` and files marked `linguist-generated` in `.gitattributes` are excluded.
- The job adds a warning annotation and a table of the largest files to the run summary when a PR is over the limit.
- Change the limit or add exclusions in `.pstack-kit/config.json` under `diffLimit` (`lines`, `exclude`). The script reads it on every run.
- Above the limit, the author explains why in the PR, or splits it into stacked PRs. A plan in `docs/plans/` should already have sized tasks to fit.
- To make it blocking, add `--fail` to the job's command. The team has decided against this for now.

## What reviewers should push back on

- Evidence that only shows status codes, or only tests.
- A PR that changes behavior with no new or changed smoke journey or feature-map entry.
- A ticked "None of the areas below" when the diff touches one of them.
- Silent edits to agent policy files inside an unrelated change.
- Several unrelated changes in one PR, whatever its size.
