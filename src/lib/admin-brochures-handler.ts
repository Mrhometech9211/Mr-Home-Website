import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { brochures, projects } from "@/db/schema";
import { ApiError, getIp, handle, json, parseIntParam } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

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

export const GET = handle(async (req) => {
  await requireUser("brochures.read");
  const url = new URL(req.url);
  const page = parseIntParam(url.searchParams.get("page") ?? undefined, 1, 100000);
  const pageSize = parseIntParam(url.searchParams.get("pageSize") ?? undefined, 24, 100);
  const projectId = parseIntParam(url.searchParams.get("projectId") ?? undefined, 1, 1000000);
  // Only finalized rows: a pending direct-to-R2 row (upload interrupted or
  // still in flight) has no downloadable object and must not appear as a
  // brochure in the admin table.
  const where: SQL[] = [eq(brochures.status, "ready")];
  if (projectId) where.push(eq(brochures.projectId, projectId));
  const cond = and(...where);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(brochures).where(cond);
  const rows = await db
    .select({
      ...listCols,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(brochures)
    .innerJoin(projects, eq(brochures.projectId, projects.id))
    .where(cond)
    .orderBy(desc(brochures.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return json({ data: rows.map((r) => ({ ...r, url: `/api/brochures/${r.id}` })), total: count, page, pageSize });
});

export const POST = handle(async (req) => {
  const me = await requireUser("brochures.write");
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Expected multipart form data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file provided");
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new ApiError(400, "Only PDF brochures are supported");
  if (file.size > 20 * 1024 * 1024) throw new ApiError(413, "Brochure too large (max 20 MB)");
  const projectId = parseIntParam(String(form.get("projectId") ?? ""), 1, 1000000);
  if (!projectId) throw new ApiError(400, "projectId is required");
  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!proj) throw new ApiError(404, "Project not found");
  const buf = Buffer.from(await file.arrayBuffer());
  // A .pdf extension is not proof: the legacy path must enforce the same magic
  // bytes as the direct-to-R2 finalizer.
  if (buf.length < 5 || buf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new ApiError(400, "Only valid PDF brochure files are accepted");
  }
  const filename = `${Date.now().toString(36)}-${Buffer.from(file.name, "utf8").toString("base64url")}`.slice(0, 180);
  const [row] = await db.insert(brochures).values({
    projectId,
    filename,
    originalName: file.name.slice(0, 200),
    mimeType: "application/pdf",
    size: file.size,
    data: buf,
    uploadedBy: me.id,
  }).returning(listCols);
  await audit({
    user: me,
    action: "brochures.uploaded",
    entity: "brochures",
    entityId: String(row.id),
    metadata: { filename, size: file.size, mimeType: file.type, projectId, projectName: proj.name },
    ip: getIp(req),
  });
  return json({ data: { ...row, url: `/api/brochures/${row.id}`, projectName: proj.name, projectSlug: proj.slug } }, { status: 201 });
});
