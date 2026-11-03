# The project engineer bot

Every project that adopts the kit at phase 1 or later has a dedicated engineer bot. Its standing job is to keep the verification skill and feature map true to the code: a skill that describes routes that moved or seed data that no longer loads makes every agent's evidence worthless. pstack's author puts the maintenance of this skill at on-call importance; the bot makes it routine instead of heroic.

One bot per project. The bot's scope, permissions and history stay tied to one repository, and its PRs are easy to attribute.

## What the bot does

| Routine | When | Output |
|---|---|---|
| `/maintain-verification-skill` | Daily, before the team's working day | Either no PR (outcome `clean`), one PR of proven corrections to `.cursor/skills/verify-<project>/` (outcome `changed`), or a report of what blocked it (outcome `blocked`) |
| `/create-verification-skill` | Once, at adoption | The tailored skill, as a PR |
| `hstack-kit status` | Weekly (optional) | A Linear issue when the project is behind the kit or has unresolved conflicts |

The bot never edits product code during the maintenance routine. If the live pass shows the app no longer does what the feature map says and the code is wrong, that is a product bug: the bot files it in Linear with its evidence and leaves the map alone.

## Setting it up

Choose one platform per team and use it for every project.

### Option A: Cursor Automation (recommended to start)

Nothing to host, it runs in a cloud agent with the repo's `.cursor/environment.json`, and the kit's hook guard applies.

1. In Cursor, create an automation for the repository. Name it `<project>-engineer-bot`.
2. Trigger: a schedule, daily at 06:00 in the team's timezone, on the default branch.
3. Model: leave it on the team default. The project's `pstack-models.mdc` sets the roles.
4. Prompt: paste the routine prompt below.
5. Output: PRs from the automation. Post the outcome to the project's Slack channel, and file `blocked` outcomes and product bugs in the project's Linear team.
6. Run it once by hand and check the result before relying on the schedule.

### Option B: Grok Bot built with Dr Eggbot

pstack's author recommends this, and it suits teams that want a bot with its own identity, memory and Slack presence. Dr Eggbot (`https://x.ai/bot/93gOz3op1UQdBdbekQFLK`) creates the bot from a description.

1. Ask dr eggbot to create the bot from the kit template [`bots/engineer.md`](../bots/engineer.md). dr eggbot asks that file's intake questions, fills the placeholders, and creates the bot. The routine below is the daily verification pass, and `/create-verification-skill` is the first task when the skill is still a draft. The PM bot is [`bots/pm.md`](../bots/pm.md).
2. Give it the permissions below and nothing more.
3. Connect it to the project's Slack channel and Linear team so it can report outcomes.

### Permissions (both options)

| Allowed | Not allowed |
|---|---|
| Read the repository; push branches; open PRs and comment on them | Merge, approve its own PRs, or push to protected branches (branch protection enforces this) |
| Run the project locally, the checks (`node scripts/kit/checks.mjs`) and the verification skill | Deploys, secret commands, infrastructure changes and remote data commands (the hook guard and the adapter's rule pack block the shell forms) |
| Create and comment on Linear issues in the project's team; post in the project's Slack channel | Production or staging cloud credentials of any kind. The bot does not need them, because the verification skill runs everything locally |

## The daily routine prompt

```text
Run /maintain-verification-skill on .cursor/skills/verify-<project>/ in this repository.

Follow the skill exactly: index hygiene, one source reader per feature file, then one live pass that
drives every feature through control.mjs (doctor before the first drive and after any failure),
then triage. Only edit files inside .cursor/skills/verify-<project>/. Never edit product code.

Before you finish:
- Run `node .cursor/skills/verify-<project>/control.mjs smoke` from a clean state. It must pass.
- Confirm `control.mjs stop --all` left no process from this run.

Outcome:
- clean: no branch, no PR. Reply with features covered and the smoke summary.
- changed: one PR titled "verify-<project>: <what changed>", filled in with the repository's PR template.
  Put the smoke summary.md table and the evidence directory in Evidence. Keep it under the diff limit.
- blocked: no PR. Say exactly what blocked it and file a Linear issue with the evidence.
For every product bug the live pass found, file a Linear issue with the failing step, its evidence,
and the feature file. Do not change the feature map to match broken behavior.

Use the models in .cursor/rules/pstack-models.mdc. Do not escalate to frontier models.
A human reviews and merges your PR. Never merge it yourself.
```

## Who owns the bot

The project's tech lead owns the bot: they review its PRs within a working day, read its `blocked` reports, and change its prompt when the routine drifts. When the bot produces `clean` for two weeks while the product has changed, treat it as broken and check that the live pass really drives every feature.
