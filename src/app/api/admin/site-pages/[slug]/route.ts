import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getIp, handle, json, readJson, ApiError } from "@/lib/api";
import { db } from "@/db";
import { sitePages, type SitePageContent } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getBuiltinPage, getBuiltinPageAdminData, PREVIEW_COOKIE, pruneContent } from "@/lib/site-pages";
import { revalidatePublicContent } from "@/lib/revalidate-public";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const maxText = 20000;
const optionalText = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(maxText).nullable().optional());
const optionalShort = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(500).nullable().optional());
// Section patches must preserve an intentional "" instead of turning it into
// null: null means "no override" in the database, "" means "cleared".
const patchText = z.string().trim().max(maxText).nullable().optional();
const patchShort = z.string().trim().max(500).nullable().optional();
const optionalNumber = z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)), z.number().finite().optional());

const itemSchema = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(120).optional(),
  value: z.string().max(200).optional(),
  label: z.string().max(200).optional(),
  image: z.string().max(2000).optional(),
});

const sectionPatchSchema = z.object({
  eyebrow: patchShort,
  title: patchShort,
  subtitle: patchShort,
  body: patchText,
  ctaLabel: patchShort,
  ctaHref: patchShort,
  secondaryCtaLabel: patchShort,
  secondaryCtaHref: patchShort,
  image: patchShort,
  video: patchShort,
  background: patchShort,
  items: z.array(itemSchema).max(100).optional(),
  enabled: z.boolean().optional(),
  order: optionalNumber,
});

const seoSchema = z.object({
  title: optionalShort,
  description: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(320).nullable().optional()),
  ogTitle: optionalShort,
  ogDescription: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(320).nullable().optional()),
  ogImage: optionalShort,
  canonical: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(500).nullable().optional()),
  noIndex: z.boolean().optional(),
});

const contentSchema = z.object({
  // Stable section keys are canonical; numeric keys are accepted from legacy
  // clients/normalization and converted to their section key before storage.
  sections: z.record(z.string().regex(/^(?:\d+|[a-z0-9][a-z0-9-]*)$/, "Invalid section key"), sectionPatchSchema).default({}),
  seo: seoSchema.default({}),
});

async function resolvePage(ctx: Ctx) {
  const { slug } = await ctx.params;
  const page = getBuiltinPage(slug);
  if (!page) throw new ApiError(404, "Unknown built-in page");
  return page;
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("content.read");
  const page = await resolvePage(ctx);
  const data = await getBuiltinPageAdminData(page.key);
  if (!data) throw new ApiError(404, "Unknown built-in page");
  return json({ data: { ...data, preview: false } });
});

/** Save the working draft. This never publishes and never touches page_sections. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser("content.write");
  const page = await resolvePage(ctx);
  const body = await readJson<{ content?: unknown }>(req);
  const parsed = contentSchema.parse(body.content) as SitePageContent;
  // Store only fields that differ from the Content/settings base. Full
  // snapshots are pruned here too, so no save can reintroduce one.
  const { content, report } = await pruneContent(page.key, parsed);
  await db
    .insert(sitePages)
    .values({ slug: page.key, draft: content, updatedAt: new Date() })
    .onConflictDoUpdate({ target: sitePages.slug, set: { draft: content, updatedAt: new Date() } });
  await audit({ user, action: "site_page.draft_saved", entity: "site_pages", entityId: page.key, ip: getIp(req) });
  return json({ ok: true, savedAt: new Date().toISOString(), content, normalization: report });
});

/** Built-in pages whose public route is static use the private preview route. */
const PREVIEW_ROUTE_KEYS = new Set(["home", "why-mr-home", "markets", "list-your-property"]);

/**
 * publish  — copies the draft snapshot to published and makes it live.
 * discard  — resets the draft back to the published snapshot.
 * preview  — allows this admin to see the draft for 1 hour (private URL).
 * exit-preview — stops showing drafts to this browser.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const page = await resolvePage(ctx);
  const body = await readJson<{ action?: string }>(req);
  const action = body.action;

  if (action === "preview" || action === "exit-preview") {
    const user = await requireUser("content.read");
    const previewUrl = PREVIEW_ROUTE_KEYS.has(page.key) ? `/preview/site/${page.key}` : page.path;
    const res = json({ ok: true, url: previewUrl });
    if (action === "preview") {
      res.cookies.set(PREVIEW_COOKIE, page.key, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60,
      });
    } else {
      res.cookies.set(PREVIEW_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    }
    await audit({ user, action: `site_page.${action.replace("-", "_")}`, entity: "site_pages", entityId: page.key, ip: getIp(req) });
    return res;
  }

  const user = await requireUser("content.publish");
  const rows = await db.select().from(sitePages).where(eq(sitePages.slug, page.key)).limit(1);
  const row = rows[0];
  if (!row) throw new ApiError(400, "Save a draft before publishing this page");

  if (action === "publish") {
    // Re-prune before publishing so a legacy/full draft can never copy every
    // base field into the public override.
    const { content } = await pruneContent(page.key, row.draft as SitePageContent);
    await db
      .update(sitePages)
      .set({ published: content, publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(sitePages.slug, page.key));
    await audit({ user, action: "site_page.published", entity: "site_pages", entityId: page.key, ip: getIp(req) });
    revalidatePublicContent();
    return json({ ok: true, publishedAt: new Date().toISOString() });
  }

  if (action === "discard") {
    await db.update(sitePages).set({ draft: row.published, updatedAt: new Date() }).where(eq(sitePages.slug, page.key));
    await audit({ user, action: "site_page.draft_discarded", entity: "site_pages", entityId: page.key, ip: getIp(req) });
    return json({ ok: true });
  }

  throw new ApiError(400, "Unknown action");
});

export const runtime = "nodejs";
