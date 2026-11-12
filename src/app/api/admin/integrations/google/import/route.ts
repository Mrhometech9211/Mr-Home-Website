import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { media, mediaFolders } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  getDriveFileMeta,
  googleConfigured,
  listAllChildren,
  openDriveFile,
  type DriveEntry,
} from "@/lib/google-drive";
import { optimizeImage, type OptimizeMode } from "@/lib/image-optimize";
import {
  ALLOWED,
  imageDimensions,
  safeFilename,
  signatureMatches,
  sniff,
  svgHasActiveContent,
} from "@/lib/media-validation";
import {
  deleteLocalFile,
  localStorageEnabled,
  readLocalFile,
  readLocalHead,
  writeLocalBuffer,
  writeLocalFromStream,
} from "@/lib/local-storage";
import { mediaKey, putR2Object, r2IsConfigured } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z
  .object({
    fileIds: z.array(z.string().min(1).max(200)).max(100).optional(),
    folderId: z.string().min(1).max(200).optional(),
    /** Mirror the Drive folder tree into the media library (default true). */
    mirror: z.boolean().optional(),
    /** Media folder that receives the import; default = library root. */
    destinationFolderId: z.number().int().positive().nullable().optional(),
    /** off = original bytes, lossless = pixel-exact, balanced = WebP q90. */
    optimize: z.enum(["off", "lossless", "balanced"]).optional(),
  })
  .refine((v) => Boolean(v.fileIds?.length || v.folderId), {
    message: "Choose files or a folder to import",
  });

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

const MAX_FILES = 250;
const MAX_DEPTH = 4;
const DB_STORAGE_CAP = 50 * 1024 * 1024;
/** Per-request budget; computed inside the handler, never at module load. */
const IMPORT_BUDGET_MS = 240_000;

/** Files imported from Drive are filed automatically: Google Drive / YYYY-MM. */
async function ensureFolder(name: string, parentId: number | null): Promise<number> {
  const [existing] = await db
    .select({ id: mediaFolders.id })
    .from(mediaFolders)
    .where(
      and(
        eq(mediaFolders.name, name),
        parentId === null ? isNull(mediaFolders.parentId) : eq(mediaFolders.parentId, parentId),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(mediaFolders).values({ name, parentId }).returning({ id: mediaFolders.id });
  return row.id;
}

async function alreadyImported(driveFileId: string): Promise<number | null> {
  const [row] = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.driveFileId, driveFileId))
    .limit(1);
  return row?.id ?? null;
}

type ImportOutcome = { status: "imported" | "skipped"; id?: number; savedBytes: number };

