import { findLink } from "./links";
import { LinkEvent } from "./schema";

export const archiveKey = (slug: string) => `archive/links/${slug}.json`;

export async function archiveBatch(batch: MessageBatch, env: Env, now: Date): Promise<void> {
  for (const message of batch.messages) {
    const parsed = LinkEvent.safeParse(message.body);
    if (!parsed.success) {
      console.error("dropping malformed link event", JSON.stringify(message.body));
      message.ack();
      continue;
    }
    const link = await findLink(env, parsed.data.slug);
    if (link === null) {
      message.ack();
      continue;
    }
    await env.ARCHIVE.put(archiveKey(link.slug), JSON.stringify(link), {
      httpMetadata: { contentType: "application/json" },
    });
    await env.DB.prepare("UPDATE links SET archived_at = ?1 WHERE slug = ?2 AND archived_at IS NULL")
      .bind(now.toISOString(), link.slug)
      .run();
    console.log(`archived link ${link.slug}`);
    message.ack();
  }
}
