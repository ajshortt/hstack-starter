---
name: to-tickets
description: Break a plan, spec, or the current conversation into tracer-bullet tickets, each under about 400 changed lines, each naming the verify journey that proves it, with blocking edges, published to the project's tracker and mirrored into the plan file.
disable-model-invocation: true
---

<!-- Adapted from mattpocock/skills (skills/engineering/to-tickets @ 4ae2317). MIT License, Copyright (c) 2026 Matt Pocock. See shaping/LICENSE-mattpocock-skills. hstack changes: the two hstack slice rules, the plan file, and tracker setup coming from the project's AGENTS.md instead of /setup-matt-pocock-skills. -->

# To Tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

The tracker and triage labels come from the project's `AGENTS.md` (Context sources) and [triage](../triage/SKILL.md)'s label mapping. If they are missing, ask the user; do not invent them.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect decision records in the area you're touching (see [grill-with-docs](../grill-with-docs/SKILL.md) for where those live).

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

Read the project's verification skill (`.cursor/skills/verify-<project>/SKILL.md` and `features/README.md`) so each ticket can name a journey that exists, or say which new one it adds.

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

<hstack-slice-rules>

- **About 400 changed lines.** Each ticket is one PR that fits the kit's diff limit (`scripts/kit/diff-limit.mjs`, `diffLimit.lines` in `.hstack-kit/config.json`). If a slice will not fit, split it again. Generated files the diff limit excludes do not count.
- **Name the verify journey.** Each ticket names the verification skill journey that proves it: an existing `features/<name>.md` entry or smoke journey, or a new one the ticket adds. "Tests pass" is not a journey.

</hstack-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. Each batch still respects the 400-line rule.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work
- **Verify journey**: the journey that proves it
- **Size**: estimated changed lines

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish

Write the approved tickets into a plan in `docs/plans/active/` using `docs/plans/_template.md`: one task line per ticket, in dependency order, with its proof set to the verify journey. The plan is hstack's record; the tracker is where people pick work up.

Then publish one ticket per task to the tracker, blockers first, so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking relationship where it has one; otherwise list "Blocked by" in the body. If the source was an existing issue, make each ticket its sub-issue. Apply the project's label for `ready-for-agent` unless instructed otherwise.

TODO(hstack): default publish target when the project has not said: GitHub issues, Linear, or plan file only. See shaping/TODO.md.

Do NOT close or modify any parent issue.

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Verify journey

The verification skill journey that proves it, and what it must show.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None (can start immediately)". Omit this section when blockers were set as native edges.

Plan: `docs/plans/active/<file>.md`

</issue-template>

Avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype.

## Handoff to hstack

Shaping ends here. hstack's build loop takes the frontier tickets in order (see [implement](../implement/SKILL.md)); multi-PR programs go to the Orchestrate playbook. A human merges every PR.
