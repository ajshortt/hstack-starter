# Shaping layer: Matt Pocock's skills, upstream of the hstack loop

Matt Pocock's skills shape and scope the work: interviewing until the plan is clear, and slicing it into tickets. hstack builds the work and proves it works: verify, evidence, and a human merge. This folder puts a small, chosen set of his skills **upstream** of the hstack loop. The kit owns these copies. It does not install his plugin.

Source: [mattpocock/skills](https://github.com/mattpocock/skills), MIT License, Copyright (c) 2026 Matt Pocock. The full license text is in [LICENSE-mattpocock-skills](LICENSE-mattpocock-skills). Every file here that copies or adapts his text carries that notice. The upstream commit each skill came from is recorded in [upstream.lock.json](upstream.lock.json).

Deck: "HStack starter + Matt Pocock's skills", the brief this layout follows.

## The flow

```
Matt's shaping layer (shaping/)                      hstack loop (core/, vendored pstack)
─────────────────────────────────                    ──────────────────────────────────────────────
grilling / grill-me ─┐                               digest → verify → scope → build → validate
grill-with-docs ─────┤                                          │         │          │
to-questionnaire ────┼─→ to-spec ─→ to-tickets ─→  plan file in docs/plans/active/  │
wayfinder ───────────┤       (≤ ~400 lines per slice,  Orchestrate for multi-PR work │
triage ──────────────┘        each names its verify journey)                          ↓
                                                     verify smoke → evidence → PR template → human merge
```

Shaping ends when the tickets are approved: every ticket fits in about 400 changed lines and names the verify journey that will prove it. From that point hstack owns the work. Shaping skills never build, open PRs or merge.

## Who owns what

Each step has exactly one owner.

| Step | Owner | Skill(s) | Verdict | Here |
|---|---|---|---|---|
| Interview to align on a plan | Matt | `grilling`, `grill-me` (shortcut) | Adopt | [grilling](grilling/SKILL.md), [grill-me](grill-me/SKILL.md) |
| Shared language and decisions | Matt (adapted) | `grill-with-docs` | Adapt: glossary and decision records follow the AGENTS.md convention | [grill-with-docs](grill-with-docs/SKILL.md) |
| Answers from stakeholders | Matt | `to-questionnaire` | Adopt | [to-questionnaire](to-questionnaire/SKILL.md) |
| Spec handoff | Matt (adapted) | `to-spec` | Adapt: testing decisions become verify journeys | [to-spec](to-spec/SKILL.md) |
| Large, unclear efforts | Matt (adapted), then hstack | `wayfinder` → Orchestrate | Adapt: planning only, ends when nothing is left to decide | [wayfinder](wayfinder/SKILL.md) |
| Intake | Matt (adapted) | `triage` | Adapt: map roles onto the project's GitHub labels | [triage](triage/SKILL.md) |
| Break work into tickets | Matt plus hstack rules | `to-tickets` | Adopt, with the ~400-line and verify-journey rules | [to-tickets](to-tickets/SKILL.md) |
| Plan, scope, build | hstack | plan files, Orchestrate, hstack `implement` | hstack owns | `docs/plans/` (core), `vendor/pstack/skills/poteto-mode/playbooks/orchestrate.md` |
| Implementation skeleton | hstack, built on Matt's | `implement` | Pattern only: kit reference, not installed by `--with shaping` | [implement](implement/SKILL.md) |
| Run tickets in order | hstack | idea from `implement-spec` | Pattern only: ticket ordering; drop the branch-merging helper | folded into [implement](implement/SKILL.md) |
| Verify and evidence | hstack | the verification skill (`verify-<project>`, e.g. `verify-api`), verify smoke, evidence | hstack owns | `core/files/.cursor/skills/verify-{{projectName}}/` |
| Code review | One copy | `review-since` / `code-review` | Keep one copy | [code-review](code-review/SKILL.md) points at [docs/review.md](../docs/review.md) |
| Merge | Human | human-merge rule | hstack owns | `core/files/.cursor/rules/autonomy.mdc`, the guard hook |

hstack owns, and this folder never redefines: digest, verify, scope, build, validate, verify-api, review-since, Orchestrate, plan files, the ~400-line slice limit, verify-journey naming, verify smoke, evidence, the PR template and the human-merge rule.

## Verdicts

| Adopt | Adapt | Pattern only | Drop |
|---|---|---|---|
| `grilling`, `grill-me`, `to-tickets` (with hstack rules), `to-questionnaire`, code review (one copy) | `grill-with-docs`, `to-spec`, `wayfinder`, `triage` | `implement` (as the hstack skeleton), `implement-spec` (ticket ordering only) | `setup-matt-pocock-skills`: hstack setup configures the tracker, labels and docs |

**Never install his whole plugin beside pstack.** A full install duplicates TDD (`tdd`), review (`code-review`) and teaching (`teach`), all of which pstack already ships, and an agent choosing a playbook from one-line descriptions can pick the wrong one. Only the skills in the table above are taken, and only through this folder. Projects receive the adopted and adapted ones with `--with shaping`, not by installing the plugin.

## Status

Projects opt in. `hstack-kit apply --with shaping` copies the adopted and adapted skills into `.cursor/skills/<skill-name>/` as seeds: written once, then the project may edit them. The skills are `grilling`, `grill-me`, `to-questionnaire`, `to-tickets`, `grill-with-docs`, `to-spec`, `wayfinder`, `triage` and `code-review`. The default is off. An apply without the flag does not install them, and an existing project does not gain them until someone passes the flag.

The choice is saved in `.hstack-kit/config.json` as `"with": ["shaping"]` and copied into `.hstack-kit/lock.json`, the same way an adapter is remembered. Later applies add any new seed the pack ships. They do not overwrite a skill the project already has. `status` prints `with: shaping` or `with: none`.

This is not a new adoption phase (0–2 are unchanged) and not a second marketplace plugin. The kit never installs mattpocock/skills as a plugin.

`implement` stays in this folder as a kit reference (decision 6). It is not copied. Skill names stay the upstream names (`grilling`, `grill-me`, …). Renaming is decision 8 and is still open.

The list of installed skills is [pack.json](pack.json). Root files in this folder (`README.md`, `TODO.md`, `LICENSE-mattpocock-skills`, `upstream.lock.json`) are not copied into the project. Each skill file keeps its MIT notice.

Open decisions that remain are in [TODO.md](TODO.md), marked inline as `TODO(hstack):`.

Keeping this folder current with upstream is in [docs/upstream-updates.md](../docs/upstream-updates.md).
