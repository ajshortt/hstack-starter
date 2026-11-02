# Redirect and click count

Visiting a short URL redirects to the stored target and counts the click. The count is visible on the stats route.

## Sub-features

- `redirect-hit` returns `302` with `location` set to the target.
- `redirect-cache` stores the target in KV (`link:<slug>`) on first resolve.
- `redirect-count` increments the slug's `LinkCounter` Durable Object.
- `redirect-miss` returns `404` for unknown slugs and does not count.

## How to get to it (user POV)

- Open `/r/<slug>` in a browser or follow a short URL.
- Read the count at `GET /api/links/<slug>/stats` or in `clicks` on `GET /api/links/<slug>`.

## Driving it with control.mjs

Preconditions:

- Baseline state. Seeded slug `docs` has 0 clicks on a fresh run.

- **Redirect.** Run `control.mjs request GET /r/docs`. Status `302`, header `location` is `https://developers.cloudflare.com/workers/`.
- **Cache filled.** Run `control.mjs kv-get LINK_CACHE link:docs`. Value is the target URL.
- **Count.** Request `/r/docs` again, then `control.mjs request GET /api/links/docs/stats`. Body is `{"slug":"docs","clicks":2}`.
- **Miss.** Run `control.mjs request GET /r/does-not-exist`. Status `404`.

## Gotchas

- `request` never follows redirects. Assert the `302` and `location`, not the target page.
- Counts persist in the run's Durable Object storage. A second `smoke` on the same run (`--keep`) starts from the previous count.
