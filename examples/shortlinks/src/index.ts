import { archiveBatch } from "./archive";
import { counterFor, createLink, findLink, resolveTarget } from "./links";
import { buildReport, latestReport } from "./report";
import { CreateLinkInput, Slug } from "./schema";

export { LinkCounter } from "./counter";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const problem = (status: number, error: string, detail?: unknown) => json({ error, detail }, status);

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/health") return health(env);

  if (segments[0] === "api" && segments[1] === "links") {
    if (request.method === "POST" && segments.length === 2) return create(request, env);
    const slug = Slug.safeParse(segments[2]);
    if (!slug.success) return problem(404, "not_found");
    if (request.method === "GET" && segments.length === 3) return show(env, slug.data);
    if (request.method === "GET" && segments[3] === "stats" && segments.length === 4) {
      return json({ slug: slug.data, clicks: await counterFor(env, slug.data).count() });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/reports/latest") {
    const report = await latestReport(env);
    return report === null ? problem(404, "no_report_yet") : json(report);
  }

  if (request.method === "GET" && segments[0] === "r" && segments.length === 2) {
    const slug = Slug.safeParse(segments[1]);
    const target = slug.success ? await resolveTarget(env, slug.data) : null;
    if (!slug.success || target === null) return problem(404, "not_found");
    await counterFor(env, slug.data).increment();
    return Response.redirect(target, 302);
  }

  return problem(404, "not_found");
}

async function create(request: Request, env: Env): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const input = CreateLinkInput.safeParse(body);
  if (!input.success) return problem(400, "invalid_input", input.error.issues);

  const result = await createLink(env, input.data, new Date());
  switch (result.kind) {
    case "created":
      return json({ ...result.link, shortUrl: new URL(`/r/${result.link.slug}`, env.PUBLIC_BASE_URL).href }, 201);
    case "slug-taken":
      return problem(409, "slug_taken", { slug: result.slug });
    case "blocked":
      return problem(422, "host_blocked", { host: result.host });
  }
}

async function show(env: Env, slug: Slug): Promise<Response> {
  const link = await findLink(env, slug);
  if (link === null) return problem(404, "not_found");
  return json({ ...link, clicks: await counterFor(env, slug).count() });
}

async function health(env: Env): Promise<Response> {
  const checks = {
    d1: await env.DB.prepare("SELECT COUNT(*) AS n FROM links")
      .first<{ n: number }>()
      .then((row) => ({ ok: true, links: row?.n ?? 0 }))
      .catch((error: unknown) => ({ ok: false, error: String(error) })),
    kv: await env.LINK_CACHE.list({ limit: 1 })
      .then(() => ({ ok: true }))
      .catch((error: unknown) => ({ ok: false, error: String(error) })),
    r2: await env.ARCHIVE.list({ limit: 1 })
      .then(() => ({ ok: true }))
      .catch((error: unknown) => ({ ok: false, error: String(error) })),
  };
  const ok = checks.d1.ok && checks.kv.ok && checks.r2.ok;
  return json({ ok, service: "shortlinks", checks }, ok ? 200 : 503);
}

export default {
  fetch: handleFetch,
  async queue(batch, env, _ctx) {
    await archiveBatch(batch, env, new Date());
  },
  async scheduled(_controller, env, _ctx) {
    await buildReport(env, new Date());
  },
} satisfies ExportedHandler<Env>;
