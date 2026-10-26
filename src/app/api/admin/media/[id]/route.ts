import { z } from "zod";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, pageSections, projects, markets, siteSettings, testimonials, seoEntries } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { validateUpload } from "@/lib/media-validation";

type Ctx = { params: Promise<{ id: string }> };
const idOf = async (ctx: Ctx) => { const n = parseInt((await ctx.params).id, 10); if (Number.isNaN(n)) throw new ApiError(400, "Invalid id"); return n; };

/** Usage tracking: where is this media URL referenced? */
async function usage(id: number) {
  const url = `/api/media/${id}`;
  const like = `%${url}%`;
  const [p, m, s, t, seo, settings] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).where(or(eq(projects.coverImage, url), sql`${projects.gallery}::text ILIKE ${like}`, sql`${projects.floorPlans}::text ILIKE ${like}`, sql`${projects.documents}::text ILIKE ${like}`, ilike(projects.video, like))),
    db.select({ id: markets.id, name: markets.name }).from(markets).where(eq(markets.coverImage, url)),
    db.select({ id: pageSections.id, name: pageSections.title, page: pageSections.page, key: pageSections.key }).from(pageSections).where(or(eq(pageSections.image, url), eq(pageSections.video, url), eq(pageSections.background, url), sql`${pageSections.items}::text ILIKE ${like}`)),
    db.select({ id: testimonials.id, name: testimonials.name }).from(testimonials).where(eq(testimonials.image, url)),
    db.select({ id: seoEntries.id, name: seoEntries.path }).from(seoEntries).where(eq(seoEntries.ogImage, url)),
    db.select({ id: siteSettings.id }).from(siteSettings).where(sql`${siteSettings.data}::text ILIKE ${like}`),
  ]);
  return {
    projects: p, markets: m, sections: s.map((x) => ({ id: x.id, name: x.name || `${x.page}/${x.key}` })), testimonials: t, seo, settings: settings.length > 0,
    total: p.length + m.length + s.length + t.length + seo.length + (settings.length ? 1 : 0),
  };
}

export const GET = handle<Ctx>(async (_req, ctx) => {
  await requireUser("media.read");
  const id = await idOf(ctx);
  const [row] = await db.select({ id: media.id, filename: media.filename, originalName: media.originalName, mimeType: media.mimeType, kind: media.kind, size: media.size, width: media.width, height: media.height, alt: media.alt, caption: media.caption, createdAt: media.createdAt }).from(media).where(eq(media.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Not found");
  return json({ data: { ...row, url: `/api/media/${row.id}` }, usage: await usage(id) });
});

const patchSchema = z.object({ alt: z.string().max(300).nullable().optional(), caption: z.string().max(500).nullable().optional(), kind: z.enum(["image", "video", "document", "logo"]).optional(), filename: z.string().max(200).optional() });

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("media.write");
  const id = await idOf(ctx);
  const data = patchSchema.parse(await readJson(req));
  const [row] = await db.update(media).set(data).where(eq(media.id, id)).returning({ id: media.id });
  if (!row) throw new ApiError(404, "Not found");
  await audit({ user: me, action: "media.updated", entity: "media", entityId: id, metadata: data, ip: getIp(req) });
  return json({ ok: true });
});

/** Replace the binary while keeping the same URL so every usage updates automatically. */
export const POST = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("media.write");
  const id = await idOf(ctx);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file provided");
  const buf = Buffer.from(await file.arrayBuffer());
  const v = validateUpload({ name: file.name, type: file.type, size: file.size }, buf);
  if (!v.ok) throw new ApiError(400, v.error);
  // A legacy multipart replace stores the new bytes in Postgres: clear the R2
  // pointer so delivery serves the NEW file, and drop the superseded object.
  const [priorR2] = await db.select({ storage: media.storage, storageKey: media.storageKey }).from(media).where(eq(media.id, id)).limit(1);
  const [row] = await db.update(media).set({ data: buf, mimeType: file.type, size: file.size, originalName: file.name.slice(0, 200), width: v.dims?.width ?? null, height: v.dims?.height ?? null, kind: v.kind, storage: "db", storageKey: null }).where(eq(media.id, id)).returning({ id: media.id });
  if (!row) throw new ApiError(404, "Not found");
  if (priorR2?.storage === "r2" && priorR2.storageKey) {
    const { deleteR2Object } = await import("@/lib/r2");
    await deleteR2Object(priorR2.storageKey);
  }
  await audit({ user: me, action: "media.replaced", entity: "media", entityId: id, metadata: { filename: file.name }, ip: getIp(req) });
  return json({ ok: true });
});

export const DELETE = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("media.write");
  const id = await idOf(ctx);
  const force = new URL(req.url).searchParams.get("force") === "1";
  const u = await usage(id);
  if (u.total > 0 && !force) return json({ error: `This file is used in ${u.total} place(s). Remove references first or force delete.`, usage: u }, { status: 409 });
  const [row] = await db.delete(media).where(eq(media.id, id)).returning({ id: media.id, filename: media.filename, storage: media.storage, storageKey: media.storageKey });
  if (!row) throw new ApiError(404, "Not found");
  if (row.storage === "r2" && row.storageKey) {
    // The DB row is gone — do not orphan the object in the bucket.
    const { deleteR2Object } = await import("@/lib/r2");
    await deleteR2Object(row.storageKey);
  }
  await audit({ user: me, action: "media.deleted", entity: "media", entityId: id, metadata: { filename: row.filename, forced: force }, ip: getIp(req) });
  return json({ ok: true });
});
