import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { getIp, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DEFAULT_SETTINGS, mergeSettings } from "@/lib/settings-types";
import { settingsPatchSchema } from "@/lib/settings-payload";

export const GET = handle(async () => {
  await requireUser("settings.read");
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  return json({ data: mergeSettings(rows[0]?.data), defaults: DEFAULT_SETTINGS });
});

export const PUT = handle(async (req) => {
  const me = await requireUser("settings.write");
  const patch = settingsPatchSchema.parse(await readJson(req));
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  const current = mergeSettings(rows[0]?.data);
  const next = { ...current, ...patch };
  if (rows[0]) await db.update(siteSettings).set({ data: next as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(siteSettings.id, 1));
  else await db.insert(siteSettings).values({ id: 1, data: next as unknown as Record<string, unknown> });
  const cur = current as unknown as Record<string, unknown>;
  const changed = Object.keys(patch).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify((patch as Record<string, unknown>)[k]));
  await audit({ user: me, action: "settings.updated", entity: "settings", entityId: 1, metadata: { changed }, ip: getIp(req) });
  return json({ data: next });
});
