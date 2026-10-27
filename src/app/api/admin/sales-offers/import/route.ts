import { eq } from "drizzle-orm";
import { db } from "@/db";
import { media, projectUnits, projects } from "@/db/schema";
import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser, userCan } from "@/lib/auth";
import { parseInventoryFile } from "@/lib/offers/import";
import { importParseSchema } from "@/lib/offers/schema";
import { getR2Buffer } from "@/lib/r2";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const me = await requireUser("offers.write");
  if (!userCan(me, "projects.write")) throw new ApiError(403, "You need project-write permission to import inventory.");
  const body = importParseSchema.parse(await readJson(req));

  const [project] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, body.projectId)).limit(1);
  if (!project) throw new ApiError(404, "Project not found");

  const [asset] = await db.select().from(media).where(eq(media.id, body.mediaId)).limit(1);
  if (!asset || asset.status !== "ready") throw new ApiError(404, "Uploaded document not found");
  if (asset.size > 20 * 1024 * 1024) throw new ApiError(413, "Inventory documents are limited to 20 MB. Split the file or use CSV.");

  const ext = (asset.originalName.split(".").pop() ?? "").toLowerCase();
  if (!["csv", "txt", "tsv", "xlsx", "xls", "xlsm", "pdf"].includes(ext)) {
    throw new ApiError(400, "Upload a CSV, XLSX or PDF inventory file.");
  }

  let bytes: Buffer | null = null;
  if (asset.storage === "r2" && asset.storageKey) bytes = await getR2Buffer(asset.storageKey);
  else if (asset.data) bytes = Buffer.from(asset.data);
  if (!bytes) throw new ApiError(404, "The uploaded document could not be read from storage.");

  const parsed = await parseInventoryFile(new Uint8Array(bytes), asset.originalName);
  const existing = await db.select({ unitNo: projectUnits.unitNo }).from(projectUnits).where(eq(projectUnits.projectId, body.projectId));
  const existingSet = new Set(existing.map((u) => u.unitNo.toLowerCase()));
  const rows = parsed.rows.map((r) => ({ ...r, exists: existingSet.has(r.unitNo.toLowerCase()) }));

  return json({
    data: {
      project: { id: project.id, name: project.name },
      media: { id: asset.id, name: asset.originalName, size: asset.size },
      source: parsed.source,
      columns: parsed.columns,
      mapping: parsed.mapping,
      rows,
      errors: parsed.errors,
      warnings: parsed.warnings,
      extractedText: parsed.extractedText,
      summary: {
        rows: rows.length,
        existing: rows.filter((r) => r.exists).length,
        duplicatesInFile: rows.filter((r) => r.duplicateInFile).length,
        withPrice: rows.filter((r) => r.price != null && r.price > 0).length,
        withWarnings: rows.filter((r) => r.warnings.length > 0 || r.exists).length,
      },
    },
  });
});
