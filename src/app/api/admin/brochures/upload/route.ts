import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { r2IsConfigured } from "@/lib/r2";
import { initBrochureUpload } from "@/lib/admin-upload-flow";

/**
 * Direct-to-R2 upload INIT for project brochures (PDF). This is the fix for
 * the HTTP 413 failures: bytes transfer browser → R2 directly, so the file
 * never passes through Vercel's request-body limit.
 */
const bodySchema = z.object({
  projectId: z.number().int().positive(),
  filename: z.string().min(1).max(300),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
  allowDownload: z.boolean().optional(),
});

export const POST = handle(async (req) => {
  const me = await requireUser("brochures.write");
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Invalid upload request");
  const rl = rateLimit(`upload-init:${me.id}`, 60, 60_000);
  if (!rl.ok) throw new ApiError(429, "Too many uploads — slow down a moment");
  if (!r2IsConfigured()) {
    throw new ApiError(503, "Direct upload is unavailable — R2 storage is not configured. Legacy uploads still work via the standard file picker.");
  }
  const [proj] = await db.select({ id: projects.id, name: projects.name, slug: projects.slug }).from(projects).where(eq(projects.id, body.data.projectId)).limit(1);
  if (!proj) throw new ApiError(404, "Project not found");
  const result = await initBrochureUpload(me.id, body.data.projectId, body.data, body.data.allowDownload ?? true);
  await audit({ user: me, action: "brochure.upload.init", entity: "brochure", entityId: String(result.id), metadata: { projectId: proj.id, projectName: proj.name, name: body.data.filename, size: body.data.size, mode: result.mode }, ip: getIp(req) });
  return json({ data: result, projectName: proj.name, projectSlug: proj.slug }, { status: 201 });
});
