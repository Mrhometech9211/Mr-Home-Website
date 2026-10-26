import { eq } from "drizzle-orm";
import { db } from "@/db";
import { brochures } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { safeFilename } from "@/lib/media-validation";

const MAX_BROCHURE_BYTES = 60 * 1024 * 1024; // 60 MB
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 5 && PDF_MAGIC.every((b, i) => buf[i] === b);
}

type Ctx = { params: Promise<{ id: string }> };

const listCols = {
  id: brochures.id,
  projectId: brochures.projectId,
  filename: brochures.filename,
  originalName: brochures.originalName,
  mimeType: brochures.mimeType,
  size: brochures.size,
  allowDownload: brochures.allowDownload,
  downloads: brochures.downloads,
  uploadedBy: brochures.uploadedBy,
  createdAt: brochures.createdAt,
  updatedAt: brochures.updatedAt,
};

export const GET = handle(async (_req, ctx: Ctx) => {
  await requireUser("brochures.read");
  const { id } = await ctx.params;
  const rows = await db.select(listCols).from(brochures).where(eq(brochures.id, Number(id))).limit(1);
  if (!rows[0]) throw new ApiError(404, "Brochure not found");
  return json({ data: rows[0] });
});

export const PATCH = handle(async (req, ctx: Ctx) => {
  const me = await requireUser("brochures.write");
  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  const current = await db.select().from(brochures).where(eq(brochures.id, id)).limit(1);
  if (!current[0]) throw new ApiError(404, "Brochure not found");
  const prior = current[0];

  const contentType = req.headers.get("content-type") ?? "";
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  /** Old R2 object; deleted only AFTER the row points at the new file. */
  let obsoleteKey: string | null = null;
  /** Temporary row created by the direct-upload replace flow — merged into
   *  this row and then removed so a project never has two live brochures
   *  sharing one object (deleting either would break the other). */
  let temporaryRowId: number | null = null;

  if (contentType.includes("multipart/form-data")) {
    // Replacement upload. The previous row is only touched once the new file is
    // fully validated, so a failed upload never destroys the last valid brochure.
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No file provided");
    if (file.size > MAX_BROCHURE_BYTES) throw new ApiError(413, "PDF too large (max 60 MB)");
    const buf = Buffer.from(await file.arrayBuffer());
    if (!looksLikePdf(buf)) throw new ApiError(400, "Only valid PDF brochure files are accepted");
    patch.filename = `brochures/${Date.now().toString(36)}-${safeFilename(file.name)}.pdf`;
    patch.originalName = file.name.slice(0, 200);
    patch.mimeType = "application/pdf";
    patch.size = file.size;
    patch.data = buf;
    // The bytes now live in Postgres — a legacy replace must clear the R2
    // pointer or the delivery route would keep serving the OLD object.
    patch.storage = "db";
    patch.storageKey = null;
    patch.status = "ready";
    patch.uploadedBy = me.id;
    if (prior.storage === "r2" && prior.storageKey) obsoleteKey = prior.storageKey;
    const ad = form.get("allowDownload");
    if (ad !== null) patch.allowDownload = String(ad) !== "false";
  } else {
    const body = await readJson<Record<string, unknown>>(req);
    if (typeof body.allowDownload === "boolean") patch.allowDownload = body.allowDownload;
    // Replace-with-a-fresh-direct-upload: the admin UI uploads the new PDF via
    // the presigned direct-to-R2 flow, then points the existing row at it.
    if (typeof body.newBrochureId === "number" && Number.isInteger(body.newBrochureId) && body.newBrochureId > 0) {
      const [fresh] = await db.select().from(brochures).where(eq(brochures.id, body.newBrochureId)).limit(1);
      if (!fresh || fresh.id === prior.id || fresh.status !== "ready" || fresh.projectId !== prior.projectId) {
        throw new ApiError(400, "Replacement brochure is not a verified PDF for this project");
      }
      patch.filename = fresh.filename;
      patch.originalName = fresh.originalName;
      patch.mimeType = fresh.mimeType;
      patch.size = fresh.size;
      patch.storage = fresh.storage;
      patch.storageKey = fresh.storageKey ?? null;
      patch.status = "ready";
      patch.uploadedBy = me.id;
      // Never keep two payloads on one row: R2 rows drop the legacy bytea and
      // bytea rows drop the old object key.
      if (fresh.storage === "r2") patch.data = null;
      else patch.storageKey = null;
      if (prior.storage === "r2" && prior.storageKey && prior.storageKey !== (fresh.storageKey ?? null)) {
        obsoleteKey = prior.storageKey;
      }
      temporaryRowId = fresh.id;
    }
  }

  // Single transaction: retarget this row and remove the temporary upload row
  // together, so a failure can never leave two brochures sharing one object.
  await db.transaction(async (tx) => {
    await tx.update(brochures).set(patch).where(eq(brochures.id, id));
    if (temporaryRowId) await tx.delete(brochures).where(eq(brochures.id, temporaryRowId));
  });
  const [row] = await db.select(listCols).from(brochures).where(eq(brochures.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Brochure not found");
  // The row is safely retargeted — now the previous object can go.
  if (obsoleteKey) {
    const { deleteR2Object } = await import("@/lib/r2");
    await deleteR2Object(obsoleteKey);
  }
  await audit({
    user: me,
    action: "brochure.updated",
    entity: "brochure",
    entityId: String(id),
    metadata: contentType.includes("multipart")
      ? { replacedFile: true, priorName: prior.originalName, newName: row.originalName }
      : { allowDownload: row.allowDownload },
    ip: getIp(req),
  });
  return json({ data: row });
});

export const DELETE = handle(async (req, ctx: Ctx) => {
  const me = await requireUser("brochures.write");
  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  const prior = await db
    .select({ originalName: brochures.originalName, projectId: brochures.projectId, storage: brochures.storage, storageKey: brochures.storageKey })
    .from(brochures)
    .where(eq(brochures.id, id))
    .limit(1);
  if (!prior[0]) throw new ApiError(404, "Brochure not found");
  await db.delete(brochures).where(eq(brochures.id, id));
  if (prior[0].storage === "r2" && prior[0].storageKey) {
    // The DB row is gone — do not orphan the object in the bucket.
    const { deleteR2Object } = await import("@/lib/r2");
    await deleteR2Object(prior[0].storageKey);
  }
  await audit({
    user: me,
    action: "brochure.deleted",
    entity: "brochure",
    entityId: String(id),
    metadata: { originalName: prior[0].originalName, projectId: prior[0].projectId },
    ip: getIp(req),
  });
  return json({ ok: true });
});
