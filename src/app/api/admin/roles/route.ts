import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customRoles, users } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PERMISSIONS, validateCustomPermissions } from "@/lib/permissions";

/**
 * Custom roles API (Phase 6). Every endpoint enforces, server-side:
 *  - list    → roles.read
 *  - create  → roles.write
 * and an actor can never grant permissions they do not themselves hold.
 */
async function requireRolesWriter() {
  return requireUser("roles.write");
}

function assertNoEscalation(me: { role: string; effectivePermissions?: string[] | null }, perms: string[]) {
  if (me.role === "SUPER_ADMIN") return;
  const mine = (me.effectivePermissions ?? []).filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  const forbidden = perms.filter((p) => (PERMISSIONS as readonly string[]).includes(p) && !mine.includes(p));
  if (forbidden.length) throw new ApiError(403, `You cannot grant permissions you do not hold yourself: ${forbidden.join(", ")}`);
}

export const GET = handle(async () => {
  await requireUser("roles.read");
  const rows = await db.select().from(customRoles).orderBy(asc(customRoles.name));
  const counts = await db.select({ roleId: users.customRoleId }).from(users);
  const usage: Record<number, number> = {};
  for (const c of counts) if (c.roleId != null) usage[c.roleId] = (usage[c.roleId] ?? 0) + 1;
  return json({ data: rows.map((r) => ({ ...r, inUse: usage[r.id] ?? 0 })) });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string().max(80)).max(200).default([]),
});

export const POST = handle(async (req) => {
  const me = await requireRolesWriter();
  const body = createSchema.parse(await readJson(req));
  const permissions = validateCustomPermissions(body.permissions);
  assertNoEscalation(me, permissions);
  const key = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `role-${Date.now()}`;
  const [row] = await db.insert(customRoles).values({ key, name: body.name, description: body.description ?? null, permissions }).returning();
  await audit({ user: me, action: "custom_role.created", entity: "custom_roles", entityId: row.id, metadata: { name: row.name, permissions: permissions.length }, ip: getIp(req) });
  return json({ data: row }, { status: 201 });
});
