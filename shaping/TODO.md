# Shaping layer: open integration decisions

Each item is also marked inline as `TODO(hstack):` in the file it affects. Resolve one per PR, update the division table in [README.md](README.md) if ownership moves, and delete the item here.

| # | Decision | Where it bites | Options |
|---|---|---|---|
| 1 | Where the glossary and decision records live under the AGENTS.md convention | [grill-with-docs](grill-with-docs/SKILL.md), read by to-tickets, to-spec, triage | `docs/glossary.md` + `docs/decisions/NNNN-<slug>.md` linked from the AGENTS.md Map; or the project's Notion space |
| 2 | Triage label mapping onto each project's GitHub labels | [triage](triage/SKILL.md) | Filled by hand per project; seeded by `hstack-kit apply`; or captured by dr eggbot at bot intake |
| 3 | wayfinder → Orchestrate handoff | [wayfinder](wayfinder/SKILL.md) | Coordinator reads the plan only (map linked from "Design settled by"); or reads both |
| 4 | One code-review skill | [code-review](code-review/SKILL.md) | Ship `review-since` as a kit skill and delete the stub; or make the stub the skill |
| 5 | Default publish target for to-tickets (and to-spec) | [to-tickets](to-tickets/SKILL.md), [to-spec](to-spec/SKILL.md) | GitHub issues; Linear (team key from AGENTS.md); plan file only |
| 6 | implement skeleton wiring to checks, verify smoke, evidence, PR template | [implement](implement/SKILL.md) | Ship as a seed skill in `core/files/.cursor/skills/`; or keep as reference |
| 7 | How the shaping skills reach projects | this folder | A new `core/manifest.json` phase or flag (e.g. `--with shaping`), copied to `.cursor/skills/`; or a second plugin in `.cursor-plugin/marketplace.json`. Either way, never Matt's plugin itself |
| 8 | Skill name collisions | every skill here | Keep upstream names (`grilling`, `to-tickets`), or prefix them (`shape-*`) so they cannot shadow pstack skills |
| 9 | Copy `domain-modeling` and triage's `AGENT-BRIEF.md` / `OUT-OF-SCOPE.md` | [grill-with-docs](grill-with-docs/SKILL.md), [triage](triage/SKILL.md) | Copy and adapt; or keep their rules inline |
| 10 | Where answered questionnaires live | [to-questionnaire](to-questionnaire/SKILL.md) | Current directory; `docs/plans/`; Notion |

Nothing in this list changes existing kit behaviour until it is decided: `hstack-kit apply`, the guard hook, the adapters and the bots are untouched by this folder.
