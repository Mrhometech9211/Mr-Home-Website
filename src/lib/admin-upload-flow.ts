import "server-only";

/**
 * Shared server-side logic behind the presigned direct-to-R2 upload endpoints
 * (used by BOTH the media library and the project brochure flows).
 *
 * Browser flow:
 *   1. POST /api/admin/{media|brochures}/upload          → init: validates the
 *      request, creates a `pending` DB row and returns short-lived presigned
 *      upload URL(s). The browser then PUTs the bytes straight to R2.
 *   2. POST /api/admin/{media|brochures}/upload/complete  → finalize: verifies
 *      the object exists in R2, matches the declared size and passes the file
 *      signature check, then flips the row to `ready`. The public/admin URLs
 *      (/api/media/{id}, gated brochure download) start working immediately.
 *   3. POST /api/admin/{media|brochures}/upload/cancel    → best-effort abort +
 *      cleanup of a failed/abandoned upload attempt.
 *
 * Abandoned sessions (init never completed within 24 h) are swept on every
 * init call so R2 never accumulates orphaned objects indefinitely.
 */

import { and, eq, lt, desc } from "drizzle-orm";
import { db } from "@/db";
import { brochures, media } from "@/db/schema";
import { ApiError } from "@/lib/api";
import {
  R2_SINGLE_PUT_MAX,
  R2_MULTIPART_THRESHOLD,
  R2_PART_SIZE,
  assertSafeKey,
  mediaKey,
  brochureKey,
  startMultipart,
  completeMultipart,
  abortMultipart,
  deleteR2Object,
  headR2Object,
  getR2Buffer,
  getR2HeadBytes,
  presignPut,
} from "@/lib/r2";
import { ALLOWED, imageDimensions, sniff, svgHasActiveContent } from "@/lib/media-validation";
import { BROCHURE_MAX_BYTES, BROCHURE_MAX_LABEL } from "@/lib/upload-limits";

/** How long a `pending` row may exist before the sweeper cancels it. */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type InitRequest = {
  filename: string;
  contentType: string;
  size: number;
  /** Force the multipart protocol regardless of size. */
  multipart?: boolean;
};

export type InitResult = {
  id: number;
  key: string;
  mode: "direct" | "multipart";
  putUrl?: string;
  parts?: { uploadId: string; partSize: number; partUrls: string[] };
};

/**
 * Cancel stale pending uploads and their R2 leftovers. Cheap, best-effort,
 * idempotent — runs inline on init so no cron is required.
 */
async function sweepAbandoned(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - PENDING_TTL_MS);
    const staleMedia = await db
      .select({ id: media.id, storageKey: media.storageKey })
      .from(media)
      .where(and(eq(media.status, "pending"), lt(media.createdAt, cutoff)))
      .limit(25);
    for (const row of staleMedia) {
      if (row.storageKey) await deleteR2Object(row.storageKey);
      await db.delete(media).where(eq(media.id, row.id));
    }
    const staleBrochures = await db
      .select({ id: brochures.id, storageKey: brochures.storageKey })
      .from(brochures)
      .where(and(eq(brochures.status, "pending"), lt(brochures.createdAt, cutoff)))
      .limit(25);
    for (const row of staleBrochures) {
      if (row.storageKey) await deleteR2Object(row.storageKey);
      await db.delete(brochures).where(eq(brochures.id, row.id));
    }
  } catch {
    // Sweeping must never block a new upload.
  }
}

/**
 * Directory-quota policy: allowed content types, extensions and size caps live
 * in one place (src/lib/media-validation.ts ALLOWED). The hard ceiling for any
 * single object is R2's own single-PUT limit — nothing "unlimited" is promised.
 */
function validateDeclared(filename: string, contentType: string, size: number) {
  const rule = ALLOWED[contentType];
  if (!rule) throw new ApiError(400, `File type "${contentType}" is not allowed`);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!rule.ext.includes(ext)) throw new ApiError(400, `Extension .${ext} does not match type ${contentType}`);
  if (size > Math.min(rule.max, R2_SINGLE_PUT_MAX)) {
    throw new ApiError(413, `File exceeds the ${(Math.min(rule.max, R2_SINGLE_PUT_MAX) / 1024 / 1024).toFixed(0)}MB limit`);
  }
  return { kind: rule.kind };
}

