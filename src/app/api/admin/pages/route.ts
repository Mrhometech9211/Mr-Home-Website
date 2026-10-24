import { requireUser } from "@/lib/auth";
import { getIp, handle, json, readJson } from "@/lib/api";
import { listPages, serializePage } from "@/lib/pages-server";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isReservedSlug, slugFromTitle } from "@/lib/page-builder";
import { slugify } from "@/lib/utils";
import { z } from "zod";
import { eq } from "drizzle-orm";

const metaInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  slug: z.string().trim().max(140).regex(/^[a-zA-Z0-9][a-zA-Z0-9 -/]*$/, "Invalid slug").optional(),
  navLabel: z.string().trim().max(60).optional().nullable(),
  navOrder: z.coerce.number().int().min(0).max(99).optional(),
  navVisible: z.boolean().optional(),
  seoTitle: z.string().trim().max(170).optional().nullable(),
  seoDescription: z.string().trim().max(320).optional().nullable(),
  noIndex: z.boolean().optional(),
  ogImage: z.string().trim().max(2000).optional().nullable(),
});

export const GET = handle(async () => {
  await requireUser("pages.read");
  return json({ data: await listPages() });
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser("pages.write");
  const body = await readJson(req);
  const parsed = metaInput.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return json({ error: `Invalid ${first?.path?.join(".") ?? "request"}: ${first?.message ?? "validation failed"}` }, { status: 400 });
  }
  const input = parsed.data;
  const slug = slugify(input.slug && input.slug.length ? input.slug : slugFromTitle(input.title));
  if (!slug) return json({ error: "Slug is required" }, { status: 400 });
  if (!/^[a-z0-9]+(?:[-][a-z0-9]+)*$/.test(slug)) {
    return json({ error: "Slug may only contain lowercase letters, numbers and hyphens." }, { status: 400 });
  }
  if (isReservedSlug(slug)) {
    return json({ error: "That slug is reserved by the site (nav, admin, projects, etc.). Pick a different one." }, { status: 400 });
  }

  const existing = await db.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug)).limit(1);
  if (existing.length) return json({ error: "A page with that slug already exists." }, { status: 409 });

  const [row] = await db
    .insert(pages)
    .values({
      title: input.title,
      slug,
      navLabel: input.navLabel && input.navLabel.length ? input.navLabel.slice(0, 60) : null,
      navOrder: input.navOrder ?? 0,
      navVisible: input.navVisible ?? true,
      status: "draft",
      draft: [],
      published: [],
      seoTitle: input.seoTitle && input.seoTitle.length ? input.seoTitle.slice(0, 170) : null,
      seoDescription: input.seoDescription && input.seoDescription.length ? input.seoDescription.slice(0, 320) : null,
      noIndex: input.noIndex ?? false,
      ogImage: input.ogImage && input.ogImage.length ? input.ogImage.slice(0, 2000) : null,
      createdBy: user.id,
    })
    .returning();

  await audit({ user, action: "page.created", entity: "pages", entityId: row.id, ip: getIp(req) });
  return json({ data: serializePage(row) }, { status: 201 });
});
