# Plans

<!-- Managed by hstack-kit. -->

Plans for work that spans more than one PR live here, in the repo, next to the code they change. A plan is a checklist that names the proof for each step. It is not a design document: settle the design with a prototype first, then write the plan.

Skip the plan when the change is one PR with an obvious approach.

## Lifecycle

| Status | Directory | Meaning | Who moves it on |
|---|---|---|---|
| `proposed` | `active/` | Written after a prototype or spike settled the design. Opened as its own small PR. | The plan owner, when the plan PR merges and work starts. |
| `active` | `active/` | Implementation PRs are open or landing. Each PR ticks its task and links its evidence. | Each implementing PR updates `updated:` and its checkbox. |
| `landed` | `done/` | Every task is ticked with proof. The last PR moves the file and fills `## Outcome`. | The last implementing PR. |
| `abandoned` | `done/` | Stopped on purpose. `## Outcome` says why and what was kept. | The owner, in a PR. |

Rules, checked by `scripts/kit/check-plans.mjs` in CI:

- Every plan has front matter with `title`, `status`, `owner`, `linear`, `created` and `updated`.
- `status` matches the directory. `proposed` and `active` live in `active/`; `landed` and `abandoned` live in `done/`.
- Every task under `## Tasks` names its proof with `Proof:`. A ticked task also links its PR.
- A plan in `done/` has a non-empty `## Outcome`.
- An `active` plan not updated for 21 days gets a warning. Update it or abandon it.

## Writing one

1. Copy `_template.md` to `active/<yyyy-mm-dd>-<short-name>.md`.
2. Fill every section. One task is one PR under the diff limit, ordered so each lands in a verifiable state.
3. With pstack, `/poteto-mode` routes multi-PR work to the Multi-phase plan playbook. Tell it to write the plan to this directory, keep this front matter, and use this template's sections. Its own skeleton can go under `## Tasks`.
4. Open the plan as its own PR. Review it for scope and sequencing, not for theoretical risks.

Plans link to Linear issues and Notion docs; they do not copy them.
