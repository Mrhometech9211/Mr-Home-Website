import { eq } from "drizzle-orm";
import { db } from "@/db";
import { brochures } from "@/db/schema";
import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { presignGet } from "@/lib/r2";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Admin-only inline preview of a brochure PDF (served in the browser tab,
 * no download gate). Requires brochures.read; the payload never includes
 * the byte column in any JSON response.
 */
export const GET = handle(async (_req, ctx: Ctx) => {
  await requireUser("brochures.read");
  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid brochure id");
  const rows = await db
    .select({ data: brochures.data, storage: brochures.storage, storageKey: brochures.storageKey, mimeType: brochures.mimeType, originalName: brochures.originalName })
    .from(brochures)
    .where(eq(brochures.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ApiError(404, "Brochure not found");

  // R2 objects redirect to a short-lived inline URL: streaming a 60 MB PDF
  // through the function would exceed Vercel's response-body limit.
  if (row.storage === "r2" && row.storageKey) {
    try {
      const location = await presignGet(row.storageKey, { filename: row.originalName || "brochure.pdf", inline: true });
      return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "private, no-store" } });
    } catch {
      throw new ApiError(503, "Brochure storage is temporarily unavailable");
    }
  }

  if (!row.data) throw new ApiError(404, "Brochure not found");
  const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data as unknown as Uint8Array);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": row.mimeType || "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.originalName || "brochure.pdf")}"`,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, no-store",
    },
  });
});
