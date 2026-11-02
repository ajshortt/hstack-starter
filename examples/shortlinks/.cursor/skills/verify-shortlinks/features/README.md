# shortlinks verification map

This directory is the maintained source for verifying the user-facing behavior of shortlinks. Read this index before driving the Worker, then use the matching feature file as the recipe. The engineer bot audits it daily with `/maintain-verification-skill`.

## Baseline preconditions

- `control.mjs start` reached ready and `control.mjs doctor` reports `"ok": true`.
- D1 holds the seeded links `docs` (archived) and `pstack` (not archived).
- KV holds `config:blocklist` with `evil.example` and `phish.example`.
- No report exists yet in KV (`report:latest`) on a fresh run.
- Never drive an instance this run did not start.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Use slugs that include the run ID (`smoke-<id>`) so concurrent runs do not collide. Slugs match `^[a-z0-9][a-z0-9-]{1,31}$`.
- Drive routes and the cron. Read results back through `d1`, `kv-get`, `r2-get` or a route.
- Poll queue side effects with a timeout. Do not sleep and hope.

## Proof and skip reporting

- HTTP proof is the request, the status, the body, and a read-back of the state it changed.
- Async proof is the trigger plus the polled side effect and the consumer's log line.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control.mjs`, `Gotchas`. Keep implementation details out of the map.

## Features

| Feature | Surface | Bindings | Smoke journey |
|---|---|---|---|
| [Health](./health.md) | `GET /health` | D1, KV, R2 | `health` |
| [Create a link](./create-link.md) | `POST /api/links` | D1, KV, Queue producer | `create-link` |
| [Redirect and click count](./redirect.md) | `GET /r/:slug`, `GET /api/links/:slug/stats` | KV, D1, Durable Object `LinkCounter` | `redirect` |
| [Archive on create](./archive-queue.md) | Queue consumer `shortlinks-events` | D1, R2 | `archive-queue` |
| [Hourly report](./report-cron.md) | Cron `0 * * * *`, `GET /api/reports/latest` | D1, R2, KV | `report-cron` |
