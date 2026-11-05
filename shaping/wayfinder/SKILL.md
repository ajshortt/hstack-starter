---
name: wayfinder
description: Plan a chunk of work too big and unclear for one session as a shared map of decision tickets, resolved one at a time until nothing is left to decide, then hand off to hstack's Orchestrate. Planning only.
disable-model-invocation: true
---

<!-- Adapted from mattpocock/skills (skills/engineering/wayfinder @ 4ae2317). MIT License, Copyright (c) 2026 Matt Pocock. See shaping/LICENSE-mattpocock-skills. -->

# Wayfinder (adapt: stub)

Use upstream's model: a **map** issue labelled `wayfinder:map` names the **destination**; its child issues are **decision tickets** (`wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`); the **frontier** is the open, unblocked, unclaimed tickets; one ticket is resolved per session; fog that cannot be ticketed yet goes under "Not yet specified".

hstack changes:

- **Planning only, always.** Upstream lets an effort's Notes carry execution into the map. hstack does not: the map ends when nothing is left to decide. Execution is hstack's.
- **No PRs from the map.** Research findings may go on a throwaway branch, but nothing from the map opens a PR or merges.
- **Grilling tickets** run [grill-with-docs](../grill-with-docs/SKILL.md).

## Handoff to hstack

When the frontier is empty, the destination is usually a spec. Run [to-spec](../to-spec/SKILL.md), then [to-tickets](../to-tickets/SKILL.md), which writes the plan in `docs/plans/active/`. A program of many stacked PRs then runs under the Orchestrate playbook (`vendor/pstack/skills/poteto-mode/playbooks/orchestrate.md`), whose kickoffs name each ticket's verify journey as the evidence.

TODO(hstack): define the wayfinder → Orchestrate handoff exactly: what the coordinator reads (the map, the plan, or both), and whether the map is closed or linked from the plan's "Design settled by". See shaping/TODO.md.

TODO(hstack): the `wayfinder:*` labels must exist in the project's GitHub repo. Add them to the label mapping in [triage](../triage/SKILL.md).
