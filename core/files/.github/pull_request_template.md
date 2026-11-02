<!-- Managed by pstack-kit. Reviewers read Evidence first, then Risk, then a sample of the diff. See the kit's docs/review.md. -->

## Goal

<!-- One or two sentences: who this is for, what changes for them, and the Linear issue or plan it serves. -->

Linear: <!-- ABC-123 or "none" -->
Plan: <!-- docs/plans/active/<file>.md or "none" -->

## Evidence

<!-- Proof on the running system, not "tests pass". Paste the verification skill's summary.md table, the commands you ran, and read-backs of the state that changed. Name the evidence directory or CI artifact. -->

- Verification run: <!-- .verify/evidence/<run-id>/ or the CI "verify-evidence" artifact -->
- Journeys driven: <!-- feature map entries exercised -->
- Tests added or changed: <!-- file and case -->

## Risk

<!-- What could break, for whom, and how we would notice. Tick every area this PR touches. Reviewers read these files in full. Your stack's specifics are in AGENTS.md. -->

- [ ] None of the areas below
- [ ] Runtime or deploy configuration (environment, bindings, routes, schedules, infrastructure code)
- [ ] Database schema or data migrations
- [ ] Background work: queues, jobs, schedules, retries (at-least-once, idempotency)
- [ ] Auth, input parsing, or anything handling untrusted data
- [ ] Dependencies added, removed or upgraded
- [ ] Agent policy (`AGENTS.md`, `.cursor/`, `.github/`, `.pstack-kit/`, `scripts/kit/`)

Rollback: <!-- how to undo after deploy, e.g. "revert; no data migration" -->

## Diff size

<!-- CI reports changed lines and warns above the limit. Explain anything over it, or link the stacked PRs it was split into. -->

- Changed lines (excluding generated files): <!-- from the diff-limit check -->
- Over the limit because: <!-- or "n/a" -->

## Human gates

- [ ] A human reviewed the evidence and the risky files and merges this PR.
- [ ] Deploy, secrets, remote data, infrastructure or DNS steps after merge are listed here for a human to run: <!-- or "none" -->
