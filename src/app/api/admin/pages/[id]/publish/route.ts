import { requireUser } from "@/lib/auth";
import { getIp, handle, json, readJson } from "@/lib/api";
import { getPage, headlineFor, saveRevision } from "@/lib/pages-server";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { audit } from "@/lib/audit";
import { slugFromTitle, validateForPublish } from "@/lib/page-builder";
import { slugify } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { z } from "zod";
import { eq } from "drizzle-orm";

const actionSchema = z.object({ action: z.enum(["publish", "unpublish"]) });

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("pages.publish");
  const { id } = await params;
  const pageId = Number(id);
  if (!Number.isInteger(pageId) || pageId <= 0) throw new ApiError(400, "Invalid page id");
  const page = await getPage(pageId);
  if (!page) throw new ApiError(404, "Page not found");

  const parsed = actionSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid action");
  const { action } = parsed.data;

  if (action === "publish") {
    const sections = page.draft;
    try {
      validateForPublish(sections);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "The page cannot be published yet." }, { status: 400 });
    }
    // Publishing always copies the current draft into published; guard the live slug too.
    const slug = page.slug || slugify(slugFromTitle(page.title));
    const [row] = await db
      .update(pages)
      .set({ status: "published", published: sections, publishedAt: new Date(), slug, updatedAt: new Date() })
      .where(eq(pages.id, pageId))
      .returning();
    if (!row) throw new ApiError(500, "Publish failed");
    await saveRevision(pageId, user.id, user.name, `Published: ${headlineFor(sections)}`, sections);
    await audit({ user, action: "page.published", entity: "pages", entityId: pageId, metadata: { slug }, ip: getIp(req) });
    return json({ data: { status: row.status, publishedAt: row.publishedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() } });
  }

  // Unpublish: the public route stops serving it immediately; published copy kept for reference.
  const [row] = await db
    .update(pages)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() })
    .where(eq(pages.id, pageId))
    .returning();
  if (!row) throw new ApiError(500, "Unpublish failed");
  await audit({ user, action: "page.unpublished", entity: "pages", entityId: pageId, ip: getIp(req) });
  return json({ data: { status: row.status, publishedAt: null, updatedAt: row.updatedAt.toISOString() } });
});
