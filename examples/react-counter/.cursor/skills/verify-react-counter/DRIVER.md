# React driver

<!-- Managed by hstack-kit (react adapter). -->

Launch and the `ready` check use the core harness directly: `verify.config.json`'s `launch.command` starts the Vite dev server (npm, pnpm or yarn, whichever lockfile is present) on the run's free port, and `ready` is a plain `request` to `/`. Vite needs no special launch.

`driver.mjs` adds one step, `page`, that drives react-counter with a real headless browser (Playwright) instead of a raw HTTP request, because rendering, hydration and client-side errors only show up in a browser.

## `page` step

| Journey step | Command | Result |
|---|---|---|
| `page` `{ "path", "trace" }` | `page <PATH> [--trace]` | Opens `<PATH>` in headless Chromium, waits for `load`, captures a full-page screenshot (and a trace if `trace` is set) under the run's evidence directory, and collects browser console errors |

The result has `status` (the navigation response status), `consoleErrors` (the message strings) and `consoleErrorCount`, plus `screenshot` (and `trace` if requested), paths relative to the project root. Use `"expect": { "status": 200, "consoleErrorCount": 0 }` in a journey step or a `doctor` probe; `consoleErrorCount` makes "no console errors" assertable, since the harness's `expect` only matches named fields, not "nothing extra".

Waiting for `load` rather than `networkidle` is deliberate: Vite's HMR client keeps a WebSocket open, which never goes idle.

A shared headless browser launches lazily on the first `page` step and closes in `cleanup`, so a `smoke` run with several journeys pays the Chromium startup cost once. `playwright` is this project's own devDependency, not the kit's; install the browser once per machine or CI image with `npx playwright install chromium`.
