import { desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { brochures, projects } from "@/db/schema";
import { ApiError, getIp, handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { safeFilename } from "@/lib/media-validation";
import { BROCHURE_MAX_BYTES, BROCHURE_MAX_LABEL } from "@/lib/upload-limits";
import { brochureExistsForProject } from "@/lib/brochure-token";

// Legacy in-band upload only (small files); large brochures use direct-to-R2.
const MAX_BROCHURE_BYTES = BROCHURE_MAX_BYTES;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 5 && PDF_MAGIC.every((b, i) => buf[i] === b);
}

/** Latest brochure per project (only ASKED-FOR metadata, never the byte payload). */
const listCols = {
  id: brochures.id,
  projectId: brochures.projectId,
  filename: brochures.filename,
  originalName: brochures.originalName,
  mimeType: brochures.mimeType,
  size: brochures.size,
  allowDownload: brochures.allowDownload,
  status: brochures.status,
  downloads: brochures.downloads,
  uploadedBy: brochures.uploadedBy,
  createdAt: brochures.createdAt,
  updatedAt: brochures.updatedAt,
};

export const GET = handle(async () => {
  await requireUser("brochures.read");
  const rows = await db
    .select({ brochure: listCols, projectName: projects.name, projectSlug: projects.slug })
    .from(brochures)
    .innerJoin(projects, eq(brochures.projectId, projects.id))
    // Hide in-flight direct-to-R2 sessions — the PDF is not verified yet.
    .where(ne(brochures.status, "pending"))
    .orderBy(desc(brochures.createdAt));

  // Active brochure per project = the most recent upload (history is retained).
  const latestByProject = new Map<number, { id: number }>();
  const history: { id: number }[] = [];
  const seen = new Set<number>();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(brochures).where(ne(brochures.status, "pending"));

  for (const r of rows) {
    const brochure = r.brochure as unknown as { projectId: number; id: number };
    if (!seen.has(brochure.projectId)) {
      seen.add(brochure.projectId);
      latestByProject.set(brochure.projectId, { id: brochure.id });
    } else {
      history.push({ id: brochure.id });
    }
  }

  // Flat rows — the admin UI reads row.id / row.projectName directly.
  const data = rows.map((r) => ({ ...r.brochure, projectName: r.projectName, projectSlug: r.projectSlug }));
  return json({ data, total: count, byProject: [...latestByProject.values()], historyIds: history.map((h) => h.id) });
});

export const POST = handle(async (req) => {
  const me = await requireUser("brochures.write");
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Expected multipart form data");
  });
  const file = form.get("file");
  const projectRaw = form.get("projectId");
  const projectId = Number(projectRaw);
  if (!(file instanceof File)) throw new ApiError(400, "No file provided");
  if (!Number.isInteger(projectId) || projectId <= 0) throw new ApiError(400, "A valid project is required");
  if (file.size > MAX_BROCHURE_BYTES) throw new ApiError(413, `PDF too large (max ${BROCHURE_MAX_LABEL})`);
  const buf = Buffer.from(await file.arrayBuffer());
  // Content sniffing: type declarations can be spoofed, so verify PDF magic bytes.
  if (!looksLikePdf(buf)) throw new ApiError(400, "Only valid PDF brochure files are accepted");
  if (file.type && file.type !== "application/pdf") throw new ApiError(400, "Only PDF files are accepted");

  const project = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project.length) throw new ApiError(404, "Project not found");

  const filename = `brochures/${Date.now().toString(36)}-${safeFilename(file.name)}.pdf`;
  const allowDownload = String(form.get("allowDownload") ?? "true") !== "false";
  const [row] = await db.insert(brochures).values({
    projectId,
    filename,
    originalName: file.name.slice(0, 200),
    mimeType: "application/pdf",
    size: file.size,
    data: buf,
    allowDownload,
    uploadedBy: me.id,
  }).returning(listCols);
  await audit({
    user: me,
    action: "brochure.uploaded",
    entity: "brochure",
    entityId: String(row.id),
    metadata: { projectId, originalName: row.originalName, size: row.size },
    ip: getIp(req),
  });
  return json({ data: row }, { status: 201 });
});
