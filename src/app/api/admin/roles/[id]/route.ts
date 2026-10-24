import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customRoles, users } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PERMISSIONS, validateCustomPermissions } from "@/lib/permissions";

/** Update + delete for custom roles (Phase 6). Same escalation guard as create. */
async function requireRolesWriter() {
  return requireUser("roles.write");
}

function assertNoEscalation(me: { role: string; effectivePermissions?: string[] | null }, perms: string[]) {
  if (me.role === "SUPER_ADMIN") return;
  const mine = (me.effectivePermissions ?? []).filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  const forbidden = perms.filter((p) => (PERMISSIONS as readonly string[]).includes(p) && !mine.includes(p));
  if (forbidden.length) throw new ApiError(403, `You cannot grant permissions you do not hold yourself: ${forbidden.join(", ")}`);
}

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string().max(80)).max(200).optional(),
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const me = await requireRolesWriter();
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) throw new ApiError(400, "Invalid id");
  const body = patchSchema.parse(await readJson(req));
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
  await audit({ user: me, action: "custom_role.updated", entity: "custom_roles", entityId: numericId, metadata: { changed: Object.keys(data).filter((k) => k !== "updatedAt") }, ip: getIp(req) });
  // Session hygiene: users holding this role keep their old permission set until
  // next request resolution; nothing is cached beyond the React `cache()` scope.
  return json({ data: row });
});

export const DELETE = handle<Ctx>(async (req, ctx) => {
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
