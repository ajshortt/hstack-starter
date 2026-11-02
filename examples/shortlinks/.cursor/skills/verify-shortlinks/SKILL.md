---
name: verify-shortlinks
description: Launch shortlinks (a Cloudflare Worker) locally under wrangler dev with local D1, KV, R2, Queues and Durable Objects, seed it, drive its routes, crons and queue consumers, and capture evidence. Use before declaring any change to shortlinks done, when reproducing a bug, or when a PR needs proof.
---

# Verify shortlinks

This skill proves behavior on the real Worker running in `workerd` through `wrangler dev --local`. Remote bindings are disabled, so nothing here can touch production data. Every command prints JSON. Run commands from the project root.

```bash
node .cursor/skills/verify-shortlinks/control.mjs <command>
```

## What shortlinks is

A link shortener. `POST /api/links` stores a link in D1 and enqueues `link.created`. The queue consumer snapshots the link to R2 and marks it archived. `GET /r/<slug>` redirects through a KV read-through cache and counts the click in a per-slug `LinkCounter` Durable Object. The hourly cron writes a report to R2 and caches it in KV. A KV blocklist (`config:blocklist`) rejects hosts.

Seed data: links `docs` (archived) and `pstack` (not archived), and the blocklist `evil.example`, `phish.example`. The ready check requires `/health` to report exactly those 2 links.

## Launch

`start` creates an isolated run under `.verify/runs/<run-id>/`. It applies every D1 migration with `--local`, loads the seed data from `verify.config.json`, then launches `wrangler dev --local --test-scheduled` on a free port and a free inspector port. It is ready when the `ready` step in `verify.config.json` passes its `expect`, which must prove usable data, not only an open port. Two runs can live side by side. Pass `--run <id>` to address one that is not the latest.

## Doctor

Run `doctor` first, and again after any surprising result. It is read-only. It checks that the process is the one this harness started on this port, that the ready route returns the expected body, that every binding declared in the wrangler config is loaded and in `local` mode, that no D1 migration is pending, that the seed probes in `doctor` pass, and that `compatibility_date` is not in the future. Do not drive an instance whose doctor fails.

## Drive

Drive through the same entry points a user or upstream system uses.

- HTTP routes. `request <METHOD> <PATH> [--json '<body>'] [--header 'k: v'] [--label <name>]`. Redirects are not followed, so you see the `302` and its `location`.
- Crons. `scheduled --cron "<expression from wrangler.jsonc triggers>"` fires `scheduled()` through `/cdn-cgi/handler/scheduled`.
- Queues. Send the message through the route or cron that produces it, then read back the consumer's side effects. Consumers run in batches, so poll the side effect instead of sleeping.
- Durable Objects. Reach them through the routes that call them, then read their state back through a route that reports it.
- Read-back. `d1 <BINDING> "<SQL>"`, `kv-get <BINDING> <KEY>` and `r2-get <BINDING> <KEY>` read the same local state the Worker writes.
- Logs. `logs [--grep <regex>] [--tail N]` shows this run's `console` output from wrangler.

`smoke [--feature a,b] [--keep]` runs the journeys in `smoke.json` from a fresh run and stops it afterwards. CI runs the same command.

## Evidence

Every drive command appends to `.verify/evidence/<run-id>/transcript.jsonl`. `doctor` writes `doctor.json`, `smoke` writes `summary.md`, and `stop` copies `wrangler.log`. Proof standards:

- Exercise the real user path. No test-only routes and no direct writes in place of the action under test.
- Capture the action and the resulting state. A `201` alone is not proof; read the row, key or object back.
- Verify side effects of async work (queue consumers, `ctx.waitUntil`, crons) by polling the stored result.
- Put the evidence directory path and the `summary.md` table in the PR's Evidence section.

## Cleanup

`stop` kills only the process group this harness started, after checking the process start time recorded at launch. It deletes the run's persisted state and keeps `.verify/evidence/<run-id>/`. `stop --all` stops every run under `.verify/runs/`. Never kill `workerd` or `wrangler` by name.

## Helpers

- `control.mjs` (the stack-neutral harness) and `driver.mjs` (the workers adapter's `wrangler dev --local` driver) are managed by pstack-kit. `DRIVER.md` documents the driver. Fix gaps here and the kit's next update will stage its version for you to merge instead of overwriting yours.
- `verify.config.json` holds the ready step, doctor probes, and under `workers` the wrangler config, `--var` overrides and seed files.
- `smoke.json` holds journeys. A step is one of `request`, `run`, `log`, `file` (core) or `scheduled`, `d1`, `kv`, `r2` (driver), with `expect` (`status`, `json`, `headers`, `rows`, `value`, `matched`, `exitCode`, `stdout`), optional `save` and `retry`. In `expect`, `"$present"` matches any non-null value and `"$match:<regex>"` matches a string. `{{runId}}`, `{{port}}` and `{{baseUrl}}` are substituted.
- `features/` is the feature map. Read `features/README.md` before driving.
