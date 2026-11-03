# Health

The health route tells an operator, a load balancer or this harness whether the Worker can reach every binding it needs, with real data rather than an open port.

## Sub-features

- `health-ok` returns `200` and `"ok": true` when every binding answers.
- `health-degraded` returns `503` and names the failing binding.

## How to get to it (user POV)

- `GET /health`.

## Driving it with control.mjs

Preconditions:

- `control.mjs doctor` reports `"ok": true`.

- **Healthy.** Run `control.mjs request GET /health --label health`. Status is `200` and `checks` lists each binding with `"ok": true`.

## Gotchas

- Doctor depends on this route. If you change its body, update `ready` in `verify.config.json` in the same PR.
