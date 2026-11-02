<!-- Managed by pstack-kit. Reviewers read Evidence first, then Risk, then a sample of the diff. See the kit's docs/review.md. -->

## Goal

<!-- One or two sentences: who this is for, what changes for them, and the Linear issue or plan it serves. -->

Linear: <!-- ABC-123 or "none" -->
Plan: <!-- docs/plans/active/<file>.md or "none" -->

## Evidence

<!-- Proof on the real Worker, not "tests pass". Paste the verification skill's summary.md table, the commands you ran, and read-backs of the state that changed. Name the evidence directory or CI artifact. -->

- Verification run: <!-- .verify/evidence/<run-id>/ or the CI "verify-evidence" artifact -->
- Journeys driven: <!-- feature map entries exercised, e.g. create-link, archive-queue -->
- Tests added or changed: <!-- file and case -->

## Risk

<!-- What could break, for whom, and how we would notice. Tick every area this PR touches. Reviewers read these files in full. -->

- [ ] None of the areas below
- [ ] `wrangler.jsonc` (bindings, routes, crons, compatibility date or flags)
- [ ] D1 migrations
- [ ] Durable Object classes or their migrations
- [ ] Queue producers or consumers (at-least-once, idempotency)
- [ ] Auth, input parsing, or anything handling untrusted data
- [ ] Agent policy (`AGENTS.md`, `.cursor/`, `.github/`, `scripts/kit/`)

Rollback: <!-- how to undo after deploy, e.g. "revert; no data migration" -->

## Diff size

<!-- CI reports changed lines and warns above the limit. Explain anything over it, or link the stacked PRs it was split into. -->

- Changed lines (excluding generated files): <!-- from the diff-limit check -->
- Over the limit because: <!-- or "n/a" -->

## Human gates

- [ ] A human reviewed the evidence and the risky files and merges this PR.
- [ ] Deploy, secrets, remote D1 or DNS steps after merge are listed here for a human to run: <!-- or "none" -->
