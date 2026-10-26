import { z } from "zod";
import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cancelBrochureUpload } from "@/lib/admin-upload-flow";

/** Best-effort cancel of an in-flight brochure upload (client abort / retry). */
const bodySchema = z.object({ id: z.number().int().positive() });

export const POST = handle(async (req) => {
  const me = await requireUser("brochures.write");
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new ApiError(400, "Invalid cancel request");
  await cancelBrochureUpload(me.id, body.data.id);
  return json({ ok: true });
});
