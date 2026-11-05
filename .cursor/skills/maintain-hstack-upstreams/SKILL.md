---
name: maintain-hstack-upstreams
description: "Check hstack-kit's two upstreams (pstack and mattpocock/skills) for changes since the pins, recommend what to take, and prepare a PR that pulls in only approved changes. Use for 'check upstreams', 'update pstack', 'sync Matt's skills', or the monthly upstream review."
disable-model-invocation: true
---

# Maintain hstack upstreams

The routine is [docs/upstream-updates.md](../../../docs/upstream-updates.md). Follow it; this skill is the order of work.

1. **Report.** Run `node scripts/upstreams.mjs report`. If both upstreams show nothing new, say so and stop.
2. **Recommend.** For every pstack skill change and every Matt entry that is `changed since our copy` with `newSinceReview`, in `newSkills`, or `movedTo`, read the upstream change (`node scripts/upstreams.mjs diff --skill <name>` for Matt's) and apply the checklist in section 2 of the routine. Present one line per item: take, adapt, watch or skip, and why. Wait for the owner's choice before changing files.
3. **Pull in** what was approved, on a branch:
   - pstack: `node scripts/vendor-pstack.mjs bump --ref <sha>`, then the steps in [docs/pstack-upgrades.md](../../../docs/pstack-upgrades.md).
   - Matt: adapt by hand into `shaping/<name>/SKILL.md`, keep the MIT notice line, update `shaping/README.md`, `shaping/TODO.md` and the lock, then `node scripts/upstreams.mjs record --ref <sha> --skill <name>`.
4. **Prove.** `npm test`, `npm run vendor:check`, `npm run example:status`, `npm run example:react:status`.
5. **Release** if the change is user-facing: section 4 of the routine.
6. **Open the PR** with the report, the decisions, and the release steps. Leave `review.approvedBy` null. A human approves, merges and tags.

Never install Matt Pocock's plugin, never copy his whole skill tree, and never edit `vendor/pstack/` by hand.