/** Media-library init: validate the request, insert a pending row, presign. */
export async function initMediaUpload(meId: number, req: InitRequest): Promise<InitResult> {
  await sweepAbandoned();
  const filename = String(req.filename ?? "").trim();
  const contentType = String(req.contentType ?? "").trim().toLowerCase();
  const size = Number(req.size);
  if (!filename || filename.length > 300) throw new ApiError(400, "A valid file name is required");
  if (!contentType) throw new ApiError(400, "A file content type is required");
  if (!Number.isFinite(size) || size <= 0) throw new ApiError(400, "File size is required");
  const { kind } = validateDeclared(filename, contentType, size);
  const key = mediaKey(filename);
  assertSafeKey(key);
  const [row] = await db
    .insert(media)
    .values({
      filename: key,
      originalName: filename.slice(0, 200),
      mimeType: contentType,
      kind,
      size,
      storage: "r2",
      storageKey: key,
      status: "pending",
      uploadedBy: meId,
    })
    .returning({ id: media.id });

  try {
    if (size > R2_MULTIPART_THRESHOLD) {
      const session = await startMultipart(key, contentType, size);
      return { id: row.id, key, mode: "multipart", parts: { uploadId: session.uploadId, partSize: R2_PART_SIZE, partUrls: session.partUrls } };
    }
    const putUrl = await presignPut(key, contentType);
    return { id: row.id, key, mode: "direct", putUrl };
  } catch (err) {
    await db.delete(media).where(eq(media.id, row.id));
    throw err;
  }
}

/** Brochure init: project-scoped PDF-only variant of the same flow. */
export async function initBrochureUpload(meId: number, projectId: number, req: InitRequest, allowDownload: boolean): Promise<InitResult> {
  await sweepAbandoned();
  const filename = String(req.filename ?? "").trim();
  const contentType = String(req.contentType ?? "").trim().toLowerCase();
  const size = Number(req.size);
  if (!filename || filename.length > 300) throw new ApiError(400, "A valid file name is required");
  if (!/\.pdf$/i.test(filename) || contentType !== "application/pdf") throw new ApiError(400, "Only PDF brochures are accepted");
  if (!Number.isFinite(size) || size <= 0) throw new ApiError(400, "File size is required");
  if (size > Math.min(BROCHURE_MAX_BYTES, R2_SINGLE_PUT_MAX)) {
    throw new ApiError(413, `PDF exceeds the ${BROCHURE_MAX_LABEL} brochure limit`);
  }
  const key = brochureKey(filename);
  assertSafeKey(key);
  const [row] = await db
    .insert(brochures)
    .values({
      projectId,
      filename: key,
      originalName: filename.slice(0, 200),
      mimeType: "application/pdf",
      size,
      storage: "r2",
      storageKey: key,
      status: "pending",
      allowDownload,
      uploadedBy: meId,
    })
    .returning({ id: brochures.id });

  try {
    if (size > R2_MULTIPART_THRESHOLD) {
      const session = await startMultipart(key, "application/pdf", size);
      return { id: row.id, key, mode: "multipart", parts: { uploadId: session.uploadId, partSize: R2_PART_SIZE, partUrls: session.partUrls } };
    }
    const putUrl = await presignPut(key, "application/pdf");
    return { id: row.id, key, mode: "direct", putUrl };
  } catch (err) {
    await db.delete(brochures).where(eq(brochures.id, row.id));
    throw err;
  }
}

/**
 * Finalize an in-flight upload: verify the R2 object exists, its size matches,
 * and the signature matches the declared type. On success the row becomes
 * `ready`. On mismatch the object + pending row are deleted so transient
 * failures can never corrupt the library.
 */
