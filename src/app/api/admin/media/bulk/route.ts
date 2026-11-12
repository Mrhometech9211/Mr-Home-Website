import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { media, mediaFolders } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteR2Object } from "@/lib/r2";
import { deleteLocalFile } from "@/lib/local-storage";

/** Bulk operations for multi-selected media (drag onto a folder, delete). */
const moveSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  folderId: z.number().int().positive().nullable(),
});

export const POST = handle(async (req) => {
  const me = await requireUser("media.write");
  const body = moveSchema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Invalid selection");
  if (body.data.folderId !== null) {
    const [folder] = await db.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.id, body.data.folderId)).limit(1);
    if (!folder) throw new ApiError(400, "Destination folder not found");
  }
  await db.update(media).set({ folderId: body.data.folderId }).where(inArray(media.id, body.data.ids));
  await audit({ user: me, action: "media.moved", entity: "media", metadata: { count: body.data.ids.length, folderId: body.data.folderId }, ip: getIp(req) });
  return json({ ok: true, moved: body.data.ids.length });
});

const deleteSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });

export const DELETE = handle(async (req) => {
  const me = await requireUser("media.write");
  const body = deleteSchema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Invalid selection");
  const rows = await db
    .select({ id: media.id, storage: media.storage, storageKey: media.storageKey })
    .from(media)
    .where(inArray(media.id, body.data.ids));
  for (const r of rows) {
    if (r.storage === "r2" && r.storageKey) await deleteR2Object(r.storageKey);
    if (r.storage === "local" && r.storageKey) await deleteLocalFile(r.storageKey);
  }
  if (rows.length) await db.delete(media).where(inArray(media.id, rows.map((r) => r.id)));
  await audit({ user: me, action: "media.deleted", entity: "media", metadata: { count: rows.length, bulk: true }, ip: getIp(req) });
  return json({ ok: true, deleted: rows.length });
});
