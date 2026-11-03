# Health

The cheapest end-to-end signal that {{projectName}} works for a user: a health route, a CLI's `--version` with a real dependency check, or a single representative command. Doctor and CI depend on it.

## Sub-features

- `health-ok` proves the project starts and reaches what it depends on.
- `health-degraded` names the dependency that failed, if the project reports one.

## How to get to it (user POV)

- <The route, command or entry point a user or operator would use.>

## Driving it with control.mjs

Preconditions:

- `control.mjs doctor` reports `"ok": true`.

- **Healthy.** <Run `control.mjs request GET /health --label health` or `control.mjs run "<command>" --label health` and say what the result must show.>

## Gotchas

- Doctor depends on this entry point. If you change what it returns, update `ready` or `doctor` in `verify.config.json` in the same PR.
