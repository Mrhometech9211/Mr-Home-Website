import { z } from "zod";
import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { completeBrochureUpload } from "@/lib/admin-upload-flow";

/** Finalize a brochure direct-to-R2 upload (PDF magic verified in the object). */
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
  const me = await requireUser("brochures.write");
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Invalid completion request");
  await completeBrochureUpload(me.id, body.data.id, { multipart: body.data.multipart });
  return json({ ok: true, data: { id: body.data.id, url: `/api/brochures/${body.data.id}` } });
});
