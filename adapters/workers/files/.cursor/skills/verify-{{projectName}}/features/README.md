# {{projectName}} verification map

This directory is the maintained source for verifying the user-facing behavior of {{projectName}}. Read this index before driving the Worker, then use the matching feature file as the recipe. The engineer bot audits it daily with `/maintain-verification-skill`.

## Baseline preconditions

- `control.mjs start` reached ready and `control.mjs doctor` reports `"ok": true`.
- The seed data listed in `verify.config.json` is loaded. Name it here once tailored.
- Never drive an instance this run did not start.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Use slugs, IDs and names that include the run ID so concurrent runs do not collide.
- Drive routes, crons and producers. Read results back through `d1`, `kv-get`, `r2-get` or a route.
- Poll async side effects with a timeout. Do not sleep and hope.

## Proof and skip reporting

- HTTP proof is the request, the status, the body, and a read-back of the state it changed.
- Async proof is the trigger plus the polled side effect and the consumer's log line.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control.mjs`, `Gotchas`. Keep implementation details out of the map.

## Features

<!-- One line per feature file. Every route group, cron, queue consumer and Durable Object class needs a home here. -->

- [Health](./health.md) covers the readiness route that doctor and CI depend on.
