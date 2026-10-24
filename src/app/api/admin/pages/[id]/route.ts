import { requireUser } from "@/lib/auth";
import { getIp, handle, json, readJson } from "@/lib/api";
import { getPage, headlineFor, saveRevision, serializePage } from "@/lib/pages-server";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isReservedSlug, sectionsSchema, slugFromTitle, type BuilderSection } from "@/lib/page-builder";
import { slugify } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { z } from "zod";
import { eq, ne, and } from "drizzle-orm";

const patchSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140).optional(),
  slug: z.string().trim().max(140).optional(),
  navLabel: z.string().trim().max(60).nullable().optional(),
  navOrder: z.coerce.number().int().min(0).max(99).nullable().optional(),
  navVisible: z.boolean().nullable().optional(),
  seoTitle: z.string().trim().max(170).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
  noIndex: z.boolean().nullable().optional(),
  ogImage: z.string().trim().max(2000).nullable().optional(),
  draft: z.array(z.unknown()).max(50).optional(),
  snapshot: z.boolean().optional(),
});

function idFrom(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid page id");
  return id;
}

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("pages.read");
  const { id } = await params;
  const page = await getPage(idFrom(id));
  if (!page) throw new ApiError(404, "Page not found");
  return json({ data: page });
});

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("pages.write");
  const { id } = await params;
  const pageId = idFrom(id);
  const page = await getPage(pageId);
  if (!page) throw new ApiError(404, "Page not found");

  const body = await readJson(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return json({ error: `Invalid ${first?.path?.join(".") ?? "request"}: ${first?.message ?? "validation failed"}` }, { status: 400 });
  }
  const input = parsed.data;

  // Persisted drafts must match the section model, so invalid types/oversized
  // fields never reach the DB or the renderer (Phase 7 validation).
  if (input.draft !== undefined) {
    const checked = sectionsSchema.safeParse(input.draft);
    if (!checked.success) {
      const first = checked.error.issues[0];
      return json({ error: `Invalid draft section ${first?.path?.join(".") ?? ""}: ${first?.message ?? "unknown section shape"}` }, { status: 400 });
    }
  }

  const slug = input.slug === undefined ? undefined : slugify(input.slug) || slugify(slugFromTitle(page.title));
  if (slug !== undefined && slug !== page.slug) {
    if (!slug || !/^[a-z0-9]+(?:[-][a-z0-9]+)*$/.test(slug)) {
      return json({ error: "Slug may only contain lowercase letters, numbers and hyphens." }, { status: 400 });
    }
    if (isReservedSlug(slug)) {
      return json({ error: "That slug is reserved by the site (nav, admin, projects, etc.). Pick a different one." }, { status: 400 });
    }
    const conflict = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.slug, slug), ne(pages.id, pageId)))
      .limit(1);
    if (conflict.length) return json({ error: "Another page already uses that slug." }, { status: 409 });
  }

  // Published pages keep serving published content; meta edits only flow to the public page on re-publish.
  const [row] = await db
    .update(pages)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.navLabel !== undefined ? { navLabel: input.navLabel && input.navLabel.length ? input.navLabel : null } : {}),
      ...(input.navOrder !== undefined ? { navOrder: input.navOrder ?? 0 } : {}),
      ...(input.navVisible !== undefined ? { navVisible: input.navVisible ?? true } : {}),
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle && input.seoTitle.length ? input.seoTitle : null } : {}),
      ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription && input.seoDescription.length ? input.seoDescription : null } : {}),
      ...(input.noIndex !== undefined ? { noIndex: input.noIndex ?? false } : {}),
      ...(input.ogImage !== undefined ? { ogImage: input.ogImage && input.ogImage.length ? input.ogImage : null } : {}),
      ...(input.draft !== undefined ? { draft: input.draft } : {}),
      updatedAt: new Date(),
    })
    .where(eq(pages.id, pageId))
    .returning();
  if (!row) throw new ApiError(500, "Update failed");

  if (input.draft !== undefined && input.snapshot) {
    const checked = sectionsSchema.safeParse(input.draft);
    const sections = checked.success ? (checked.data as BuilderSection[]) : [];
    await saveRevision(pageId, user.id, user.name, headlineFor(sections), sections);
  }

  await audit({
    user,
    action: "page.updated",
    entity: "pages",
    entityId: pageId,
    metadata: { fields: Object.keys(input).filter((k) => k !== "draft"), draftUpdated: input.draft !== undefined },
    ip: getIp(req),
  });
  return json({ data: serializePage(row) });
});

export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("pages.write");
  const { id } = await params;
  const pageId = idFrom(id);
  const page = await getPage(pageId);
  if (!page) throw new ApiError(404, "Page not found");

  await db.delete(pages).where(eq(pages.id, pageId)); // page_revisions cascade
  await audit({ user, action: "page.deleted", entity: "pages", entityId: pageId, metadata: { slug: page.slug }, ip: getIp(req) });
  return json({ ok: true });
});
