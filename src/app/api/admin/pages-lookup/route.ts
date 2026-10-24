import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { getIp, handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";

/**
 * Published custom pages only — used by Admin → Content → Sections to link a
 * section to a page created in the Pages module (key stored as `custom:<slug>`).
 */
export const GET = handle(async () => {
  await requireUser("pages.read");
  const rows = await db
    .select({ id: pages.id, title: pages.title, slug: pages.slug, status: pages.status })
    .from(pages)
    .where(and(eq(pages.status, "published")))
    .orderBy(pages.title);
  return json({ data: rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, pageKey: `custom:${r.slug}` })) });
});