export async function completeMediaUpload(meId: number, id: number, opts: { multipart?: { uploadId: string; parts: { partNumber: number; etag: string }[] } } = {}): Promise<void> {
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Upload session not found");
  if (row.status === "ready") return;
  if (row.storage !== "r2" || !row.storageKey) throw new ApiError(400, "Upload session is not a direct R2 upload");
  if (meId !== row.uploadedBy) throw new ApiError(403, "You do not own this upload session");

  if (opts.multipart) {
    await completeMultipart(row.storageKey, opts.multipart.uploadId, opts.multipart.parts);
  }

  const head = await headR2Object(row.storageKey);
  if (!head) {
    await db.delete(media).where(eq(media.id, row.id));
    throw new ApiError(400, "Upload did not reach storage — please try again");
  }
  if (Math.abs(head.size - row.size) > 1) {
    await deleteR2Object(row.storageKey);
    await db.delete(media).where(eq(media.id, row.id));
    throw new ApiError(400, "Uploaded file size does not match — please try again");
  }
  // Signature verification: bytes must agree with the declared content type.
  const headBytes = await getR2HeadBytes(row.storageKey, 128);
  const sniffed = sniff(headBytes);
  if (sniffed !== row.mimeType && !(row.mimeType === "image/avif" && sniffed === "video/mp4")) {
    await deleteR2Object(row.storageKey);
    await db.delete(media).where(eq(media.id, row.id));
    throw new ApiError(400, "File contents do not match the declared type");
  }

  // SVGs are text: the legacy path scans the whole file for active content.
  // The R2 path must do the same or an SVG with <script> would be published
  // through /api/media — the head-byte sniff alone cannot catch it.
  if (row.mimeType === "image/svg+xml") {
    const whole = await getR2Buffer(row.storageKey);
    if (!whole || svgHasActiveContent(whole.toString("utf8"))) {
      await deleteR2Object(row.storageKey);
      await db.delete(media).where(eq(media.id, row.id));
      throw new ApiError(400, "SVG contains disallowed active content");
    }
  }

  // Fill image dimensions using the head bytes (JPEG/PNG/GIF/WebP headers).
  const dims = row.mimeType.startsWith("image/") ? imageDimensions(headBytes, row.mimeType) : null;
  await db
    .update(media)
    .set({ status: "ready", width: dims?.width ?? null, height: dims?.height ?? null })
    .where(eq(media.id, row.id));
}

/** Finalize a brochure upload (PDF magic-byte check inside the R2 object). */
export async function completeBrochureUpload(meId: number, id: number, opts: { multipart?: { uploadId: string; parts: { partNumber: number; etag: string }[] } } = {}): Promise<void> {
  const [row] = await db.select().from(brochures).where(eq(brochures.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Upload session not found");
  if (row.status === "ready") return;
  if (row.storage !== "r2" || !row.storageKey) throw new ApiError(400, "Upload session is not a direct R2 upload");
  if (meId !== row.uploadedBy) throw new ApiError(403, "You do not own this upload session");

  if (opts.multipart) {
    await completeMultipart(row.storageKey, opts.multipart.uploadId, opts.multipart.parts);
  }

  const head = await headR2Object(row.storageKey);
  if (!head) {
    await db.delete(brochures).where(eq(brochures.id, row.id));
    throw new ApiError(400, "Upload did not reach storage — please try again");
  }
  if (Math.abs(head.size - row.size) > 1) {
    await deleteR2Object(row.storageKey);
    await db.delete(brochures).where(eq(brochures.id, row.id));
    throw new ApiError(400, "Uploaded file size does not match — please try again");
  }
  const headBytes = await getR2HeadBytes(row.storageKey, 8);
  if (!(headBytes.length >= 5 && headBytes[0] === 0x25 && headBytes[1] === 0x50 && headBytes[2] === 0x44 && headBytes[3] === 0x46)) {
    await deleteR2Object(row.storageKey);
    await db.delete(brochures).where(eq(brochures.id, row.id));
    throw new ApiError(400, "Only valid PDF brochure files are accepted");
  }
  await db.update(brochures).set({ status: "ready" }).where(eq(brochures.id, row.id));
}

/** Best-effort cancel: abort a multipart session, delete partial object + pending row. */
export async function cancelMediaUpload(meId: number, id: number, uploadId?: string): Promise<void> {
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row || row.uploadedBy !== meId || row.status !== "pending") return;
  if (row.storageKey) {
    // Abandoned multipart parts otherwise linger (and bill) until a bucket
    // lifecycle rule reaps them; aborting is immediate and idempotent.
    if (uploadId) await abortMultipart(row.storageKey, uploadId);
    await deleteR2Object(row.storageKey);
  }
  await db.delete(media).where(eq(media.id, row.id));
}

export async function cancelBrochureUpload(meId: number, id: number, uploadId?: string): Promise<void> {
  const [row] = await db.select().from(brochures).where(eq(brochures.id, id)).limit(1);
  if (!row || row.uploadedBy !== meId || row.status !== "pending") return;
  if (row.storageKey) {
    if (uploadId) await abortMultipart(row.storageKey, uploadId);
    await deleteR2Object(row.storageKey);
  }
  await db.delete(brochures).where(eq(brochures.id, row.id));
}

/** Latest brochure for a project (metadata only, for the public gate state). */
export async function latestBrochureForProject(projectId: number) {
  const rows = await db
    .select({ id: brochures.id, allowDownload: brochures.allowDownload })
    .from(brochures)
    .where(and(eq(brochures.projectId, projectId), eq(brochures.status, "ready")))
    .orderBy(desc(brochures.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
