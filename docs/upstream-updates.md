# Keeping up with upstream: pstack and Matt Pocock's skills

hstack-kit takes from two upstreams, and pins both:

| Upstream | What the kit takes | Pin | Moves by |
|---|---|---|---|
| [pstack](https://github.com/cursor/plugins/tree/main/pstack) | The whole plugin, byte for byte, served from the team marketplace | `vendor/pstack.lock.json` | `scripts/vendor-pstack.mjs bump`, reviewed per [pstack-upgrades.md](pstack-upgrades.md) |
| [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) | Only the shaping set in [shaping/README.md](../shaping/README.md), copied and adapted | `shaping/upstream.lock.json` | Hand adaptation into `shaping/`, recorded with `scripts/upstreams.mjs record` |

**Owner: Alex**, the same owner as the pstack pin. Anyone can prepare an update; the owner approves it by setting `review.approvedBy` in the matching lock. When: on request, or at most monthly. Most upstream changes do not need to be taken.

The agent-facing version of this routine is the [`maintain-hstack-upstreams`](../.cursor/skills/maintain-hstack-upstreams/SKILL.md) skill.

## 1. See what changed

```bash
node scripts/upstreams.mjs report                       # both upstreams, against main
node scripts/upstreams.mjs report --only pstack --pstack-ref <sha>
node scripts/upstreams.mjs report --only matt --matt-ref <sha>
```

The report is JSON. For pstack it gives the pinned and upstream versions, skills added, removed and changed, and the risky files (the same rule as `vendor-pstack.mjs`). For Matt's repo it gives:

- `tracked`: each skill in the shaping lock (adopt, adapt, pattern, and the `watch` list), `unchanged` or `changed since our copy`, with `newSinceReview` true when the change arrived after the last review and `movedTo` when upstream moved its folder.
- `newSkills`: skills added upstream since the last review.
- `otherChanged`: skills we do not take that changed since the last review, for information.

`node scripts/upstreams.mjs check` is the offline half. It runs in `npm test`, so CI fails when a `shaping/` folder is not in the lock, a recorded copy is missing, or a copied skill lost Matt Pocock's copyright notice.

## 2. Decide what is useful

Write the decisions in the PR description, one line per item: take, adapt, watch, or skip, and why.

**pstack**: follow the review checklist in [pstack-upgrades.md](pstack-upgrades.md). Also check whether the bump adds a skill that overlaps the shaping set (pstack already has `tdd`, `teach`, `interrogate`, `architect`). If it does, keep one and update the division table in `shaping/README.md`.

**Matt's skills**, for each `changed`, `newSkills` or `movedTo` entry:

- [ ] **Shaping or building?** Only shaping and scoping skills qualify: interviewing, specs, tickets, intake, planning. Anything that builds, verifies, reviews, merges or teaches is hstack's or pstack's. Skip it, or take the idea as a pattern into an hstack skill.
- [ ] **Duplicate?** Does pstack or hstack already do this (`tdd`, `teach`, `review-since`, Orchestrate, the verification skill)? One owner per step.
- [ ] **Fits the hstack rules?** Slices of about 400 lines, a named verify journey, plans in `docs/plans/`, the AGENTS.md convention for docs, the project's own labels, and a human merging every PR. If the skill merges, pushes, closes issues or deploys, that part is dropped.
- [ ] **Depends on setup?** Upstream skills that say "run `/setup-matt-pocock-skills`" are rewired to the project's `AGENTS.md` and the triage label mapping.
- [ ] **Never the whole plugin.** A change that only makes sense with the full plugin installed is a skip.

## 3. Pull approved changes in

For each approved Matt skill:

1. Show the upstream change from our copy: `node scripts/upstreams.mjs diff --skill <name> --ref <sha>`.
2. Apply it by hand to `shaping/<name>/SKILL.md`, keeping the hstack changes and the notice line under the front matter: `Copied from` or `Adapted from mattpocock/skills (<path> @ <short sha>). MIT License, Copyright (c) 2026 Matt Pocock. See shaping/LICENSE-mattpocock-skills.` Update the short sha.
3. A new skill gets a `shaping/<name>/` folder, an entry in `shaping/upstream.lock.json` with its verdict, and a row in the division table in `shaping/README.md`. If projects should receive it, add the name to `shaping/pack.json` (the `--with shaping` pack). `implement` stays out of that list until decision 6 says otherwise.
4. Update `shaping/TODO.md` and the inline `TODO(hstack):` markers it affects.
5. Record it: `node scripts/upstreams.mjs record --ref <sha> --skill <name> [--skill <other>]`. This moves the reviewed-up-to commit, refreshes the named skills' upstream trees, and clears `review.approvedBy`. Run it with no `--skill` to mark a review where nothing was taken.
6. Run `npm test` (which runs `upstreams.mjs check`).

pstack moves only by `node scripts/vendor-pstack.mjs bump --ref <sha>`, never by hand edits to `vendor/pstack/`.

## 4. Release

1. The owner reviews the PR and sets `review.approvedBy` in each lock that moved.
2. If the change is user-facing (a new or changed skill, a pstack bump, a changed rule), bump `version` in `package.json` (minor for a new capability, patch for fixes), move the `#vX.Y.Z` pins in the README, adapter READMEs and adoption guides, re-apply to both examples so their `.hstack-kit/lock.json` records the new kit version, and add a [CHANGELOG](../CHANGELOG.md) entry.
3. A human merges, then tags `vX.Y.Z` on the merge commit and pushes the tag.

TODO(hstack): decide whether `upstreams.mjs report` runs on a schedule (a weekly GitHub Actions job that opens nothing and only writes the report to the run summary) or stays manual.
