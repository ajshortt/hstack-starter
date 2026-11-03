# AGENTS.md: {{projectName}}

<!-- Seeded by hstack-kit. This file is yours: edit it, and keep it near 100 lines. It is a map, not a manual. -->

{{agentsSummary}}

## Map

| Path | What lives there |
|---|---|{{agentsMap}}
| `.cursor/skills/{{verifySkill}}/` | Verification skill: how to start, check and drive the app, smoke journeys, feature map |
| `.cursor/rules/` | Agent rules. `autonomy*.mdc` and `pstack-models.mdc` are managed by hstack-kit |
| `docs/plans/` | Plans for multi-PR work, with their lifecycle |
| `.hstack-kit/checks/` | The checks CI runs. Add yours to `local.json` |
| `scripts/kit/` | Check runner and the kit's checks: diff limit, this file's rule table, plans |
| `.hstack-kit/` | Kit config and lock. Run the kit's `apply` command to update managed files |

## Commands

Run these before you say a change is done. CI runs the same checks through the same runner.

```bash
node scripts/kit/checks.mjs setup                                # install what the checks need
node scripts/kit/checks.mjs list                                 # every check, and where it is defined
node scripts/kit/checks.mjs run --all                            # all of them; or name one: run <id>
node .cursor/skills/{{verifySkill}}/control.mjs smoke            # verification smoke, evidence in .verify/evidence/
```
{{agentsCommands}}
To drive the app by hand, read `.cursor/skills/{{verifySkill}}/SKILL.md` and its `features/README.md` first.

## How we work

- Use `/poteto-mode` (pstack {{pstackVersion}}) for anything that needs rigor: bugs, features, refactors, investigations. Skip it for one-line edits.
- First message on a task: restate the goal in your own words and name the smallest change that meets it.
- Bugs: reproduce first with the verification skill, then fix, then show the same journey passing.
- Done means evidence from the verification skill for the changed behavior, not "tests pass".
- One PR is one verifiable change under {{diffLimit}} changed lines. Split bigger work into stacked PRs.
- Multi-PR work starts with a plan in `docs/plans/active/` (see `docs/plans/README.md`).
- Fill every section of `.github/pull_request_template.md`. Reviewers read Evidence first.
- Models: cheaper models by default per `.cursor/rules/pstack-models.mdc`. Use frontier models only when a human asks.

## Context sources

`/why` and `/recall` search these. Link to them from PRs and plans; do not copy them in.

| Source | Where |
|---|---|
| Linear | <team key and project, e.g. `WEB` / "Shortlinks"> |
| Notion | <space or page for specs and decisions> |
| Slack | <team channel; incident channel> |
| Owners | {{owners}} (also in `.github/CODEOWNERS`) |

## Autonomy

Agents build, verify and open PRs on their own. A human merges every PR. Deploys, secrets, remote data, infrastructure and production DNS always stop for a human. The policy is `.cursor/rules/autonomy.mdc`{{agentsAutonomy}}; `.cursor/hooks/hstack-kit-guard.mjs` blocks the shell forms.

## Rules

Each rule names what enforces it, strongest first. `scripts/kit/check-agents-rules.mjs` fails CI if an enforcer does not exist. Enforcers are a repo path, `ci:<check-id>`, `hook:<guard-rule>`, an adapter kind such as `lint:<rule>`, or `docs-only`. When a human corrects an agent twice for the same thing, run `/correct`: fix it at the highest level that works (architecture, then types, then lint or CI, then a test, then docs) and add or update the row here.

| Rule | Enforced by |
|---|---|{{agentsRules}}
| Changed behavior is proven on the running app, with evidence in the PR | `ci:verify-smoke`, `.github/pull_request_template.md` |
| New entry points (routes, commands, jobs, consumers) get a feature-map entry and a smoke journey | `docs-only` |
| A human merges every PR | `hook:merge` |
| Deploys, secrets and infrastructure pause for a human | `hook:deploy`, `hook:secrets`, `hook:infra` |
| PRs stay under the diff limit or explain why | `ci:diff-limit` |
| Plans follow the lifecycle and name the proof for each task | `scripts/kit/check-plans.mjs` |
| Every rule in this table names a real enforcer | `scripts/kit/check-agents-rules.mjs` |

## Project-specific notes

<Add only what an agent cannot learn from the code: external systems, client constraints, known traps. Prefer turning each into a row above.>
