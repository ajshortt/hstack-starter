import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  getQueueResult,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { BLOCKLIST_KEY } from "../src/links";

const call = (path: string, init?: RequestInit) =>
  exports.default.fetch(new Request(`http://example.test${path}`, { redirect: "manual", ...init }));

const createLink = (body: unknown) =>
  call("/api/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("links API", () => {
  it("creates a link and redirects through it, counting the click", async () => {
    const created = await createLink({ url: "https://example.com/docs", slug: "docs" });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ slug: "docs", url: "https://example.com/docs" });

    const redirect = await call("/r/docs");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("https://example.com/docs");

    const stats = await call("/api/links/docs/stats");
    expect(await stats.json()).toEqual({ slug: "docs", clicks: 1 });
  });

  it("rejects a taken slug, an invalid url and a blocked host", async () => {
    await createLink({ url: "https://example.com", slug: "taken" });
    expect((await createLink({ url: "https://example.org", slug: "taken" })).status).toBe(409);
    expect((await createLink({ url: "ftp://example.com" })).status).toBe(400);

    await env.LINK_CACHE.put(BLOCKLIST_KEY, JSON.stringify(["evil.example"]));
    const blocked = await createLink({ url: "https://evil.example/login" });
    expect(blocked.status).toBe(422);
    expect(await blocked.json()).toMatchObject({ error: "host_blocked" });
  });

  it("returns 404 for unknown slugs", async () => {
    expect((await call("/r/nope")).status).toBe(404);
    expect((await call("/api/links/nope")).status).toBe(404);
  });

  it("reports healthy bindings", async () => {
    const health = await call("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, checks: { d1: { ok: true }, kv: { ok: true }, r2: { ok: true } } });
  });
});

describe("queue consumer", () => {
  it("archives a created link to R2 and marks it archived in D1", async () => {
    await createLink({ url: "https://example.com/a", slug: "archive-me" });
    const batch = createMessageBatch("shortlinks-events", [
      { id: "m1", timestamp: new Date(), attempts: 1, body: { type: "link.created", slug: "archive-me" } },
      { id: "m2", timestamp: new Date(), attempts: 1, body: { type: "garbage" } },
    ]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env, ctx);
    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks.sort()).toEqual(["m1", "m2"]);

    const object = await env.ARCHIVE.get("archive/links/archive-me.json");
    expect(await object?.json()).toMatchObject({ slug: "archive-me", url: "https://example.com/a" });
    const shown = await (await call("/api/links/archive-me")).json<{ archived_at: string | null }>();
    expect(shown.archived_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("cron report", () => {
  it("writes the latest report to KV and R2", async () => {
    expect((await call("/api/reports/latest")).status).toBe(404);
    await createLink({ url: "https://example.com/r", slug: "report-me" });

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "0 * * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);

    const latest = await call("/api/reports/latest");
    expect(latest.status).toBe(200);
    const report = await latest.json<{ generatedAt: string; totalLinks: number }>();
    expect(report.totalLinks).toBeGreaterThanOrEqual(1);
    expect(await env.ARCHIVE.head(`reports/${report.generatedAt}.json`)).not.toBeNull();
  });
});
