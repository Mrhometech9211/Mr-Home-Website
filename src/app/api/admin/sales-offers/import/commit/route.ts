import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { projectUnits, projects } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser, userCan } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { importCommitSchema } from "@/lib/offers/schema";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const me = await requireUser("offers.write");
  if (!userCan(me, "projects.write")) throw new ApiError(403, "You need project-write permission to import inventory.");
  const body = importCommitSchema.parse(await readJson(req));

  const [project] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, body.projectId)).limit(1);
  if (!project) throw new ApiError(404, "Project not found");

  // Dedupe inside the request itself (case-insensitive unit number); the last
  // row wins only after the admin has seen the in-file duplicate warning.
  const byUnit = new Map<string, (typeof body.rows)[number]>();
  for (const row of body.rows) byUnit.set(row.unitNo.trim().toLowerCase(), { ...row, unitNo: row.unitNo.trim() });
  const rows = [...byUnit.values()];

  const existingRows = await db
    .select({ id: projectUnits.id, unitNo: projectUnits.unitNo })
    .from(projectUnits)
    .where(and(eq(projectUnits.projectId, body.projectId), inArray(projectUnits.unitNo, rows.map((r) => r.unitNo))));
  const existing = new Map(existingRows.map((r) => [r.unitNo.toLowerCase(), r.id]));

  const toInsert = rows.filter((r) => !existing.has(r.unitNo.toLowerCase()));
  const toUpdate = body.mode === "update" ? rows.filter((r) => existing.has(r.unitNo.toLowerCase())) : [];

  if (toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 200) {
      await db
        .insert(projectUnits)
        .values(
          toInsert.slice(i, i + 200).map((r) => ({
            projectId: body.projectId,
            unitNo: r.unitNo,
            unitType: r.unitType ?? null,
            bedrooms: r.bedrooms ?? null,
            area: r.area != null ? String(r.area) : null,
            areaUnit: r.areaUnit ?? null,
            floor: r.floor ?? null,
            view: r.view ?? null,
            price: r.price != null ? String(r.price) : null,
            currency: body.currency.toUpperCase(),
            status: r.status ?? "available",
            source: body.source ?? "inventory import",
          })),
        )
        .onConflictDoNothing();
    }
  }

  for (const r of toUpdate) {
    const id = existing.get(r.unitNo.toLowerCase())!;
    await db
      .update(projectUnits)
      .set({
        ...(r.unitType !== undefined ? { unitType: r.unitType } : {}),
        ...(r.bedrooms !== undefined ? { bedrooms: r.bedrooms } : {}),
        ...(r.area !== undefined ? { area: r.area != null ? String(r.area) : null } : {}),
        ...(r.areaUnit !== undefined ? { areaUnit: r.areaUnit } : {}),
        ...(r.floor !== undefined ? { floor: r.floor } : {}),
        ...(r.view !== undefined ? { view: r.view } : {}),
        ...(r.price !== undefined ? { price: r.price != null ? String(r.price) : null } : {}),
        ...(r.status !== undefined ? { status: r.status } : {}),
        currency: body.currency.toUpperCase(),
        source: body.source ?? "inventory import",
        updatedAt: new Date(),
      })
      .where(and(eq(projectUnits.id, id), eq(projectUnits.projectId, body.projectId)));
  }

  const result = {
    inserted: toInsert.length,
    updated: toUpdate.length,
    skipped: rows.length - toInsert.length - toUpdate.length,
    duplicatesInFile: body.rows.length - rows.length,
  };
  await audit({
    user: me,
    action: "sales_offer.units_imported",
    entity: "project_units",
    entityId: body.projectId,
    metadata: { project: project.name, mode: body.mode, ...result },
    ip: getIp(req),
  });
  return json({ data: result });
});