async function importOne(
  entry: DriveEntry,
  folderId: number,
  userId: number,
  optimize: OptimizeMode,
): Promise<ImportOutcome> {
  const existing = await alreadyImported(entry.id);
  if (existing) return { status: "skipped", id: existing, savedBytes: 0 };

  let mimeType = entry.mimeType;
  const ext = EXT[mimeType];
  if (!ext) throw new Error(`Unsupported Drive file type (${mimeType || "unknown"})`);
  const initialRule = ALLOWED[mimeType];
  if (!initialRule) throw new Error(`Type ${mimeType} is not allowed in the media library`);
  if (entry.size && entry.size > initialRule.max) {
    throw new Error(
      `File is ${(entry.size / 1024 / 1024).toFixed(0)} MB — over the ${(initialRule.max / 1024 / 1024).toFixed(0)} MB limit`,
    );
  }

  const base = safeFilename(entry.name || "drive-file");
  let filename = new RegExp(`\\.${ext}$`, "i").test(base) ? base : `${base}.${ext}`;
  let key = mediaKey(filename);

  const useLocal = localStorageEnabled() && !r2IsConfigured();
  let size = 0;
  let storage: "local" | "r2" | "db" = "db";
  let storageKey: string | null = null;
  let data: Buffer | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let savedBytes = 0;

  const { body } = await openDriveFile(entry.id);

  if (useLocal) {
    // Streams straight to `.uploads/` — a 2 GB video never sits in memory.
    size = await writeLocalFromStream(key, body);
    if (size <= 0) {
      await deleteLocalFile(key);
      throw new Error("Google returned an empty file");
    }
    if (size > initialRule.max) {
      await deleteLocalFile(key);
      throw new Error(
        `File is ${(size / 1024 / 1024).toFixed(0)} MB — over the ${(initialRule.max / 1024 / 1024).toFixed(0)} MB limit`,
      );
    }
    storage = "local";
    storageKey = key;
  } else {
    data = Buffer.from(await new Response(body).arrayBuffer());
    size = data.length;
  }

  // Images are optimised (best-effort) before validation/storage. Only images
  // are buffered; video keeps streaming to disk.
  if (initialRule.kind === "image" && mimeType !== "image/svg+xml") {
    const source = data ?? (useLocal ? await readLocalFile(key) : null);
    if (source) {
      const optimised = await optimizeImage(source, mimeType, optimize);
      if (optimised) {
        const nextName = filename.replace(/\.[a-z0-9]+$/i, "") + `.${optimised.ext}`;
        const nextKey = mediaKey(nextName);
        if (useLocal) {
          await writeLocalBuffer(nextKey, optimised.data);
          await deleteLocalFile(key);
          key = nextKey;
          storageKey = nextKey;
        }
        filename = nextName;
        mimeType = optimised.mimeType;
        data = optimised.data;
        size = optimised.data.length;
        savedBytes = optimised.savedBytes;
      }
    }
  }

  const rule = ALLOWED[mimeType];
  if (!rule) {
    if (useLocal) await deleteLocalFile(key);
    throw new Error(`Type ${mimeType} is not allowed in the media library`);
  }
  if (size > rule.max) {
    if (useLocal) await deleteLocalFile(key);
    throw new Error(
      `File is ${(size / 1024 / 1024).toFixed(0)} MB — over the ${(rule.max / 1024 / 1024).toFixed(0)} MB limit`,
    );
  }

  const head = data ?? (useLocal ? await readLocalHead(key) : null);
  if (!head) throw new Error("File bytes could not be read");
  if (!signatureMatches(mimeType, sniff(head))) {
    if (useLocal) await deleteLocalFile(key);
    throw new Error("File contents do not match the declared type");
  }
  if (mimeType === "image/svg+xml" && svgHasActiveContent(head.subarray(0, 256 * 1024).toString("utf8"))) {
    if (useLocal) await deleteLocalFile(key);
    throw new Error("SVG contains disallowed active content");
  }
  if (rule.kind === "image" && mimeType !== "image/svg+xml" && mimeType !== "image/avif") {
    const dims = imageDimensions(head, mimeType);
    width = dims?.width ?? null;
    height = dims?.height ?? null;
  }

  if (!useLocal) {
    if (!data) throw new Error("File bytes could not be read");
    // Production: put anything above a few megabytes in object storage rather
    // than a Postgres bytea row, matching how direct uploads are stored.
    if (r2IsConfigured() && size > 4 * 1024 * 1024) {
      await putR2Object(key, data, mimeType);
      storage = "r2";
      storageKey = key;
    } else if (size <= DB_STORAGE_CAP) {
      storage = "db";
      data = data;
    } else {
      throw new Error("Large files need object storage — R2 is not configured on this server");
    }
  }

  try {
    const [row] = await db
      .insert(media)
      .values({
        filename: key,
        originalName: filename.slice(0, 200),
        mimeType,
        kind: rule.kind,
        size,
        width,
        height,
        storage,
        storageKey,
        data: storage === "db" ? data : null,
        folderId,
        driveFileId: entry.id,
        uploadedBy: userId,
      })
      .returning({ id: media.id });
    return { status: "imported", id: row.id, savedBytes };
  } catch (err) {
    if (storage === "local" && storageKey) await deleteLocalFile(storageKey);
    // Concurrent import of the same Drive file: the unique index wins.
    if ((err as { code?: string }).code === "23505") return { status: "skipped", savedBytes: 0 };
    throw err;
  }
}

type Summary = {
  imported: number;
  skipped: number;
  failed: { name: string; error: string }[];
  ids: number[];
  stopped: boolean;
  savedBytes: number;
};

function newSummary(): Summary {
  return { imported: 0, skipped: 0, failed: [], ids: [], stopped: false, savedBytes: 0 };
}

