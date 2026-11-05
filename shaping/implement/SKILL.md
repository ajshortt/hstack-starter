---
name: implement
description: "hstack's implementation skeleton: build the frontier ticket from a plan, prove it with the kit's checks and the verify smoke, attach evidence, and open a PR from the template for a human to merge."
disable-model-invocation: true
---

<!-- hstack-owned. Shape taken from mattpocock/skills (skills/engineering/implement and implement-spec @ 4ae2317), MIT License, Copyright (c) 2026 Matt Pocock; see shaping/LICENSE-mattpocock-skills. Only the pattern is used, not the text. -->

# Implement (hstack skeleton)

hstack owns this step. It is listed under `shaping/` only because its shape came from Matt's `implement` and `implement-spec`. Use `/poteto-mode` for the build itself, per `AGENTS.md`.

TODO(hstack): decision 7's `--with shaping` pack does not install this skill. Wire the skeleton to the kit's real paths and decide whether a later pack includes it or it stays a reference here (decision 6). See shaping/TODO.md.

## Pick the ticket (ordering pattern from implement-spec)

1. Read the plan in `docs/plans/active/` and its tickets. The tickets are a task graph, not a list: the **frontier** is every ticket whose blockers are all done.
2. Take the first frontier ticket. State its title, its verify journey and its size before starting.
3. Independent frontier tickets may run in parallel, one owner per PR (the Orchestrate playbook covers programs of many).

Dropped from upstream: the integration branch and the merger subagent. Each ticket is its own PR; a human merges every PR.

## Build and prove

1. **Build** at the agreed seams. Use pstack's `tdd` only where a cheap local test target exists.
2. **Checks**: `node scripts/kit/checks.mjs run --all` (typecheck, lint, tests, rule table, plans, diff limit as the project defines them).
3. **Verify smoke**: `node .cursor/skills/verify-<project>/control.mjs smoke`, plus the ticket's named journey driven by hand if it is not in the smoke set yet. Add or update the journey and the feature map entry when behaviour changes.
4. **Evidence**: the run's `.verify/evidence/<run-id>/` directory and its `summary.md` table.
5. **Review**: the one code-review convention ([code-review](../code-review/SKILL.md), [docs/review.md](../../docs/review.md)).

## Open the PR

Fill every section of `.github/pull_request_template.md`: Goal (ticket and plan), Evidence (summary table, journeys driven, read-backs), Risk, Diff size. Tick the ticket in the plan with the PR link. Stop there: a human reviews and merges.
