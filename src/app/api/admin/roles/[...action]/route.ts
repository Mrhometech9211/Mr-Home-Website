import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customRoles, users } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser, userCan } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PERMISSIONS, validateCustomPermissions } from "@/lib/permissions";

/** All custom-role endpoints require the roles.write permission (server-enforced). */
async function requireRolesWriter() {
  const me = await requireUser("roles.write");
  if (me.role !== "SUPER_ADMIN" && me.role !== "ADMIN") {
    // Custom-role holders must themselves possess roles.write (checked by requireUser above).
  }
  return me;
}

/** An actor may never grant permissions they do not themselves hold. */
function assertNoEscalation(me: { role: string; effectivePermissions?: string[] | null }, perms: string[]) {
  if (me.role === "SUPER_ADMIN") return;
  const mine = me.effectivePermissions ?? [];
  const forbidden = perms.filter((p) => (PERMISSIONS as readonly string[]).includes(p) && !mine.includes(p));
  if (forbidden.length) throw new ApiError(403, `You cannot grant permissions you do not hold yourself: ${forbidden.join(", ")}`);
}

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string().max(80)).max(200).default([]),
});

export const GET = handle(async () => {
  await requireUser("roles.read");
  const rows = await db.select().from(customRoles).orderBy(asc(customRoles.name));
  const counts = await db.select({ roleId: users.customRoleId }).from(users);
  const usage: Record<number, number> = {};
  for (const c of counts) if (c.roleId != null) usage[c.roleId] = (usage[c.roleId] ?? 0) + 1;
  return json({ data: rows.map((r) => ({ ...r, inUse: usage[r.id] ?? 0 })) });
});

export const POST = handle(async (req) => {
  const me = await requireRolesWriter();
  const body = bodySchema.parse(await readJson(req));
  const permissions = validateCustomPermissions(body.permissions);
  assertNoEscalation(me, permissions);
  const key = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `role-${Date.now()}`;
  const [row] = await db.insert(customRoles).values({ key, name: body.name, description: body.description ?? null, permissions }).returning();
  await audit({ user: me, action: "custom_role.created", entity: "custom_roles", entityId: row.id, metadata: { name: row.name, permissions: permissions.length }, ip: getIp(req) });
  return json({ data: row }, { status: 201 });
});

type Ctx = { params: Promise<{ id: string }> };

export const GET_ID = handle<Ctx>(async (_req, ctx) => {
  await requireUser("roles.read");
  const { id } = await ctx.params;
  const [row] = await db.select().from(customRoles).where(eq(customRoles.id, Number(id))).limit(1);
  if (!row) throw new ApiError(404, "Not found");
  return json({ data: row });
});

export const PATCH_ID = handle<Ctx>(async (req, ctx) => {
  const me = await requireRolesWriter();
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) throw new ApiError(400, "Invalid id");
  const body = bodySchema.partial().parse(await readJson(req));
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.permissions !== undefined) {
    const permissions = validateCustomPermissions(body.permissions);
    assertNoEscalation(me, permissions);
    data.permissions = permissions;
  }
  if (Object.keys(data).length === 0) throw new ApiError(400, "Nothing to update");
  data.updatedAt = new Date();
  const [row] = await db.update(customRoles).set(data as never).where(eq(customRoles.id, numericId)).returning();
  if (!row) throw new ApiError(404, "Not found");
  // Utility hygiene: a user may not raise their own role privileges mid-session.
  await audit({ user: me, action: "custom_role.updated", entity: "custom_roles", entityId: numericId, metadata: { changed: Object.keys(data).filter((k) => k !== "updatedAt") }, ip: getIp(req) });
  return json({ data: row });
});

export const DELETE_ID = handle<Ctx>(async (req, ctx) => {
  const me = await requireRolesWriter();
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) throw new ApiError(400, "Invalid id");
  const inUse = await db.select({ id: users.id }).from(users).where(eq(users.customRoleId, numericId)).limit(1);
  if (inUse.length) throw new ApiError(400, "This role is assigned to users — unassign it first");
  const [row] = await db.delete(customRoles).where(eq(customRoles.id, numericId)).returning();
  if (!row) throw new ApiError(404, "Not found");
  await audit({ user: me, action: "custom_role.deleted", entity: "custom_roles", entityId: numericId, metadata: { name: row.name }, ip: getIp(req) });
  return json({ ok: true });
});
