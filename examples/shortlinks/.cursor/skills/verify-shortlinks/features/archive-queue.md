# Archive on create

Every new link is archived asynchronously. The `shortlinks-events` queue consumer writes a JSON snapshot to R2 and stamps `archived_at` in D1. Malformed messages are logged and dropped.

## Sub-features

- `archive-snapshot` writes `archive/links/<slug>.json` to the `ARCHIVE` bucket.
- `archive-stamp` sets `archived_at` once and never overwrites it.
- `archive-malformed` acks and logs messages that do not parse.

## How to get to it (user POV)

- Create a link with `POST /api/links`. The producer is the create route; there is no direct way to enqueue.

## Driving it with control.mjs

Preconditions:

- Baseline state. No link uses slug `arch-<run-id>`.

- **Trigger.** Run `control.mjs request POST /api/links --json '{"url":"https://example.com/archive","slug":"arch-<id>"}'`. Status `201`.
- **Stamp.** Poll `control.mjs d1 DB "SELECT archived_at FROM links WHERE slug = 'arch-<id>'"` for up to 15 seconds. `archived_at` becomes an ISO timestamp.
- **Snapshot.** Run `control.mjs r2-get ARCHIVE archive/links/arch-<id>.json`. JSON with the slug and URL.
- **Log.** Run `control.mjs logs --grep "archived link arch-<id>"`. One line.

## Gotchas

- The consumer batches with `max_batch_timeout: 1`, so the stamp usually lands within about one second. Poll; do not sleep.
- `archive-malformed` cannot be reached through the real producer, which only sends valid events. The Vitest suite covers it with `createMessageBatch`. Report it as `verified-unreachable` live.
