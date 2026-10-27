import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectUnits, projects } from "@/db/schema";
import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser, userCan } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { projectUnitInputSchema, projectUnitUpdateSchema } from "@/lib/offers/schema";

export const dynamic = "force-dynamic";

async function requireInventoryWriter() {
  const me = await requireUser("offers.write");
  if (!userCan(me, "projects.write")) throw new ApiError(403, "You need project-write permission to edit inventory.");
  return me;
}

export const POST = handle(async (req) => {
  const me = await requireInventoryWriter();
  const body = projectUnitInputSchema.parse(await readJson(req));
  const [project] = await db.select({ id: projects.id, currency: projects.currency }).from(projects).where(eq(projects.id, body.projectId)).limit(1);
  if (!project) throw new ApiError(404, "Project not found");
  const [row] = await db
    .insert(projectUnits)
    .values({
      projectId: body.projectId,
      unitNo: body.unitNo,
      unitType: body.unitType ?? null,
      bedrooms: body.bedrooms ?? null,
      area: body.area != null ? String(body.area) : null,
      areaUnit: body.areaUnit ?? null,
      floor: body.floor ?? null,
      view: body.view ?? null,
      price: body.price != null ? String(body.price) : null,
      currency: (body.currency || project.currency || "AED").toUpperCase(),
      status: body.status ?? "available",
      notes: body.notes ?? null,
      source: "manual",
    })
    .returning();
  await audit({ user: me, action: "sales_offer.unit_created", entity: "project_units", entityId: row.id, metadata: { projectId: body.projectId, unitNo: row.unitNo } });
  return json({ data: row }, { status: 201 });
});

export const PATCH = handle(async (req) => {
  const me = await requireInventoryWriter();
  const body = projectUnitUpdateSchema.parse(await readJson(req));
  const [existing] = await db.select().from(projectUnits).where(eq(projectUnits.id, body.unitId)).limit(1);
  if (!existing) throw new ApiError(404, "Unit not found");
  const [row] = await db
    .update(projectUnits)
    .set({
      ...(body.unitNo !== undefined ? { unitNo: body.unitNo } : {}),
      ...(body.unitType !== undefined ? { unitType: body.unitType } : {}),
      ...(body.bedrooms !== undefined ? { bedrooms: body.bedrooms } : {}),
      ...(body.area !== undefined ? { area: body.area != null ? String(body.area) : null } : {}),
      ...(body.areaUnit !== undefined ? { areaUnit: body.areaUnit } : {}),
      ...(body.floor !== undefined ? { floor: body.floor } : {}),
      ...(body.view !== undefined ? { view: body.view } : {}),
      ...(body.price !== undefined ? { price: body.price != null ? String(body.price) : null } : {}),
      ...(body.currency !== undefined ? { currency: body.currency.toUpperCase() } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projectUnits.id, body.unitId))
    .returning();
  await audit({ user: me, action: "sales_offer.unit_updated", entity: "project_units", entityId: row.id, metadata: { projectId: row.projectId } });
  return json({ data: row });
});

export const DELETE = handle(async (req) => {
  const me = await requireInventoryWriter();
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") ?? "", 10);
  if (Number.isNaN(id)) throw new ApiError(400, "Invalid unit id");
  const [row] = await db.delete(projectUnits).where(eq(projectUnits.id, id)).returning();
  if (!row) throw new ApiError(404, "Unit not found");
  await audit({ user: me, action: "sales_offer.unit_deleted", entity: "project_units", entityId: id, metadata: { projectId: row.projectId, unitNo: row.unitNo } });
  return json({ ok: true });
});

/** Used by the builder to load units for a newly selected project. */
export const GET = handle(async (req) => {
  await requireUser("offers.read");
  const url = new URL(req.url);
  const projectId = parseInt(url.searchParams.get("projectId") ?? "", 10);
  if (Number.isNaN(projectId)) throw new ApiError(400, "projectId is required");
  const rows = await db.select().from(projectUnits).where(and(eq(projectUnits.projectId, projectId))).orderBy(projectUnits.unitNo);
  return json({ data: rows });
});
