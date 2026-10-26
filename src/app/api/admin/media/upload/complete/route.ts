import { z } from "zod";
import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { completeMediaUpload } from "@/lib/admin-upload-flow";

/**
 * Finalize a media-library direct-to-R2 upload after the browser's PUT/PUTs
 * succeed. Verifies object existence, size agreement and file signature in
 * R2 before the row is marked `ready` and its URL becomes live.
 */
const bodySchema = z.object({
  id: z.number().int().positive(),
  multipart: z
    .object({
      uploadId: z.string().min(1).max(256),
      parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().min(1).max(256) })).min(1),
    })
    .optional(),
});

export const POST = handle(async (req) => {
  const me = await requireUser("media.write");
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Invalid completion request");
  await completeMediaUpload(me.id, body.data.id, { multipart: body.data.multipart });
  return json({ ok: true, data: { id: body.data.id, url: `/api/media/${body.data.id}` } });
});
