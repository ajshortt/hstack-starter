# {{projectName}} verification map

This directory is the maintained source for verifying the user-facing behavior of {{projectName}}. Read this index before driving anything, then use the matching feature file as the recipe. The engineer bot audits it daily with `/maintain-verification-skill`.

## Baseline preconditions

- `control.mjs start` reached ready and `control.mjs doctor` reports `"ok": true`.
- Any fixture a route needs (a mocked API response, seeded local storage) is loaded. Name it here once tailored.
- Never drive a dev server this run did not start.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Drive the routes a user navigates to with the `page` step. Read results back from the rendered page and its console, not from source.
- A route is proven when it renders (`status: 200`) with `consoleErrorCount: 0`. A caught React warning or an uncaught error is a failure, not a detail to ignore.
- Poll data that loads after first paint with a timeout (`retry` in a journey step). Do not sleep and hope.

## Proof and skip reporting

- Proof is the route, its rendered screenshot, and a clean console.
- Report an unreachable route with the attempted path and the unmet precondition.
- Do not report a skipped route as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control.mjs`, `Gotchas`. Keep implementation details out of the map.

## Features

<!-- One line per feature file. Every route a user can navigate to needs a home here. -->

- [Health](./health.md) covers the cheapest end-to-end signal that the app renders.
