import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brochures, projects } from "@/db/schema";
import { ApiError, getIp, json } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { verifyBrochureDownload, brochureExistsForProject } from "@/lib/brochure-token";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (req: Request, ctx: Ctx) => {
  try {
    const ip = getIp(req);
    const rl = rateLimit(`brochure-dl:${ip}`, 20, 10 * 60 * 1000);
    if (!rl.ok) {
      return json({ error: "Too many downloads. Please try again later." }, { status: 429 });
    }

    const { id: rawId } = await ctx.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid brochure id");

    const url = new URL(req.url);
    const leadId = Number(url.searchParams.get("lead"));
    const sig = url.searchParams.get("sig") ?? "";
    if (!Number.isInteger(leadId) || leadId <= 0 || !verifyBrochureDownload(leadId, id, sig)) {
      // Unsigned or tampered requests are rejected: the brochure only unlocks
      // after the lead gate has recorded the visitor's details.
      throw new ApiError(403, "Brochure access requires completing the download form");
    }

    const [row] = await db
      .select({
        filename: brochures.filename,
        originalName: brochures.originalName,
        mimeType: brochures.mimeType,
        data: brochures.data,
        storage: brochures.storage,
        storageKey: brochures.storageKey,
        status: brochures.status,
        allowDownload: brochures.allowDownload,
        downloads: brochures.downloads,
      })
      .from(brochures)
      .orderBy(desc(brochures.createdAt))
      .where(eq(brochures.id, id))
      .limit(1);

    if (!row) return json({ error: "Brochure not found" }, { status: 404 });
    // Ready rows only — an in-flight direct-to-R2 upload never releases bytes.
    if (row.status && row.status !== "ready") return json({ error: "Brochure not found" }, { status: 404 });
    if (!row.data && row.storage !== "r2") return json({ error: "Brochure not found" }, { status: 404 });
    if (!row.allowDownload) return json({ error: "Brochure downloads are currently unavailable" }, { status: 403 });

    // The file must still belong to an active published project — prevents
    // downloads of brochures for since-unpublished projects via old tokens.
    const check = await db
      .select({ id: brochures.id, projectId: brochures.projectId, published: projects.published, archived: projects.archived })
      .from(brochures)
      .innerJoin(projects, eq(brochures.projectId, projects.id))
      .where(eq(brochures.id, id))
      .limit(1);
    if (!check[0] || !check[0].published || check[0].archived) {
      return json({ error: "Brochure no longer available" }, { status: 403 });
    }

    await db.update(brochures).set({ downloads: row.downloads + 1, updatedAt: new Date() }).where(eq(brochures.id, id));

    // Storage resolution: R2 object first, legacy Postgres bytea second.
    let bytes: Uint8Array;
    if (row.storage === "r2" && row.storageKey) {
      const { getR2Buffer } = await import("@/lib/r2");
      const buffer = await getR2Buffer(row.storageKey);
      if (!buffer) return json({ error: "Brochure not found" }, { status: 404 });
      bytes = new Uint8Array(buffer);
    } else {
      bytes = new Uint8Array(row.data as unknown as ArrayBuffer);
    }
    return new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(row.originalName || "brochure.pdf").replace(/[^\w.\- ]+/g, "_")}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    const message =
      status >= 500 ? "Something went wrong. Please try again." : (err as Error)?.message ?? "Request failed";
    if (status >= 500) console.error("[brochure-download]", err);
    return json({ error: message }, { status });
  }
};
