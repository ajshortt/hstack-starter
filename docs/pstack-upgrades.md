# pstack: the pin and how it moves

The team runs pstack **0.15.36**. Nobody gets a newer version until its owner has reviewed the upstream changes and approved them in a PR to this repo.

**Owner: Alex.** Alex reviews and approves every bump, and names a delegate in this file when they are away. The approver's name is recorded in `vendor/pstack.lock.json` under `review.approvedBy`, and CI refuses to merge a change to `vendor/` without it.

## How the pin is enforced

Cursor's public marketplace updates plugins automatically, so "pin" has to mean that the team never installs pstack from it.

1. `vendor/pstack/` is pstack 0.15.36, byte-for-byte from `cursor/plugins` at commit `ae5650febf4320793844c12c4adaa937f417f8da` (pstack tree `4719e1c4b4c43bac85d4206a8b41dd2899769c1c`). Nobody edits it by hand.
2. `vendor/pstack.lock.json` records the version, upstream commit, upstream tree hash and approver.
3. `node scripts/vendor-pstack.mjs check` recomputes the git tree hash of `vendor/pstack/` and fails if it differs from the lock, if the plugin manifest version differs, or if `.cursor-plugin/marketplace.json` points elsewhere. `kit.yml` runs it on every push. On PRs that touch `vendor/` or the marketplace file, it adds `--require-approval`.
4. This repo is a **Cursor team marketplace** (`.cursor-plugin/marketplace.json` serves `vendor/pstack`). A Cursor team admin adds this repository as a team marketplace once, in the team dashboard's plugin settings, and sets pstack to **Required**, so every team member and cloud agent gets the reviewed copy.
5. Engineers uninstall any pstack they installed from the public marketplace, so only one copy is loaded.
6. Each project's `.cursor/settings.json` (written by the kit) enables pstack for that repo. Its `AGENTS.md` names the pinned version, and the kit records it in `.pstack-kit/lock.json`.

## Bumping the version

Who: anyone can prepare a bump; only the owner approves it. When: on request, or at most monthly. pstack releases often (0.15.9 to 0.15.36 in under a month), and most releases do not need to be taken.

1. **Pick the commit.** Find the upstream commit on `cursor/plugins` main whose `pstack/.cursor-plugin/plugin.json` has the target version.
2. **Vendor it on a branch.**

```bash
node scripts/vendor-pstack.mjs bump --ref <commit-sha>
```

This replaces `vendor/pstack/` with `git archive` output for that commit, rewrites the lock with `approvedBy: null`, and prints `changedFiles` and `riskyFiles`. A file counts as risky if it is executable code, a dependency manifest or lockfile, a hook or MCP config, the plugin manifest, or anything under `scripts/` or `automations/`.
3. **Update** the version in `.cursor-plugin/marketplace.json`, and `pstackVersion` wherever the kit renders it (it is read from the lock, so this is usually automatic).
4. **Review** with the checklist below. Write the findings in the PR description. An agent can do the first pass (`/interrogate` on the vendored diff works well), but the owner reads every risky file themselves.
5. **Try it.** Install the branch's marketplace in a Cursor profile, then run `/poteto-mode` on a real small task in `examples/shortlinks` and run `/maintain-verification-skill` against `verify-shortlinks`. Both must finish with the kit's rules and hook guard intact.
6. **Approve.** The owner sets `review.approvedBy` to their name and `review.notes` to a one-line summary, then approves the PR. `vendor-pstack check --require-approval` must pass.
7. **Release.** Merge, tag the kit (`vX.Y.Z`), and announce the bump in the team channel with anything that changes how people work. The marketplace serves the new version from the default branch.

### Review checklist

- [ ] **New capabilities.** Any new `hooks.json`, `mcp.json`, plugin `hooks`/`mcpServers` entries, or `agents/` definitions? Hooks and MCP run with the user's permissions; anything new needs a written reason to accept it.
- [ ] **Scripts.** Read every changed script under `skills/**/scripts/` and `automations/`. Look for network calls, writes outside the project or `/tmp`, `curl | sh`, `eval`, and commands that would bypass the kit's always-pause list (merge, deploy, secrets, remote data, DNS, force-push).
- [ ] **Dependencies.** Changed `package.json` or `bun.lock` files: are versions pinned and the lockfile frozen? Any new package, or any download without a checksum?
- [ ] **Autonomy.** Does any skill change what agents do without asking: auto-merging, `autopilot-full` defaults, Bugbot or automation triggers, or anything that posts to Slack, Linear or GitHub? These must still stop where `autonomy.mdc` says they stop.
- [ ] **Model defaults.** New or renamed role lines in `setup-pstack`. If the role list changed, update `core/files/.cursor/rules/pstack-models.mdc` and [model-policy.md](model-policy.md) in the same PR.
- [ ] **Verification skills.** Changes to `create-verification-skill` or `maintain-verification-skill` that conflict with the kit's harness layout (`control.mjs`, `verify.config.json`, `smoke.json`, `features/`). Update the kit's skill template if needed.
- [ ] **Plan files.** Changes to the Multi-phase plan playbook or `check-plan.mjs` that conflict with `docs/plans/` and its front matter.
- [ ] **License.** Still MIT, still credited to Lauren Tan.

## Initial pin review

The 0.15.36 pin was vendored on 2026-11-02 and pre-reviewed by an agent. Owner sign-off is pending: `approvedBy` is `null` until Alex has read this section and the risky files.

- **Contents.** 573 files: 58 skills, 2 agents (`poteto-agent`, `comment-sicko`), the dormant `automations/benny` sources, docs and assets. `plugin.json` declares only `skills` and `agents`.
- **No hooks or MCP servers.** pstack ships no `hooks.json` and no `mcp.json`, so installing it adds no code that runs automatically.
- **Scripts that run when a skill calls them:**
  - `skills/poteto-mode/scripts/`: `check-plan.mjs` (local file checks) and `watch-pr/` (Bun CLI that reads PR state from GitHub through `gh`). Its dependency is `commander@14.0.0` with a committed `bun.lock`. The `bun-types` and `typescript` dev dependencies are set to `latest`; they only matter for upstream's own tests and type checks.
  - `skills/statechart/scripts/`: the TLA+ statechart pipeline (Node). It downloads `tla2tools.jar` v1.7.4 from the official tlaplus GitHub release, pinned by SHA-256. Its only dev dependency is `fast-check@4.5.3`.
  - The other skills are Markdown instructions only.
- **Autonomy.** pstack's own always-pause list already includes deploys. Its autopilot-full mode can merge PRs. The kit blocks that in three places: `autonomy.mdc` says a human merges every PR, the hook guard denies `gh pr merge` and the GitHub merge MCP tools, and branch protection requires a human approval.
- **Benny (Slack issue triage and repro automations)** is dormant: its files do not register as skills until someone installs them into a repo. That matches the decision to defer the Slack → Linear → draft PR outer loop.
- **Model defaults** are author-specific (`claude-opus-5-5-xhigh`, `grok-4.7-xhigh-fast`). The kit overrides them with the team's cheaper policy ([model-policy.md](model-policy.md)).
