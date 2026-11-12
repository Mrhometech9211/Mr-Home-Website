import { eq } from "drizzle-orm";
import { db } from "@/db";
import { media, mediaFolders } from "@/db/schema";
import { ApiError, getIp, handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ALLOWED, imageDimensions, safeFilename, signatureMatches, sniff, svgHasActiveContent } from "@/lib/media-validation";
import { deleteLocalFile, localStorageEnabled, readLocalHead, writeLocalFromStream } from "@/lib/local-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Development-only upload endpoint. Accepts the raw file body (XHR gives real
 * progress) and streams it to `.uploads/`, so large videos work locally without
 * R2. Production never selects this path.
 */
export const POST = handle(async (req) => {
  const me = await requireUser("media.write");
  if (!localStorageEnabled()) throw new ApiError(404, "Not found");

  const name = decodeURIComponent(req.headers.get("x-file-name") ?? "").trim();
  const type = (req.headers.get("x-file-type") ?? "").toLowerCase().trim();
  const declaredSize = Number(req.headers.get("x-size") ?? 0);
  const folderRaw = req.headers.get("x-folder-id") ?? "";

  if (!name || name.length > 300) throw new ApiError(400, "A valid file name is required");
  const rule = ALLOWED[type];
  if (!rule) throw new ApiError(400, `File type "${type || "unknown"}" is not allowed`);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!rule.ext.includes(ext)) throw new ApiError(400, `Extension .${ext} does not match type ${type}`);
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) throw new ApiError(400, "File size is required");
  if (declaredSize > rule.max) {
    throw new ApiError(413, `File exceeds the ${(rule.max / 1024 / 1024).toFixed(0)} MB limit`);
  }

  let folderId: number | null = null;
  if (folderRaw) {
    const candidate = Number(folderRaw);
    if (!Number.isInteger(candidate) || candidate <= 0) throw new ApiError(400, "Invalid folder");
    const [folder] = await db.select({ id: mediaFolders.id }).from(mediaFolders).where(eq(mediaFolders.id, candidate)).limit(1);
    if (!folder) throw new ApiError(400, "Destination folder not found");
    folderId = folder.id;
  }

  const key = `media/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeFilename(name)}`;
  let size = 0;
  try {
    size = await writeLocalFromStream(key, req.body);
  } catch {
    await deleteLocalFile(key);
    throw new ApiError(400, "Upload could not be written");
  }
  if (size <= 0) {
    await deleteLocalFile(key);
    throw new ApiError(400, "Empty file");
  }
  // A body cut short by a proxy/body limit produces an unplayable file (a
  // truncated MP4 loses its index). Reject it instead of storing corruption.
  if (size !== declaredSize) {
    await deleteLocalFile(key);
    throw new ApiError(400, `Upload incomplete — received ${size} of ${declaredSize} bytes. Please retry.`);
  }
  if (size > rule.max) {
    await deleteLocalFile(key);
    throw new ApiError(413, `File exceeds the ${(rule.max / 1024 / 1024).toFixed(0)} MB limit`);
  }

  // Verify the bytes really are the declared type — same rule as every other path.
  const head = await readLocalHead(key);
  const sniffed = sniff(head);
  if (!signatureMatches(type, sniffed)) {
    await deleteLocalFile(key);
    throw new ApiError(400, "File contents do not match the declared type");
  }
  if (type === "image/svg+xml" && svgHasActiveContent(head.toString("utf8"))) {
    await deleteLocalFile(key);
    throw new ApiError(400, "SVG contains disallowed active content");
  }
  const dims = rule.kind === "image" && type !== "image/svg+xml" && type !== "image/avif" ? imageDimensions(head, type) : null;

  const [row] = await db
    .insert(media)
    .values({
      filename: key,
      originalName: name.slice(0, 200),
      mimeType: type,
      kind: rule.kind,
      size,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      storage: "local",
      storageKey: key,
      folderId,
      uploadedBy: me.id,
    })
    .returning({ id: media.id });

  await audit({ user: me, action: "media.uploaded", entity: "media", entityId: String(row.id), metadata: { filename: name, size, storage: "local" }, ip: getIp(req) });
  return json({ data: { id: row.id } }, { status: 201 });
});
