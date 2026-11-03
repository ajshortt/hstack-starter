# Model policy

**Cheaper models by default. Frontier models only when a person asks for them.**

pstack picks a model for each role (implementing delegate, explorers, judges, review panels) from a `pstack-models.mdc` rule. Its built-in defaults are frontier models at `xhigh` effort, which costs several times more than a plain agent chat for a single `/poteto-mode` run. The kit replaces those defaults for the whole team.

## The team configuration

The kit installs `.cursor/rules/pstack-models.mdc` in every project as a managed, always-applied rule. It is the `/setup-pstack` output for the **small (medium reasoning)** budget, with the roles remapped to cheaper families:

| Roles | Model | Why |
|---|---|---|
| Code delegates: feature, refactoring, bug-fix, perf-issue, hillclimb; swarm workers; how explorer; why investigators; reflect tooling | `composer-2.5` | Routine, tool-heavy work where speed and price matter more than depth |
| Judgment and prose; how explainer; why synthesizer; reflect judgment | `claude-sonnet-5-5-medium` | Reading, deciding and writing for humans |
| Hardest tasks | `claude-sonnet-5-5-high` | The one role pstack reserves for hard calls |
| Arena and architect runners | `claude-sonnet-5-5-medium`, `composer-2.5` | Two different families, so the runners disagree usefully |
| Interrogate reviewers; arena cross-judge pool | `claude-sonnet-5-5-medium`, `gpt-5.6-sol-medium` | Reviewers and judges from different families than the author, so they do not share its blind spots |

Panel sizes stay at two. Every slug was checked against the models a Cursor cloud agent could select on 2026-11-02. Confirm them against your own plan; `/setup-pstack` lists what you have.

## Escalating to frontier models

The rule tells agents never to escalate on their own. A person escalates by saying so in the chat: "use frontier", "max rigor", or by naming a frontier model. The agent then switches the named roles (or all roles) to the frontier lines at the bottom of the rule, which are pstack 0.15.36's own defaults (`claude-opus-5-5-xhigh` and `grok-4.7-xhigh-fast`), and says which roles it escalated.

Reasonable times to ask: a production incident, a data migration, a security-sensitive change, or an `/interrogate` on a contested design.

## `/setup-pstack` and personal settings

`/setup-pstack` writes a personal rule at `~/.cursor/rules/pstack-models.mdc`. The project rule from the kit says it is the team default and wins over a personal file, and both are always-applied, so agents see both. To avoid any ambiguity, either do not run `/setup-pstack`, or run it and give these answers so the two files agree:

1. Budget: **`small — medium reasoning`**.
2. When it shows the roles, change them to match the table above: `composer-2.5` for code roles, swarm workers, how explorer, why investigators and reflect tooling; `claude-sonnet-5-5-medium` for judgment and prose roles; `claude-sonnet-5-5-high` for hardest tasks; the two-entry panel lists exactly as in the table.
3. Accept.

Cloud agents and engineer bots have no personal rule, so they always use the project rule.

## Changing the policy

The policy is part of the kit. Change `core/files/.cursor/rules/pstack-models.mdc` and this page in one PR, re-apply to the example, and release a kit version. Projects pick it up on their next `apply`. A project that needs a different policy edits its copy; the kit then keeps the local version and flags each new kit version as a conflict to review, rather than overwriting it.

When pstack bumps add, rename or remove roles, the bump PR updates this rule (see the checklist in [pstack-upgrades.md](pstack-upgrades.md)).

Measure before widening: compare Cursor usage spend per merged PR during the phase 0 pilot against the baseline before changing budgets.
