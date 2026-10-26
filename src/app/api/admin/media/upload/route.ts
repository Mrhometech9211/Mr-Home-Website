import { z } from "zod";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { r2IsConfigured } from "@/lib/r2";
import { initMediaUpload } from "@/lib/admin-upload-flow";

/**
 * Direct-to-R2 upload INIT for the media library (images, logos, videos,
 * documents). Creates a `pending` row and returns short-lived presigned
 * upload URL(s); the browser PUTs the bytes straight to R2.
 */
const bodySchema = z.object({
  filename: z.string().min(1).max(300),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
});

export const POST = handle(async (req) => {
  const me = await requireUser("media.write");
  const rl = rateLimit(`upload-init:${me.id}`, 60, 60_000);
  if (!rl.ok) throw new ApiError(429, "Too many uploads — slow down a moment");
  if (!r2IsConfigured()) {
    throw new ApiError(503, "Direct upload is unavailable — R2 storage is not configured. Legacy uploads still work via the standard file picker.");
  }
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Invalid upload request");
  const result = await initMediaUpload(me.id, body.data);
  await audit({ user: me, action: "media.upload.init", entity: "media", entityId: String(result.id), metadata: { name: body.data.filename, size: body.data.size, contentType: body.data.contentType, mode: result.mode }, ip: getIp(req) });
  return json({ data: result }, { status: 201 });
});
