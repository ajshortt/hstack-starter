import { Blocklist, LinkRow, type CreateLinkInput, type LinkEvent, type Slug } from "./schema";

export const BLOCKLIST_KEY = "config:blocklist";
const cacheKey = (slug: Slug) => `link:${slug}`;

export type CreateResult =
  | { kind: "created"; link: LinkRow }
  | { kind: "slug-taken"; slug: Slug }
  | { kind: "blocked"; host: string };

export async function createLink(env: Env, input: CreateLinkInput, now: Date): Promise<CreateResult> {
  const host = new URL(input.url).hostname;
  const blocklist = Blocklist.parse((await env.LINK_CACHE.get(BLOCKLIST_KEY, "json")) ?? []);
  if (blocklist.includes(host)) return { kind: "blocked", host };

  const slug = input.slug ?? generateSlug();
  const createdAt = now.toISOString();
  const inserted = await env.DB.prepare(
    "INSERT INTO links (slug, url, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(slug) DO NOTHING",
  )
    .bind(slug, input.url, createdAt)
    .run();
  if (inserted.meta.changes === 0) return { kind: "slug-taken", slug };

  const event: LinkEvent = { type: "link.created", slug };
  await env.LINK_EVENTS.send(event);
  return { kind: "created", link: { slug, url: input.url, created_at: createdAt, archived_at: null } };
}

export async function findLink(env: Env, slug: Slug): Promise<LinkRow | null> {
  const row = await env.DB.prepare("SELECT slug, url, created_at, archived_at FROM links WHERE slug = ?1")
    .bind(slug)
    .first();
  return row === null ? null : LinkRow.parse(row);
}

export async function resolveTarget(env: Env, slug: Slug): Promise<string | null> {
  const cached = await env.LINK_CACHE.get(cacheKey(slug));
  if (cached !== null) return cached;
  const link = await findLink(env, slug);
  if (link === null) return null;
  await env.LINK_CACHE.put(cacheKey(slug), link.url, { expirationTtl: 3600 });
  return link.url;
}

export function counterFor(env: Env, slug: Slug) {
  return env.LINK_COUNTER.get(env.LINK_COUNTER.idFromName(slug));
}

function generateSlug(): Slug {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("") as Slug;
}
