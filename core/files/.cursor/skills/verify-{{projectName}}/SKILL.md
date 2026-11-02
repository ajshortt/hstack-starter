---
name: verify-{{projectName}}
description: Prove a change to {{projectName}} on the real thing. Start an isolated run, check it with doctor, drive the entry points in the feature map, and capture evidence. Use before declaring any change to {{projectName}} done, when reproducing a bug, or when a PR needs proof.
---

# Verify {{projectName}}

This skill proves behavior through the same entry points a user or upstream system uses. Every command prints JSON. Run commands from the project root.

```bash
node .cursor/skills/verify-{{projectName}}/control.mjs <command>
```

If this skill has a driver (`"driver"` in `verify.config.json`), read `DRIVER.md` next to this file. It describes how the driver launches the project and which extra steps and commands it adds.

## Tailor this skill

The kit seeds this skill. It is a draft until someone tailors it and runs it end to end once. `start` refuses to run while `verify.config.json` contains `"_template": true`.

1. Run `/create-verification-skill` and say: "Extend the existing `.cursor/skills/verify-{{projectName}}/`. Keep `control.mjs`. Fill `verify.config.json`, `smoke.json` and `features/` from this repo."
2. Decide how the project runs:
   - **A long-lived process** (a server, a worker, a watcher): set `launch.command` (it gets `{{!port}}`, `{{!runId}}` and `{{!runDir}}`), and `ready` to a step that proves usable data, not only an open port.
   - **A library, CLI or batch job**: leave `launch` as `null`. Journeys use `run` steps against the real entry point.
   - **A stack with an adapter**: the adapter's driver sets this up. See `DRIVER.md`.
3. Remove `"_template": true` from `verify.config.json`.
4. Run `smoke` once and commit the skill. The engineer bot keeps it current with `/maintain-verification-skill` (see the kit's `docs/engineer-bot.md`).

## Launch

`start` creates an isolated run under `.verify/runs/<run-id>/` with a free port. It runs the driver's preparation (if any), launches the project if `launch` or the driver says how, and waits until `ready` passes. Without a launch it records the run, so journeys still get evidence and a run ID. Two runs can live side by side. Pass `--run <id>` to address one that is not the latest.

## Doctor

Run `doctor` first, and again after any surprising result. It is read-only. It checks that the launched process is still the one this harness started, that `ready` passes, that every probe in `doctor` passes, and any checks the driver adds. Do not drive a run whose doctor fails.

## Drive

Core steps, usable from journeys and the command line:

- `request <METHOD> <PATH> [--json '<body>'] [--header 'k: v'] [--label <name>]`: HTTP against the run's `baseUrl`. Redirects are not followed.
- `run "<shell command>" [--label <name>]`: any command from the project root. The result has `exitCode`, `stdout`, `stderr` and `json` (stdout parsed when it is JSON).
- `logs [--grep <regex>] [--tail N]`: the launched process's output.
- In journeys only: `log` (`{ "pattern": "<regex>" }` against the run's output) and `file` (`{ "path": "<file>" }`, read back as JSON or text).

`smoke [--feature a,b] [--keep]` runs the journeys in `smoke.json` from a fresh run and stops it afterwards. CI runs the same command with `--if-tailored`.

## Evidence

Every drive command appends to `.verify/evidence/<run-id>/transcript.jsonl`. `doctor` writes `doctor.json`, `smoke` writes `summary.md`, and `stop` copies the app log. Proof standards:

- Exercise the real user path. No test-only entry points and no direct writes in place of the action under test.
- Capture the action and the resulting state. A success code alone is not proof; read the changed state back.
- Verify async side effects by polling the stored result.
- Put the evidence directory path and the `summary.md` table in the PR's Evidence section.

## Cleanup

`stop` stops only the process group this harness started, after checking it is still the same process. It deletes the run's scratch state and keeps `.verify/evidence/<run-id>/`. `stop --all` stops every run under `.verify/runs/`. Never kill processes by name.

## Helpers

- `control.mjs` is managed by pstack-kit. Fix harness gaps here and the kit's next update will stage its version for you to merge instead of overwriting yours.
- `verify.config.json` holds `launch`, `baseUrl`, `ready`, `doctor` probes, and driver settings.
- `smoke.json` holds journeys. A step is one step kind (`request`, `run`, `log`, `file`, or a driver step) with optional `expect`, `save`, `retry` and `label`. `expect` compares fields of the result: `status`, `json` (the response body), `headers`, `exitCode`, `stdout`, `value`, `rows`, `matched`. `"$present"` matches any non-null value and `"$match:<regex>"` matches a string. `{{!runId}}`, `{{!shortId}}`, `{{!port}}` and `{{!baseUrl}}` are substituted.
- `features/` is the feature map. Read `features/README.md` before driving.
