# Health

The health route tells an operator or this harness whether the Worker can reach D1, KV and R2, and how many links D1 holds.

## Sub-features

- `health-ok` returns `200`, `"ok": true` and a check per binding.
- `health-degraded` returns `503` and the failing binding's error.

## How to get to it (user POV)

- `GET /health`.

## Driving it with control.mjs

Preconditions:

- `control.mjs doctor` reports `"ok": true`.

- **Healthy.** Run `control.mjs request GET /health --label health`. Status is `200`. `checks.d1.links` is `2` on a fresh run, and `checks.kv.ok` and `checks.r2.ok` are `true`.

## Gotchas

- The ready check in `verify.config.json` pins `checks.d1.links` to `2`. Adding seed links means updating it in the same PR.
- `health-degraded` is not reachable locally without breaking a binding. Report it as `verified-unreachable` with that reason; the Vitest suite covers the happy path only.
