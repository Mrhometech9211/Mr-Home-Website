import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customRoles, leads } from "@/db/schema";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { effectiveHas } from "@/lib/permissions";
import { getSettings } from "@/lib/content";

/**
 * Desktop lead-notifier feed.
 *
 * The admin UI polls this every N seconds; a new lead id (> last seen) triggers
 * a native OS notification + sound in the open admin browser tab. Access is
 * gated by `leads.read` AND the settings' `notifyRoles` allowlist (empty list
 * = every user who can read leads).
 */
export const GET = handle(async () => {
  const me = await requireUser("leads.read");
  const settings = await getSettings();
  const n = settings.notifications;

  // Resolve the user's role label (custom roles are named in the DB).
  let roleLabel = String(me.role);
  if (me.role === "CUSTOM" && me.customRoleId != null) {
    const [match] = await db.select({ name: customRoles.name }).from(customRoles).where(eq(customRoles.id, me.customRoleId)).limit(1);
    if (match) roleLabel = match.name;
  }

  const allowed =
    n.leadsEnabled &&
    (n.notifyRoles.length === 0 || n.notifyRoles.includes(roleLabel) || n.notifyRoles.includes(String(me.role)));

  const [latest] = await db
    .select({ id: leads.id, name: leads.name, source: leads.source, page: leads.page, city: leads.city, createdAt: leads.createdAt })
    .from(leads)
    .orderBy(desc(leads.id))
    .limit(1);

  return json({
    allowed,
    latest: latest ?? null,
    config: {
      pollSeconds: n.pollSeconds,
      sound: n.sound,
      soundUrl: n.soundUrl,
      volume: n.volume,
      titleTemplate: n.titleTemplate,
    },
  });
});
