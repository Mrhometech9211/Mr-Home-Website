import { eq } from "drizzle-orm";
import { db, initDb } from "@/db";
import { media } from "@/db/schema";
import { getR2Buffer, r2PublicUrlBase } from "@/lib/r2";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await ctx.params;
  const numeric = parseInt(id, 10);
  if (Number.isNaN(numeric)) return new Response("Not found", { status: 404 });
  const rows = await db.select().from(media).where(eq(media.id, numeric)).limit(1);
  const m = rows[0];
  // Pending direct-upload rows have not passed signature/finalisation checks —
  // never serve their bytes publicly.
  if (!m || m.status !== "ready") return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": m.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${m.mimeType.startsWith("image/") || m.mimeType.startsWith("video/") || m.mimeType === "application/pdf" ? "inline" : "attachment"}; filename="${(m.originalName || m.filename).replace(/"/g, "")}"`,
  };
  if (m.mimeType === "image/svg+xml") headers["Content-Security-Policy"] = "sandbox; script-src 'none'";

  // Public delivery — R2 objects first, legacy bytea rows fall through.
  if (m.storage === "r2" && m.storageKey) {
    // Signed public URLs are only reliable behind the R2 custom domain; the
    // raw R2 endpoint must never be assumed publicly readable.
    const publicBase = r2PublicUrlBase();
    if (publicBase) {
      const target = `${publicBase.replace(/\/+$/, "")}/${m.storageKey}`;
      const redirect = new Response(null, { status: 302, headers: { Location: target } });
      return redirect;
    }
    try {
      const buf = await getR2Buffer(m.storageKey);
      if (buf) {
        headers["Content-Length"] = String(buf.length);
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
        return new Response(new Uint8Array(buf), { headers });
      }
    } catch {
      // Fall through to bytea; if that fails too we 404 below.
    }
  }
  if (!m.data) return new Response("Not found", { status: 404 });
  headers["Content-Length"] = String(m.size);
  headers["Cache-Control"] = "public, max-age=31536000, immutable";
  return new Response(new Uint8Array(m.data), { headers });
}
