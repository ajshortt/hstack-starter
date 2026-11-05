---
name: to-spec
description: "Turn the current conversation into a spec whose testing decisions are verify journeys, ready for to-tickets: no interview, just synthesis of what was already discussed."
disable-model-invocation: true
---

<!-- Adapted from mattpocock/skills (skills/engineering/to-spec @ 4ae2317). MIT License, Copyright (c) 2026 Matt Pocock. See shaping/LICENSE-mattpocock-skills. -->

# To spec (adapt: stub)

Synthesize the conversation and the codebase into a spec. Do not interview the user. Use the project's glossary and respect its decision records (see [grill-with-docs](../grill-with-docs/SKILL.md)).

Follow upstream's template (Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes), with one change:

**Testing decisions are verify journeys.** Upstream asks for test seams. In hstack the highest seam is the running app, driven by the project's verification skill. For each user story that changes behaviour, name the journey that proves it: an existing `features/<name>.md` entry or smoke journey, or a new one to add, with what it must read back (rows, cache entries, logs, command output). Unit tests are listed as well, but they are not the proof.

TODO(hstack): copy upstream's full spec template here once the publish target is settled, adapted as above. Decide whether the spec is published to the tracker (upstream), written as the plan's Goal and "Design settled by" link, or both. See shaping/TODO.md.

## Handoff to hstack

A spec is the input to [to-tickets](../to-tickets/SKILL.md). It is not a plan: the plan in `docs/plans/active/` is written by `to-tickets` once the breakdown is approved.
