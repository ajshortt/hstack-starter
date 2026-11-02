import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export const Slug = z.string().regex(SLUG_PATTERN).brand<"Slug">();
export type Slug = z.infer<typeof Slug>;

export const CreateLinkInput = z.object({
  url: z.url({ protocol: /^https?$/ }),
  slug: Slug.optional(),
});
export type CreateLinkInput = z.infer<typeof CreateLinkInput>;

export const LinkRow = z.object({
  slug: Slug,
  url: z.string(),
  created_at: z.string(),
  archived_at: z.string().nullable(),
});
export type LinkRow = z.infer<typeof LinkRow>;

export const LinkEvent = z.object({
  type: z.literal("link.created"),
  slug: Slug,
});
export type LinkEvent = z.infer<typeof LinkEvent>;

export const Blocklist = z.array(z.string());

export const Report = z.object({
  generatedAt: z.string(),
  totalLinks: z.number().int(),
  archivedLinks: z.number().int(),
});
export type Report = z.infer<typeof Report>;
