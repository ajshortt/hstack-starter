# {{projectName}} verification map

This directory is the maintained source for verifying the user-facing behavior of {{projectName}}. Read this index before driving anything, then use the matching feature file as the recipe. The engineer bot audits it daily with `/maintain-verification-skill`.

## Baseline preconditions

- `control.mjs start` succeeded and `control.mjs doctor` reports `"ok": true`.
- Any seed or fixture data the project needs is loaded. Name it here once tailored.
- Never drive a process this run did not start.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Use names and IDs that include the run ID (`{{!runId}}` in journeys, lowercase letters and digits only) so concurrent runs do not collide.
- Drive the entry points a user or upstream system uses: routes, commands, jobs, events. Read results back through the same interfaces or a read-only query.
- Poll async side effects with a timeout (`retry` in a journey step). Do not sleep and hope.

## Proof and skip reporting

- Proof is the action, its direct result, and a read-back of the state it changed.
- Async proof is the trigger plus the polled side effect.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control.mjs`, `Gotchas`. Keep implementation details out of the map.

## Features

<!-- One line per feature file. Every user-facing entry point needs a home here. -->

- [Health](./health.md) covers the cheapest end-to-end signal that the project works.
