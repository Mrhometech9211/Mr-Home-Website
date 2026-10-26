import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { media } from "@/db/schema";
import { ApiError, getIp, handle, json, parseIntParam } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { safeFilename, validateUpload } from "@/lib/media-validation";

const listCols = { id: media.id, filename: media.filename, originalName: media.originalName, mimeType: media.mimeType, kind: media.kind, size: media.size, width: media.width, height: media.height, alt: media.alt, caption: media.caption, uploadedBy: media.uploadedBy, createdAt: media.createdAt };

export const GET = handle(async (req) => {
  await requireUser("media.read");
  const url = new URL(req.url);
  const page = parseIntParam(url.searchParams.get("page") ?? undefined, 1, 100000);
  const pageSize = parseIntParam(url.searchParams.get("pageSize") ?? undefined, 24, 100);
  const q = url.searchParams.get("q")?.trim();
  const kind = url.searchParams.get("kind");
  const sort = url.searchParams.get("sort") ?? "createdAt";
  const dir = url.searchParams.get("dir") === "asc" ? asc : desc;
  const conds: SQL[] = [];
  if (q) conds.push(or(ilike(media.filename, `%${q}%`), ilike(media.alt, `%${q}%`), ilike(media.caption, `%${q}%`))!);
  if (kind) conds.push(eq(media.kind, kind));
  // Never list `pending` upload sessions — their object is not yet verified in R2.
  conds.push(ne(media.status, "pending"));
  const where = conds.length ? and(...conds) : undefined;
  const sortCol = sort === "size" ? media.size : sort === "filename" ? media.filename : media.createdAt;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(media).where(where);
  const rows = await db.select(listCols).from(media).where(where).orderBy(dir(sortCol)).limit(pageSize).offset((page - 1) * pageSize);
  return json({ data: rows.map((r) => ({ ...r, url: `/api/media/${r.id}` })), total: count, page, pageSize });
});

export const POST = handle(async (req) => {
  const me = await requireUser("media.write");
  const form = await req.formData().catch(() => { throw new ApiError(400, "Expected multipart form data"); });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file provided");
  if (file.size > 80 * 1024 * 1024) throw new ApiError(413, "File too large");
  const buf = Buffer.from(await file.arrayBuffer());
  const v = validateUpload({ name: file.name, type: file.type, size: file.size }, buf);
  if (!v.ok) throw new ApiError(400, v.error);
  const kindOverride = form.get("kind");
  const kind = kindOverride === "logo" && v.kind === "image" ? "logo" : v.kind;
  const filename = `${Date.now().toString(36)}-${safeFilename(file.name)}`;
  const [row] = await db.insert(media).values({
    filename, originalName: file.name.slice(0, 200), mimeType: file.type, kind, size: file.size,
    width: v.dims?.width ?? null, height: v.dims?.height ?? null,
    alt: String(form.get("alt") ?? "").slice(0, 300) || null, caption: String(form.get("caption") ?? "").slice(0, 500) || null,
    data: buf, uploadedBy: me.id,
  }).returning(listCols);
  await audit({ user: me, action: "media.uploaded", entity: "media", entityId: row.id, metadata: { filename, size: file.size, mimeType: file.type }, ip: getIp(req) });
  return json({ data: { ...row, url: `/api/media/${row.id}` } }, { status: 201 });
});