async function importDriveFolderTree(
  driveFolderId: string,
  driveFolderName: string,
  parentMediaFolderId: number,
  depth: number,
  userId: number,
  deadline: number,
  optimize: OptimizeMode,
  summary: Summary,
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  if (Date.now() > deadline || summary.imported + summary.skipped >= MAX_FILES) {
    summary.stopped = true;
    return;
  }

  const folderName = driveFolderName.trim().slice(0, 120) || "Drive folder";
  const mediaFolderId = await ensureFolder(folderName, parentMediaFolderId);

  let children: DriveEntry[];
  try {
    children = await listAllChildren(driveFolderId);
  } catch (err) {
    summary.failed.push({ name: folderName, error: err instanceof Error ? err.message : "Could not list folder" });
    return;
  }

  for (const child of children) {
    if (Date.now() > deadline || summary.imported + summary.skipped >= MAX_FILES) {
      summary.stopped = true;
      return;
    }
    if (child.isFolder) {
      await importDriveFolderTree(child.id, child.name, mediaFolderId, depth + 1, userId, deadline, optimize, summary);
      continue;
    }
    if (!EXT[child.mimeType]) continue; // silently skip Docs/Sheets/etc.
    try {
      const out = await importOne(child, mediaFolderId, userId, optimize);
      if (out.status === "imported") {
        summary.imported += 1;
        summary.savedBytes += out.savedBytes;
        if (out.id) summary.ids.push(out.id);
      } else summary.skipped += 1;
    } catch (err) {
      summary.failed.push({ name: child.name, error: err instanceof Error ? err.message : "Import failed" });
    }
  }
}

export const POST = handle(async (req) => {
  const me = await requireUser("media.write");
  if (!googleConfigured()) throw new ApiError(503, "Google Drive is not configured");
  const input = bodySchema.parse(await readJson(req));
  // Balanced by default: lossless cannot shrink JPEG photos at all, which made
  // Drive imports look like the compressor was broken.
  const optimizeMode: OptimizeMode = input.optimize ?? "balanced";

  let destination: number | null = input.destinationFolderId ?? null;
  if (destination !== null) {
    const [folder] = await db
      .select({ id: mediaFolders.id })
      .from(mediaFolders)
      .where(eq(mediaFolders.id, destination))
      .limit(1);
    if (!folder) throw new ApiError(400, "Destination folder not found");
  }

  const summary = newSummary();
  const deadline = Date.now() + IMPORT_BUDGET_MS;
  const mirror = input.mirror !== false;
  const month = new Date().toISOString().slice(0, 7);

  try {
    if (input.folderId) {
      const driveRoot = await ensureFolder("Google Drive", destination);
      const monthFolder = mirror ? await ensureFolder(month, driveRoot) : driveRoot;
      const meta = await getDriveFileMeta(input.folderId);
      await importDriveFolderTree(
        input.folderId,
        meta.name,
        monthFolder,
        0,
        me.id,
        deadline,
        optimizeMode,
        summary,
      );
    } else {
      const driveRoot = await ensureFolder("Google Drive", destination);
      const folderId = mirror ? await ensureFolder(month, driveRoot) : driveRoot;
      for (const id of input.fileIds ?? []) {
        if (Date.now() > deadline) {
          summary.stopped = true;
          break;
        }
        const known = await alreadyImported(id);
        if (known) {
          summary.skipped += 1;
          continue;
        }
        try {
          const meta = await getDriveFileMeta(id);
          const entry: DriveEntry = {
            id,
            name: meta.name,
            mimeType: meta.mimeType,
            size: meta.size,
            isFolder: false,
          };
          if (!EXT[meta.mimeType]) throw new Error(`Unsupported Drive file type (${meta.mimeType})`);
          const out = await importOne(entry, folderId, me.id, optimizeMode);
          if (out.status === "imported") {
            summary.imported += 1;
            summary.savedBytes += out.savedBytes;
            if (out.id) summary.ids.push(out.id);
          } else summary.skipped += 1;
        } catch (err) {
          summary.failed.push({ name: id, error: err instanceof Error ? err.message : "Import failed" });
        }
      }
    }
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : "Google Drive import failed");
  }

  if (summary.imported > 0) {
    await audit({
      user: me,
      action: "media.imported",
      entity: "media",
      entityId: summary.ids[0] ? String(summary.ids[0]) : "drive",
      metadata: {
        provider: "google_drive",
        imported: summary.imported,
        skipped: summary.skipped,
        failed: summary.failed.length,
        savedBytes: summary.savedBytes,
        optimize: optimizeMode,
        folderId: input.folderId ?? null,
      },
      ip: getIp(req),
    });
  }

  return json({ data: summary }, { status: 201 });
});
