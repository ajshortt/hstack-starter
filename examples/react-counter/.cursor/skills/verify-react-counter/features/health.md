# Health

The cheapest end-to-end signal that react-counter works for a user: the home route renders the counter with a clean console. There is no backend; "healthy" means the bundle loaded and React mounted.

## Sub-features

- `health-ok` renders the home route, which shows a button reading "count is 0" and a link to `/about`.
- Clicking the button increments the count by one, proving event handlers and state updates work.

## How to get to it (user POV)

- `/`, the app's default route.

## Driving it with control.mjs

Preconditions:

- `control.mjs doctor` reports `"ok": true`.

- **Healthy.** Run `control.mjs page / --label health`. Status is `200`, the screenshot shows the counter button and the About link, and `consoleErrorCount` is `0`.

## Gotchas

- Doctor depends on this route. If you change what it renders, update `ready` or `doctor` in `verify.config.json` in the same PR.
