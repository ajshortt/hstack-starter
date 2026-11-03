# About

A second, static route that exists to prove the verification smoke exercises more than the home page: client-side routing works, and the route it lands on renders cleanly.

## Sub-features

- `about-ok` renders the About route reached from the home page's link, and a link back to `/`.

## How to get to it (user POV)

- Click "About" on the home route, or navigate directly to `/about`.

## Driving it with control.mjs

Preconditions:

- `control.mjs doctor` reports `"ok": true`.

- **Healthy.** Run `control.mjs page /about --label about`. Status is `200`, the screenshot shows the "About" heading and the Home link, and `consoleErrorCount` is `0`.

## Gotchas

- `/about` is served by the Vite dev server's SPA history fallback (`react-router-dom`'s `BrowserRouter`), not a real server route. A production static host needs the same fallback (see the adapter README's "New React app" step 4).
