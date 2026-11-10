# Changelog

Each release is a git tag `vX.Y.Z`. Projects move to it by changing the tag in their `apply` command.

## 0.3.2

- **Shaping seeds install at the git root.** `--with shaping` writes `.cursor/skills/` at the git root, the same place as `hooks.json`. A monorepo `apply --target apps/web --with shaping` no longer nests those skills under `apps/web/.cursor/skills/`. A second target in the same repo sees the existing seeds and does not overwrite them. A project whose target is already the git root is unchanged.
- **Stale seed lock cleanup.** A `seed` lock entry the kit no longer ships is dropped from `.hstack-kit/lock.json` once that file is gone. The kit still never deletes files. While the old file is present, the entry stays and `apply` prints a note that you can delete the copy.
- **Monorepos that applied v0.3.1 with a nested target.** Re-run `apply --write`. The kit copies the skills to the git root `.cursor/skills/` and leaves the nested copies in place. Delete the old `apps/<name>/.cursor/skills/<skill>/` directories when you no longer need them, then re-run `apply --write` to drop those paths from the lock. See [docs/adoption-existing-project.md](docs/adoption-existing-project.md#monorepos-that-applied-v031-with-a-nested-target).

## 0.3.1

- **`--with shaping`**: opt-in on `apply` copies the shaping skills into `.cursor/skills/` as seeds (`grilling`, `grill-me`, `to-questionnaire`, `to-tickets`, `grill-with-docs`, `to-spec`, `wayfinder`, `triage`, `code-review`). Default off, so existing installs are unchanged. Recorded in `.hstack-kit/config.json` and `lock.json` as `"with": ["shaping"]`. Not a new phase and not a second plugin. `implement` stays a kit reference and is not copied.

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
