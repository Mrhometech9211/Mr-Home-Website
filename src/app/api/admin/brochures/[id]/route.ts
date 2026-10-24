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
    patch.uploadedBy = me.id;
    const ad = form.get("allowDownload");
    if (ad !== null) patch.allowDownload = String(ad) !== "false";
  } else {
    const body = await readJson<Record<string, unknown>>(req);
    if (typeof body.allowDownload === "boolean") patch.allowDownload = body.allowDownload;
  }

  const [row] = await db.update(brochures).set(patch).where(eq(brochures.id, id)).returning(listCols);
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
    .select({ originalName: brochures.originalName, projectId: brochures.projectId })
    .from(brochures)
    .where(eq(brochures.id, id))
    .limit(1);
  if (!prior[0]) throw new ApiError(404, "Brochure not found");
  await db.delete(brochures).where(eq(brochures.id, id));
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
