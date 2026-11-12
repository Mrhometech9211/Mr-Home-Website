import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { ApiError, handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { googleConfigured, listDriveEntries, searchFolderTree, type DriveEntry } from "@/lib/google-drive";

export const GET = handle(async (req) => {
  await requireUser("media.read");
  if (!googleConfigured()) throw new ApiError(503, "Google Drive is not configured");
  const url = new URL(req.url);
  const folderId = url.searchParams.get("folderId") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;

  let entries: DriveEntry[] = [];
  let nextPageToken: string | null = null;
  let truncated = false;
  try {
    // Inside a real folder, search its subtree — Drive's global search skips
    // files that only exist inside shared folders. At the root, use Drive's
    // own search so we never walk the entire Drive.
    if (q?.trim() && folderId && folderId !== "root") {
      const found = await searchFolderTree(folderId, q);
      entries = found.entries;
      truncated = found.truncated;
    } else {
      const data = await listDriveEntries({
        folderId,
        q,
        pageToken: url.searchParams.get("pageToken") ?? undefined,
      });
      entries = data.entries;
      nextPageToken = data.nextPageToken ?? null;
    }
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : "Google Drive is unavailable");
  }

  // Flag files already in the library so the UI can show them as imported
  // instead of offering a duplicate import.
  const ids = entries.filter((e) => !e.isFolder).map((e) => e.id);
  let imported = new Set<string>();
  if (ids.length) {
    const rows = await db
      .select({ driveFileId: media.driveFileId })
      .from(media)
      .where(inArray(media.driveFileId, ids));
    imported = new Set(rows.map((r) => r.driveFileId).filter((v): v is string => Boolean(v)));
  }

  return json({
    data: entries.map((e) => ({ ...e, imported: imported.has(e.id) })),
    nextPageToken,
    folderId: folderId ?? "root",
    searchedTree: Boolean(q?.trim() && folderId && folderId !== "root"),
    truncated,
  });
});
