# Shaping layer: open integration decisions

Each open item is also marked inline as `TODO(hstack):` in the file it affects. Resolve one per PR, update the division table in [README.md](README.md) if ownership moves, and delete the item here.

| # | Decision | Where it bites | Options |
|---|---|---|---|
| 1 | Where the glossary and decision records live under the AGENTS.md convention | [grill-with-docs](grill-with-docs/SKILL.md), read by to-tickets, to-spec, triage | `docs/glossary.md` + `docs/decisions/NNNN-<slug>.md` linked from the AGENTS.md Map; or the project's Notion space |
| 2 | Triage label mapping onto each project's GitHub labels | [triage](triage/SKILL.md) | Filled by hand per project; seeded by `hstack-kit apply`; or captured by dr eggbot at bot intake |
| 3 | wayfinder → Orchestrate handoff | [wayfinder](wayfinder/SKILL.md) | Coordinator reads the plan only (map linked from "Design settled by"); or reads both |
| 4 | One code-review skill | [code-review](code-review/SKILL.md) | Ship `review-since` as a kit skill and delete the stub; or make the stub the skill |
| 5 | Default publish target for to-tickets (and to-spec) | [to-tickets](to-tickets/SKILL.md), [to-spec](to-spec/SKILL.md) | GitHub issues; Linear (team key from AGENTS.md); plan file only |
| 6 | implement skeleton wiring to checks, verify smoke, evidence, PR template | [implement](implement/SKILL.md) | Add it to the `--with shaping` pack in [pack.json](pack.json); or keep it as a kit reference. The pack does not install it today |
| 8 | Skill name collisions | every skill here | Keep upstream names (`grilling`, `to-tickets`), or prefix them (`shape-*`) so they cannot shadow pstack skills. The `--with shaping` pack uses the upstream names until this is decided |
| 9 | Copy `domain-modeling` and triage's `AGENT-BRIEF.md` / `OUT-OF-SCOPE.md` | [grill-with-docs](grill-with-docs/SKILL.md), [triage](triage/SKILL.md) | Copy and adapt; or keep their rules inline |
| 10 | Where answered questionnaires live | [to-questionnaire](to-questionnaire/SKILL.md) | Current directory; `docs/plans/`; Notion |

## Resolved

| # | Decision | Choice |
|---|---|---|
| 7 | How the shaping skills reach projects | Opt-in `hstack-kit apply --with shaping`. The kit copies the adopted and adapted skills into `.cursor/skills/<name>/` as seeds and records `"with": ["shaping"]` in `.hstack-kit/config.json` and `lock.json`. Not a new phase (0–2 stay). Not a second plugin. Never install mattpocock/skills beside pstack. `implement` is not part of this pack (decision 6). |

The open items do not change `hstack-kit apply`, the guard hook, the adapters or the bots until they are decided. Decision 7 is the exception: it is the `--with shaping` flag above, and it is off unless a project opts in.
