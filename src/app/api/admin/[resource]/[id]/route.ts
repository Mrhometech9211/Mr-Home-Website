import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leadActivities } from "@/db/schema";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { destroyAllUserSessions, hashPassword, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { computeLeadScore } from "@/lib/lead-score";
import { assertPublishFlags, buildSchema, columnsOf, getResource, resolveCustomRoleName, toRow } from "@/lib/resources-server";
import { effectiveHas } from "@/lib/permissions";

type Ctx = { params: Promise<{ resource: string; id: string }> };

function parseId(id: string) {
  const n = parseInt(id, 10);
  if (Number.isNaN(n)) throw new ApiError(400, "Invalid id");
  return n;
}

export const GET = handle<Ctx>(async (_req, ctx) => {
  const { resource, id } = await ctx.params;
  const res = getResource(resource);
  if (!res) throw new ApiError(404, "Unknown resource");
  await requireUser(res.def.read);
  const cols = columnsOf(res.table);
  const [row] = await db.select().from(res.table).where(eq(cols.id, parseId(id))).limit(1);
  if (!row) throw new ApiError(404, "Not found");
  const out = { ...(row as Record<string, unknown>) };
  delete out.passwordHash;
  delete out.data;
  return json({ data: out });
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const { resource, id } = await ctx.params;
  const res = getResource(resource);
  if (!res || res.def.readOnly) throw new ApiError(404, "Unknown resource");
  const me = await requireUser(res.def.write);
  const numericId = parseId(id);
  const cols = columnsOf(res.table);
  const [existing] = await db.select().from(res.table).where(eq(cols.id, numericId)).limit(1);
  if (!existing) throw new ApiError(404, "Not found");
  const prev = existing as Record<string, unknown>;
  const body = await readJson<Record<string, unknown>>(req);
  const data = buildSchema(res.def, true).parse(body) as Record<string, unknown>;
  assertPublishFlags(resource, me, data);

  if (resource === "users") {
    if (data.role && data.role !== prev.role && !(me.role === "SUPER_ADMIN" || (me.role === "ADMIN" && data.role !== "SUPER_ADMIN"))) throw new ApiError(403, "Only a Super Admin can grant the Super Admin role");
    if ((data.role === "CUSTOM" || data.customRoleId != null || data.customRoleName) && !effectiveHas(me.role, "roles.write", me.effectivePermissions ?? null)) throw new ApiError(403, "Only users who manage roles can assign custom roles");
    await resolveCustomRoleName(me, data);
    // Role escalation guard: an actor can never grant themselves permissions or a role they do not hold.
    if (numericId === me.id && ((data.role && data.role !== me.role) || ("customRoleId" in data && data.customRoleId !== me.customRoleId))) throw new ApiError(403, "You cannot change your own role or permissions");
    if (numericId === me.id && data.active === false) throw new ApiError(400, "You cannot deactivate your own account");
    if (numericId === me.id && data.role && data.role !== me.role) throw new ApiError(400, "You cannot change your own role");
    if (data.password) {
      data.passwordHash = await hashPassword(data.password as string);
      await destroyAllUserSessions(numericId);
      await audit({ user: me, action: "user.password_reset", entity: "users", entityId: numericId, ip: getIp(req) });
    }
    delete data.password;
    if (data.active === false) await destroyAllUserSessions(numericId);
  }

  // News: stamp publishedAt the first time an article goes live.
  if (resource === "news" && data.published === true && !prev.publishedAt && data.publishedAt === undefined) {
    data.publishedAt = new Date();
  }

  const [row] = await db.update(res.table).set(toRow(res.table, data) as never).where(eq(cols.id, numericId)).returning();
  const updated = row as Record<string, unknown>;
  delete updated.passwordHash;

  const changed = Object.keys(data).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(updated[k]) && k !== "passwordHash");
  if (resource === "leads") {
    if (changed.includes("status")) {
      await db.insert(leadActivities).values({ leadId: numericId, userId: me.id, userName: me.name, type: "status", description: `Status changed ${prev.status} → ${updated.status}` });
      // Recompute the lead score whenever qualification-relevant fields change.
      if (changed.some((c) => ["status", "budget", "marketId", "projectId", "phone", "whatsapp"].includes(c))) {
        await db.update(res.table).set({ score: computeLeadScore(updated as Record<string, unknown>) } as never).where(eq(cols.id, numericId));
      }
    }
    if (changed.includes("assignedTo")) await db.insert(leadActivities).values({ leadId: numericId, userId: me.id, userName: me.name, type: "assigned", description: updated.assignedTo ? `Assigned to user #${updated.assignedTo}` : "Unassigned" });
    if (changed.includes("archived")) await db.insert(leadActivities).values({ leadId: numericId, userId: me.id, userName: me.name, type: updated.archived ? "archived" : "restored", description: updated.archived ? "Lead archived" : "Lead restored" });
    if (changed.some((c) => !["status", "assignedTo", "archived"].includes(c))) await db.insert(leadActivities).values({ leadId: numericId, userId: me.id, userName: me.name, type: "updated", description: `Updated ${changed.join(", ")}` });
  }
  const publishFlip = changed.includes("published") ? (updated.published ? "published" : "unpublished") : null;
  await audit({ user: me, action: publishFlip ? `${res.def.singular.toLowerCase()}.${publishFlip}` : `${res.def.singular.toLowerCase()}.updated`, entity: resource, entityId: numericId, metadata: { changed }, ip: getIp(req) });
  return json({ data: updated });
});

export const DELETE = handle<Ctx>(async (req, ctx) => {
  const { resource, id } = await ctx.params;
  const res = getResource(resource);
  if (!res || res.def.readOnly) throw new ApiError(404, "Unknown resource");
  const me = await requireUser(res.def.write);
  const numericId = parseId(id);
  if (resource === "users" && numericId === me.id) throw new ApiError(400, "You cannot delete your own account");
  const cols = columnsOf(res.table);
  const [row] = await db.delete(res.table).where(eq(cols.id, numericId)).returning();
  if (!row) throw new ApiError(404, "Not found");
  const r = row as Record<string, unknown>;
  await audit({ user: me, action: `${res.def.singular.toLowerCase()}.deleted`, entity: resource, entityId: numericId, metadata: { name: r.name ?? r.title ?? r.label ?? r.email }, ip: getIp(req) });
  return json({ ok: true });
});
