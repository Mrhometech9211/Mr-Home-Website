import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, mediaFolders } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteR2Object } from "@/lib/r2";
import { deleteLocalFile } from "@/lib/local-storage";

type Ctx = { params: Promise<{ id: string }> };
const idOf = async (ctx: Ctx) => {
  const n = parseInt((await ctx.params).id, 10);
  if (Number.isNaN(n)) throw new ApiError(400, "Invalid id");
  return n;
};

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.number().int().positive().nullable().optional(),
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("media.write");
  const id = await idOf(ctx);
  const data = patchSchema.parse(await readJson(req));
  const [existing] = await db.select({ id: mediaFolders.id, parentId: mediaFolders.parentId }).from(mediaFolders).where(eq(mediaFolders.id, id)).limit(1);
  if (!existing) throw new ApiError(404, "Folder not found");

  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === id) throw new ApiError(400, "A folder cannot be moved inside itself");
    // Walk the destination's ancestors — moving into a descendant would orphan
    // the subtree (and make it unreachable, not just misplaced).
    let cursor: number | null = data.parentId;
    const seen = new Set<number>();
    while (cursor !== null && !seen.has(cursor)) {
      seen.add(cursor);
      if (cursor === id) throw new ApiError(400, "Cannot move a folder inside one of its own subfolders");
      const [row] = await db.select({ parentId: mediaFolders.parentId }).from(mediaFolders).where(eq(mediaFolders.id, cursor)).limit(1);
      if (!row) throw new ApiError(400, "Destination folder not found");
      cursor = row.parentId;
    }
  }

  const [row] = await db
    .update(mediaFolders)
    .set({ ...(data.name !== undefined ? { name: data.name } : {}), ...(data.parentId !== undefined ? { parentId: data.parentId } : {}), updatedAt: new Date() })
    .where(eq(mediaFolders.id, id))
    .returning({ id: mediaFolders.id, name: mediaFolders.name, parentId: mediaFolders.parentId });
  await audit({ user: me, action: "media.folder.updated", entity: "media_folder", entityId: String(id), metadata: data, ip: getIp(req) });
  return json({ data: row });
});

export const DELETE = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("media.write");
  const id = await idOf(ctx);
  const force = new URL(req.url).searchParams.get("force") === "1";

  const tree = await db.execute(sql`
    WITH RECURSIVE t AS (
      SELECT id FROM media_folders WHERE id = ${id}
      UNION ALL
      SELECT f.id FROM media_folders f JOIN t ON f.parent_id = t.id
    ) SELECT id FROM t
  `);
  const ids = (((tree as unknown as { rows?: { id: number | string }[] }).rows) ?? []).map((r) => Number(r.id));
  if (!ids.length) throw new ApiError(404, "Folder not found");

  const files = await db
    .select({ id: media.id, storage: media.storage, storageKey: media.storageKey })
    .from(media)
    .where(inArray(media.folderId, ids));
  const subfolders = ids.length - 1;
  if (!force && (files.length > 0 || subfolders > 0)) {
    throw new ApiError(
      409,
      `This folder still holds ${files.length} file(s)${subfolders ? ` and ${subfolders} subfolder(s)` : ""}. Move them out, or delete everything.`,
    );
  }

  for (const f of files) {
    if (f.storage === "r2" && f.storageKey) await deleteR2Object(f.storageKey);
    if (f.storage === "local" && f.storageKey) await deleteLocalFile(f.storageKey);
  }
  if (files.length) await db.delete(media).where(inArray(media.id, files.map((f) => f.id)));
  await db.delete(mediaFolders).where(inArray(mediaFolders.id, ids));
  await audit({ user: me, action: "media.folder.deleted", entity: "media_folder", entityId: String(id), metadata: { recursive: force, files: files.length, folders: ids.length }, ip: getIp(req) });
  return json({ ok: true, folders: ids.length, files: files.length });
});
