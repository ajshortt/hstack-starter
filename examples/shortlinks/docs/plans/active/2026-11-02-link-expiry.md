---
title: Let links expire
status: proposed
owner: "@hugeinc/shortlinks-owners"
linear: none
created: 2026-11-02
updated: 2026-11-02
---

# Let links expire

## Goal

Campaign owners want short links that stop redirecting after a date, so stale campaign URLs do not keep sending traffic. Expired links return `410 Gone`. Links without an expiry keep working exactly as today.

## Design settled by

The example plan for the kit. A real plan links the prototype branch or `/architect` output here.

## Out of scope

- Deleting expired links or their R2 archives.
- Editing the expiry of an existing link.

## Tasks

- [ ] Add a nullable `expires_at` column in `migrations/0002_link_expiry.sql` and accept `expiresAt` in `CreateLinkInput`. Proof: Vitest case creating a link with `expiresAt` reads it back; `smoke --feature create-link` still passes. PR: <link when opened>
- [ ] Return `410 Gone` from `/r/:slug` once `expires_at` has passed, without counting the click. Proof: new `redirect` smoke step on a seeded expired link shows `410` and `clicks` unchanged. PR: <link when opened>
- [ ] Count expired links in the hourly report. Proof: `report-cron` smoke journey expects the new `expiredLinks` field. PR: <link when opened>

## Risks and human gates

- The KV cache holds targets for an hour, so an expired link could still redirect from cache. Task 2 must check expiry on cache hits too; its smoke step covers a cached slug.
- Human steps: apply `0002_link_expiry.sql` to the remote D1 database before deploying task 1 (`wrangler d1 migrations apply DB --remote`, run by a human).

## Outcome

