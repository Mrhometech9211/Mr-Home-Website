import { z } from "zod";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, mediaFolders } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * Media library folders. Folders are a self-referencing tree (parentId null =
 * top level); files point at one folder via media.folderId. Listing returns a
 * flat array plus per-folder file counts — the client renders the tree.
 */
export const GET = handle(async () => {
  await requireUser("media.read");
  const [folders, counts, roots] = await Promise.all([
    db
      .select({ id: mediaFolders.id, name: mediaFolders.name, parentId: mediaFolders.parentId, createdAt: mediaFolders.createdAt })
      .from(mediaFolders)
      .orderBy(asc(mediaFolders.name)),
    db
      .select({ folderId: media.folderId, n: sql<number>`count(*)::int` })
      .from(media)
      .where(ne(media.status, "pending"))
      .groupBy(media.folderId),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(media)
      .where(and(isNull(media.folderId), ne(media.status, "pending"))),
  ]);
  const byFolder = new Map(counts.map((c) => [c.folderId, Number(c.n)]));
  return json({
    data: folders.map((f) => ({ ...f, count: byFolder.get(f.id) ?? 0 })),
    rootCount: Number(roots[0]?.n ?? 0),
  });
});

const bodySchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(120, "Folder name is too long"),
  parentId: z.number().int().positive().nullable().optional(),
});

export const POST = handle(async (req) => {
  const me = await requireUser("media.write");
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Invalid folder");
  const parentId = body.data.parentId ?? null;
  if (parentId !== null) {
    const [parent] = await db.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.id, parentId)).limit(1);
    if (!parent) throw new ApiError(400, "Parent folder not found");
  }
  // File-explorer behaviour: two folders in the same place cannot share a name.
  const [clash] = await db
    .select({ id: mediaFolders.id })
    .from(mediaFolders)
    .where(
      and(
        eq(mediaFolders.name, body.data.name),
        parentId === null ? isNull(mediaFolders.parentId) : eq(mediaFolders.parentId, parentId),
      ),
    )
    .limit(1);
  if (clash) throw new ApiError(409, "A folder with that name already exists here");

  const [row] = await db
    .insert(mediaFolders)
    .values({ name: body.data.name, parentId })
    .returning({ id: mediaFolders.id, name: mediaFolders.name, parentId: mediaFolders.parentId });
  await audit({ user: me, action: "media.folder.created", entity: "media_folder", entityId: String(row.id), metadata: { name: row.name, parentId }, ip: getIp(req) });
  return json({ data: { ...row, count: 0 } }, { status: 201 });
});
