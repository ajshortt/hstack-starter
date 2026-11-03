# react-counter verification map

This directory is the maintained source for verifying the user-facing behavior of react-counter. Read this index before driving anything, then use the matching feature file as the recipe. The engineer bot audits it daily with `/maintain-verification-skill`.

## Baseline preconditions

- `control.mjs start` reached ready and `control.mjs doctor` reports `"ok": true`.
- react-counter has no backend and no fixture data; every route renders from client state alone.
- Never drive a dev server this run did not start.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Drive the routes a user navigates to with the `page` step. Read results back from the rendered page and its console, not from source.
- A route is proven when it renders (`status: 200`) with `consoleErrorCount: 0`. A caught React warning or an uncaught error is a failure, not a detail to ignore.

## Proof and skip reporting

- Proof is the route, its rendered screenshot, and a clean console.
- Report an unreachable route with the attempted path and the unmet precondition.
- Do not report a skipped route as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control.mjs`, `Gotchas`. Keep implementation details out of the map.

## Features

- [Health](./health.md) covers the home route: the counter and the cheapest end-to-end signal that the app renders.
- [About](./about.md) covers the second route, proving the smoke drives more than the home page.
