# Workers driver

<!-- Managed by hstack-kit (workers adapter). -->

`driver.mjs` runs shortlinks under `wrangler dev --local`. Remote bindings are disabled, so nothing the harness does can touch production data. Settings live under `"workers"` in `verify.config.json`.

## Launch

`start` applies every D1 migration with `--local`, loads the seed data from `workers.seed` (`d1` SQL files, `kv` JSON maps, `r2` directories, all relative to this skill), then launches `wrangler dev --local --test-scheduled` on the run's free port and a free inspector port. Wrangler is taken from this project's `node_modules/.bin`, then from each parent up to the git root (a hoisted workspace install), and otherwise `npm exec --offline -- wrangler`. `workers.vars` become `--var` overrides and can use `{{port}}` and `{{runId}}`. Set `workers.env` to run a named wrangler environment. State persists under `.verify/runs/<run-id>/state/`.

## Doctor checks

On top of the core checks:

- `bindings`: every binding declared in the wrangler config is loaded and in `local` mode.
- `migrations:<binding>`: no D1 migration is pending.
- `compatibility_date`: not in the future.

Seed probes are ordinary `doctor` entries using the driver steps, for example `{ "name": "seed:links", "d1": { "binding": "DB", "sql": "SELECT count(*) AS n FROM links" }, "expect": { "rows": [{ "n": 2 }] } }`.

## Steps and commands

| Journey step | Command | Result |
|---|---|---|
| `scheduled` `{ "cron": "0 * * * *" }` | `scheduled --cron "<expression>"` | Fires `scheduled()` through `/cdn-cgi/handler/scheduled` |
| `d1` `{ "binding", "sql" }` | `d1 <BINDING> "<SQL>"` | `rows` from local D1 |
| `kv` `{ "binding", "key" }` | `kv-get <BINDING> <KEY>` | `value` from local KV (JSON parsed) |
| `r2` `{ "binding", "key" }` | `r2-get <BINDING> <KEY>` | `value` of the local R2 object |

Queues and Durable Objects are driven through the routes and crons that use them, then read back through a route or one of the steps above.

The wrangler output is captured as `wrangler.log` in the run's evidence.
