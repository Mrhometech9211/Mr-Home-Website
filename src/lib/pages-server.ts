import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { pageRevisions, pages } from "@/db/schema";
import type { BuilderPage, BuilderSection } from "./page-builder";

export type { BuilderPage };

/** Serialize a DB row into the client-safe BuilderPage shape. */
export function serializePage(row: typeof pages.$inferSelect): BuilderPage {
  let draft: BuilderSection[] = [];
  let published: BuilderSection[] = [];
  try { draft = (Array.isArray(row.draft) ? row.draft : []) as BuilderSection[]; } catch { draft = []; }
  try { published = (Array.isArray(row.published) ? row.published : []) as BuilderSection[]; } catch { published = []; }
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    navLabel: row.navLabel,
    navOrder: row.navOrder,
    navVisible: row.navVisible,
    status: row.status,
    draft,
    published,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    noIndex: row.noIndex,
    ogImage: row.ogImage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getPage(id: number): Promise<BuilderPage | null> {
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  return row ? serializePage(row) : null;
}

export async function listPages(): Promise<BuilderPage[]> {
  const rows = await db.select().from(pages).orderBy(desc(pages.updatedAt));
  return rows.map(serializePage);
}

/** Headline shown on a revision: first visible section's title/eyebrow. */
export function headlineFor(sections: BuilderSection[]): string {
  const first = sections.find((s) => !s.hidden && s.type !== "form");
  const t = first?.title || first?.eyebrow || "";
  return t.trim().slice(0, 160) || "Untitled snapshot";
}

/** Insert a revision snapshot (keep at most ~20 per page: prune oldest). */
export async function saveRevision(pageId: number, userId: number | null, userName: string | null, headline: string, data: BuilderSection[]) {
  await db.insert(pageRevisions).values({ pageId, userId, userName, headline, data });
  const all = await db
    .select({ id: pageRevisions.id })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .orderBy(desc(pageRevisions.id));
  const excess = all.slice(20);
  for (const row of excess) {
    await db.delete(pageRevisions).where(eq(pageRevisions.id, row.id));
  }
}

export async function listRevisions(pageId: number) {
  const rows = await db
    .select({
      id: pageRevisions.id,
      headline: pageRevisions.headline,
      userName: pageRevisions.userName,
      createdAt: pageRevisions.createdAt,
    })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .orderBy(desc(pageRevisions.id));
  return rows.map((r) => ({ id: r.id, headline: r.headline, userName: r.userName, createdAt: r.createdAt.toISOString() }));
}

export async function getRevision(pageId: number, revisionId: number) {
  const [row] = await db
    .select()
    .from(pageRevisions)
    .where(eq(pageRevisions.id, revisionId))
    .limit(1);
  if (!row || row.pageId !== pageId) return null;
  return { id: row.id, headline: row.headline, data: (Array.isArray(row.data) ? row.data : []) as BuilderSection[] };
}
