---
name: code-review
description: "Review the changes since a fixed point along two axes, Standards and Spec. In hstack this is a pointer to the kit's single review convention (review-since and docs/review.md), not a second review skill."
disable-model-invocation: true
---

<!-- Two-axis idea from mattpocock/skills (skills/engineering/code-review @ 4ae2317). MIT License, Copyright (c) 2026 Matt Pocock. See shaping/LICENSE-mattpocock-skills. -->

# Code review: one copy

hstack keeps one code-review skill. Matt's `code-review` and hstack's `review-since` do the same job: check the diff since a fixed point against the repo's standards and against the ticket, in parallel, and report the two axes side by side without reranking. Do not run both.

Use the kit's review convention:

1. **Evidence first**, per [docs/review.md](../../docs/review.md): the PR's Evidence section must prove the Goal on the running app before anyone reads code.
2. **Two axes** on the diff since the fixed point (`git diff <fixed-point>...HEAD`):
   - **Standards**: the project's `AGENTS.md` rule table and the files it names. A documented repo standard wins over any general smell list.
   - **Spec**: the ticket and the plan in `docs/plans/active/`, including the verify journey the ticket named.
3. Report the axes under separate headings. Do not merge or rerank findings across them.

TODO(hstack): consolidate into one skill. `review-since` is the hstack name but is not a file in this repo yet. Either ship `review-since` as a kit skill and delete this stub, or make this the skill and alias the name. Do not keep two. See shaping/TODO.md.
