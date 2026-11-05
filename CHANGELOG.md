# Changelog

Each release is a git tag `vX.Y.Z`. Projects move to it by changing the tag in their `apply` command.

## 0.3.0

- **Shaping layer** in [`shaping/`](shaping/README.md): kit-owned copies of Matt Pocock's shaping skills (`grilling`, `grill-me`, `to-questionnaire`, `to-tickets`, `code-review` as a pointer; `grill-with-docs`, `to-spec`, `wayfinder`, `triage` as adapted stubs; `implement` as the hstack skeleton). Documents who owns each step between shaping and the hstack loop. MIT, Copyright (c) 2026 Matt Pocock. Scaffolding only: `apply` does not install these yet; open decisions are in [`shaping/TODO.md`](shaping/TODO.md).
- **Upstream update routine** in [docs/upstream-updates.md](docs/upstream-updates.md), with `scripts/upstreams.mjs` (`report`, `diff`, `record`, `check`), the `shaping/upstream.lock.json` pin for mattpocock/skills, and the `maintain-hstack-upstreams` skill. `npm test` now checks that copied skills keep the MIT notice.
- No change to the files `apply` writes, the guard hook, the adapters or the bots, other than the version recorded in `.hstack-kit/lock.json`.

## 0.2.1

- Monorepo Wrangler lookup, lockfile install, and per-target CI check names. Install pins moved to `#v0.2.1`.

## 0.2.0

- Stack-agnostic core plus optional adapters (`workers`, `react`). Renamed from pstack-kit.

## 0.1.0

- Workers-only kit.
