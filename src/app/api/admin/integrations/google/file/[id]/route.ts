import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { googleConfigured, openDriveFile } from "@/lib/google-drive";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Authenticated proxy for previewing/downloading a Drive file inside the admin.
 * The browser never sees a Google token, and Range requests are forwarded so
 * <video> seeking works.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async (request) => {
    await requireUser("media.read");
    if (!googleConfigured()) throw new ApiError(503, "Google Drive is not configured");
    const { id } = await ctx.params;
    if (!id || id.length > 300) throw new ApiError(400, "Invalid file id");

    const range = request.headers.get("range");
    const download = new URL(request.url).searchParams.get("download") === "1";
    const meta = await openDriveFile(id, range ?? undefined).catch((err) => {
      throw new ApiError(400, err instanceof Error ? err.message : "Google Drive is unavailable");
    });

    const headers: Record<string, string> = {
      "Content-Type": meta.meta.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${(meta.meta.name || "drive-file").replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=0",
      "Accept-Ranges": "bytes",
    };
    if (meta.contentLength) headers["Content-Length"] = String(meta.contentLength);
    if (meta.contentRange) headers["Content-Range"] = meta.contentRange;
    return new Response(meta.body, { status: meta.status, headers });
  })(req, ctx);
}
