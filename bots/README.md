# Grok bot templates

These templates are how every project that adopts hstack-kit gets the same two Grok bots: an engineer and a PM. They are briefs for a bot. `hstack-kit apply` does not copy them into the project, and they are not part of a phase.

## How a bot is created

The bot-builder agent, dr eggbot, reads one template. It asks that template's intake questions, fills every `{{placeholder}}` from the answers, and creates the bot. Create one engineer and one PM per project. Name each bot from the template's name pattern so a person can tell which repository it belongs to.

dr eggbot reads the repository before it asks, wherever the intake questions name a file (`.hstack-kit/lock.json`, `.hstack-kit/config.json`, `.hstack-kit/checks/`, `.github/CODEOWNERS`, the verification skill). It confirms the value with the person. It does not invent a placeholder the template does not list.

## The kit is the source of truth

This folder is the brief. When a template changes, existing bots are re-briefed from the new text. Do not edit a live bot's standing rules and leave the template behind: the next project would still get the old rules.

Re-brief means dr eggbot reads the current template, keeps the project's filled placeholders, and replaces the bot's standing rules and starting memory with what the template says now. The checklist at the bottom of each template is the list to walk. Drop any rule or memory fact the template no longer contains.

## Awareness and enforcement

A filled template makes the bot aware of the setup: the guard, the checks, the diff limit, and who merges. Enforcement does not depend on the bot remembering. It is:

- the guard hook: `.cursor/hooks.json`, `.cursor/hooks/hstack-kit-guard.mjs`, and `.cursor/hooks/hstack-kit-guard.rules/`
- CI: `node scripts/kit/checks.mjs`, with those checks required on the default branch
- branch protection on the default branch: a pull request, a human approval, required checks, no force-push

## Templates

| Bot | Template | Standing job |
|---|---|---|
| Engineer | [engineer.md](engineer.md) | Builds and verifies PRs, keeps each target's verification skill current, upgrades the kit through `apply` |
| PM | [pm.md](pm.md) | Tracks the rollout page, reports PRs waiting on a human merge, turns each task into a plan and a PR |

The engineer bot's daily verification routine, schedule, and permissions are in [docs/engineer-bot.md](../docs/engineer-bot.md). That page describes how to host the bot. This folder is the brief dr eggbot uses to create it.
