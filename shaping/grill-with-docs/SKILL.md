---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design that also records the shared glossary and decision records as it goes, in the places the project's AGENTS.md names.
disable-model-invocation: true
---

<!-- Adapted from mattpocock/skills (skills/engineering/grill-with-docs @ 4ae2317). MIT License, Copyright (c) 2026 Matt Pocock. See shaping/LICENSE-mattpocock-skills. -->

# Grill with docs (adapt: stub)

Run the `grilling` skill. As each decision lands, write it down:

- **Glossary terms**: a domain word the user and agent agreed on, with its one-line meaning.
- **Decision records**: a decision that constrains later work, with the options considered and why this one won.

Where they live follows the AGENTS.md convention: `AGENTS.md` is a map of about 100 lines, so it points at the glossary and the decision records rather than holding them. Upstream writes `GLOSSARY.md` and ADR files at fixed paths; hstack does not.

TODO(hstack): pick the paths. Candidates: `docs/glossary.md` and `docs/decisions/NNNN-<slug>.md`, each linked from a row in the AGENTS.md Map table; or the project's Notion space from AGENTS.md Context sources. Whichever is chosen, `to-tickets`, `to-spec` and `triage` read from the same place. See shaping/TODO.md.

TODO(hstack): upstream implements this as `grilling` plus a separate `domain-modeling` skill. Decide whether to copy `domain-modeling` into `shaping/` or keep the doc-writing rules inline here.

## Handoff to hstack

Same as `grilling`. Decisions that settle a plan's design are linked from its "Design settled by" section.
