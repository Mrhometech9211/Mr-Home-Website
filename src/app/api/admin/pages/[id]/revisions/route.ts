import { requireUser } from "@/lib/auth";
import { getIp, handle, json, readJson } from "@/lib/api";
import { getPage, getRevision, listRevisions, headlineFor, saveRevision } from "@/lib/pages-server";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { z } from "zod";
import { eq } from "drizzle-orm";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("pages.restore");
  const { id } = await params;
  const pageId = Number(id);
  if (!Number.isInteger(pageId) || pageId <= 0) throw new ApiError(400, "Invalid page id");
  if (!(await getPage(pageId))) throw new ApiError(404, "Page not found");
  return json({ data: { revisions: await listRevisions(pageId) } });
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("pages.restore");
  const { id } = await params;
  const pageId = Number(id);
  if (!Number.isInteger(pageId) || pageId <= 0) throw new ApiError(400, "Invalid page id");
  const page = await getPage(pageId);
  if (!page) throw new ApiError(404, "Page not found");

  const parsed = z.object({ revisionId: z.number().int().positive() }).safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "Invalid revisionId");
  const revision = await getRevision(pageId, parsed.data.revisionId);
  if (!revision) throw new ApiError(404, "Revision not found");

  await db.update(pages).set({ draft: revision.data, updatedAt: new Date() }).where(eq(pages.id, pageId));
  // Restoring also records a snapshot so the previous draft is never lost.
  await saveRevision(pageId, user.id, user.name, `Restored from: ${revision.headline || `#${revision.id}`}`, revision.data);
  await audit({ user, action: "page.revision_restored", entity: "pages", entityId: pageId, metadata: { revisionId: revision.id }, ip: getIp(req) });
  return json({ ok: true, updatedAt: new Date().toISOString() });
});
