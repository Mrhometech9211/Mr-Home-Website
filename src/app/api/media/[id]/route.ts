import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, initDb } from "@/db";
import { media } from "@/db/schema";
import { getR2Buffer, r2PublicUrlBase } from "@/lib/r2";
import { localFilePath, localFileStat } from "@/lib/local-storage";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  // Development disk storage. Range support keeps <video> seeking working.
  if (m.storage === "local" && m.storageKey) {
    const stat = await localFileStat(m.storageKey);
    if (!stat) return new Response("Not found", { status: 404 });
    const range = req.headers.get("range");
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        start = match[1] ? Number(match[1]) : 0;
        end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
        status = 206;
      }
    }
    headers["Accept-Ranges"] = "bytes";
    headers["Content-Length"] = String(end - start + 1);
    headers["Cache-Control"] = "private, max-age=0";
    if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    const stream = createReadStream(localFilePath(m.storageKey), { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers });
  }

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
