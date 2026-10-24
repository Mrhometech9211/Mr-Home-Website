import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ApiError, getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PUBLISHABLE_RESOURCES, columnsOf, getResource } from "@/lib/resources-server";
import { effectiveHas } from "@/lib/permissions";
import { assertPublishFlags } from "@/lib/resources-server";

type Ctx = { params: Promise<{ resource: string }> };

const schema = z.object({
  action: z.enum(["publish", "unpublish", "feature", "unfeature", "archive", "restore", "delete", "duplicate", "reorder", "enable", "disable"]),
  ids: z.array(z.number().int()).min(1).max(500),
  order: z.array(z.object({ id: z.number().int(), order: z.number().int() })).optional(),
});

export const POST = handle<Ctx>(async (req, ctx) => {
  const { resource } = await ctx.params;
  const res = getResource(resource);
  if (!res || res.def.readOnly) throw new ApiError(404, "Unknown resource");
  const me = await requireUser(res.def.write);
  const { action, ids, order } = schema.parse(await readJson(req));
  const cols = columnsOf(res.table);
  if (resource === "users" && ids.includes(me.id) && action === "delete") throw new ApiError(400, "You cannot delete your own account");
  // Publish-flag bulk actions require the matching publish permission server-side.
  if (["publish", "unpublish", "feature", "unfeature"].includes(action) && PUBLISHABLE_RESOURCES[resource]) {
    const perm = PUBLISHABLE_RESOURCES[resource];
    if (!effectiveHas(me.role, perm, me.effectivePermissions ?? null)) throw new ApiError(403, `You do not have permission to publish this content (requires ${perm})`);
  }
  assertPublishFlags(resource, me, action === "reorder" ? {} : { [action === "publish" || action === "unpublish" ? "published" : action === "feature" || action === "unfeature" ? "featured" : "archived"]: true });
  if (res.def.publishable && ["enable", "disable"].includes(action)) {
    const perm = PUBLISHABLE_RESOURCES[resource];
    if (perm && !effectiveHas(me.role, perm, me.effectivePermissions ?? null)) throw new ApiError(403, `You do not have permission to publish this content (requires ${perm})`);
  }

  const setFlag = async (col: string, value: boolean) => {
    if (!cols[col]) throw new ApiError(400, `This resource does not support "${action}"`);
    await db.update(res.table).set({ [col]: value, ...(cols.updatedAt ? { updatedAt: new Date() } : {}) } as never).where(inArray(cols.id, ids));
  };

  switch (action) {
    case "publish": await setFlag("published", true); break;
    case "unpublish": await setFlag("published", false); break;
    case "feature": await setFlag("featured", true); break;
    case "unfeature": await setFlag("featured", false); break;
    case "archive": await setFlag("archived", true); break;
    case "restore": await setFlag("archived", false); break;
    case "enable": await setFlag(cols.enabled ? "enabled" : cols.visible ? "visible" : "active", true); break;
    case "disable": await setFlag(cols.enabled ? "enabled" : cols.visible ? "visible" : "active", false); break;
    case "delete": await db.delete(res.table).where(inArray(cols.id, ids)); break;
    case "reorder": {
      if (!order || !cols.order) throw new ApiError(400, "Order payload required");
      for (const o of order) await db.update(res.table).set({ order: o.order } as never).where(eq(cols.id, o.id));
      break;
    }
    case "duplicate": {
      if (!res.def.duplicatable) throw new ApiError(400, "This resource cannot be duplicated");
      const rows = (await db.select().from(res.table).where(inArray(cols.id, ids))) as Record<string, unknown>[];
      for (const r of rows) {
        const copy: Record<string, unknown> = { ...r };
        delete copy.id; delete copy.createdAt; delete copy.updatedAt;
        if (typeof copy.slug === "string") copy.slug = `${copy.slug}-copy-${Date.now().toString(36)}`;
        if (typeof copy.name === "string") copy.name = `${copy.name} (Copy)`;
        if (typeof copy.key === "string" && resource === "sections") copy.key = `${copy.key}-copy`;
        if ("published" in copy) copy.published = false;
        if ("featured" in copy) copy.featured = false;
        await db.insert(res.table).values(copy as never);
      }
      break;
    }
  }
  await audit({ user: me, action: `${res.def.singular.toLowerCase()}.bulk_${action}`, entity: resource, metadata: { ids }, ip: getIp(req) });
  return json({ ok: true, count: ids.length });
});
