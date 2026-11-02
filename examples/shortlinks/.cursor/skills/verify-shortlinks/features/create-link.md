# Create a link

A client posts a URL, optionally with its own slug, and gets back a short URL. Taken slugs, blocklisted hosts and non-HTTP URLs are refused with distinct errors.

## Sub-features

- `create-custom-slug` stores the link under the requested slug and returns `201` with `shortUrl`.
- `create-generated-slug` picks a random 5-character slug when none is given.
- `create-slug-taken` returns `409 slug_taken`.
- `create-blocked-host` returns `422 host_blocked` for hosts in `config:blocklist`.
- `create-invalid` returns `400 invalid_input` for non-HTTP URLs or malformed slugs.

## How to get to it (user POV)

- `POST /api/links` with JSON `{"url": "...", "slug": "..."}`.

## Driving it with control.mjs

Preconditions:

- Baseline state. No link uses slug `smoke-<run-id>`.

- **Create.** Run `control.mjs request POST /api/links --json '{"url":"https://example.com/a","slug":"smoke-<id>"}'`. Status `201`, body `slug` and `shortUrl` ending `/r/smoke-<id>`.
- **Persisted.** Run `control.mjs d1 DB "SELECT slug, url FROM links WHERE slug = 'smoke-<id>'"`. One row with the posted URL.
- **Taken.** Repeat the create with another URL. Status `409`, `error` is `slug_taken`.
- **Blocked.** Run `control.mjs request POST /api/links --json '{"url":"https://phish.example/login"}'`. Status `422`, `detail.host` is `phish.example`.
- **Invalid.** Post `{"url":"ftp://example.com/file"}`. Status `400`, `error` is `invalid_input`.
- **Generated slug.** Post `{"url":"https://example.com/g"}`. Status `201`, `slug` is 5 characters from `a-z` and `2-9`.

## Gotchas

- Every successful create also enqueues an archive job. Expect `archived_at` to become non-null about a second later.
- `shortUrl` uses `PUBLIC_BASE_URL`, which the harness sets to the run's own URL with `--var`.
