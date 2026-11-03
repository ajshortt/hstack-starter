# Health

The cheapest end-to-end signal that {{projectName}} works for a user: the home route renders real content with a clean console. A front end has no `/health` endpoint; this route plays that role for doctor and CI.

## Sub-features

- `health-ok` renders the route and reaches what it depends on (an API, local storage, a bundled fixture).
- `health-degraded` names what failed, if the app shows one (an error boundary, a visible message).

## How to get to it (user POV)

- <The route a user lands on first.>

## Driving it with control.mjs

Preconditions:

- `control.mjs doctor` reports `"ok": true`.

- **Healthy.** Run `control.mjs page / --label health`. Status is `200`, the screenshot shows real content, and `consoleErrorCount` is `0`.

## Gotchas

- Doctor depends on this route. If you change what it renders, update `ready` or `doctor` in `verify.config.json` in the same PR.
