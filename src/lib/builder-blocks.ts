import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { builderBlocks, pages, projects } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { safeSections, sectionLabel, type BuilderBlock, type BuilderSection } from "@/lib/page-builder";

/**
 * Reusable builder blocks (Phase 11).
 *
 * A "linked" section stores only a `blockId`; the master content is resolved at
 * render time, so editing the master updates every page that uses it. An
 * "independent" insert copies the section into the page and is never touched by
 * later master edits. Deleting a master that is still referenced is refused
 * rather than silently breaking those pages.
 */

type BlockRow = typeof builderBlocks.$inferSelect;

export function serializeBlock(row: BlockRow, usageCount?: number): BuilderBlock {
  const parsed = safeSections([row.section]);
  const section: BuilderSection = parsed[0] ?? {
    id: `block-${row.id}`,
    type: "text",
    title: row.name,
    body: "",
  };
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    section,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(usageCount === undefined ? {} : { usageCount }),
  };
}

export async function listBlocks(): Promise<BuilderBlock[]> {
  const rows = await db.select().from(builderBlocks).orderBy(asc(builderBlocks.name));
  const usage = await blockUsageMap();
  return rows.map((r) => serializeBlock(r, usage.get(r.id) ?? 0));
}

export async function getBlock(id: number): Promise<BuilderBlock | null> {
  const [row] = await db.select().from(builderBlocks).where(eq(builderBlocks.id, id)).limit(1);
  if (!row) return null;
  const usage = await blockUsageMap();
  return serializeBlock(row, usage.get(id) ?? 0);
}

/** Raw master sections keyed by block id (for render-time resolution). */
export async function blocksByIds(ids: number[]): Promise<Map<number, BuilderSection>> {
  const unique = Array.from(new Set(ids.filter((n) => Number.isInteger(n) && n > 0)));
  const out = new Map<number, BuilderSection>();
  if (!unique.length) return out;
  const rows = await db.select().from(builderBlocks);
  for (const row of rows) {
    if (!unique.includes(row.id)) continue;
    const parsed = safeSections([row.section]);
    if (parsed[0]) out.set(row.id, parsed[0]);
  }
  return out;
}

/**
 * Replace linked sections with their master content. Local instances keep their
 * own id, hidden flag, visibility and spacing/style overrides so a page can lay
 * the shared block out differently without breaking the link.
 */
export async function resolveBlocks(sections: BuilderSection[]): Promise<BuilderSection[]> {
  const ids = sections.filter((s) => s.blockMode === "linked" && s.blockId).map((s) => s.blockId as number);
  if (!ids.length) return sections;
  const masters = await blocksByIds(ids);
  return sections.map((s) => {
    if (s.blockMode !== "linked" || !s.blockId) return s;
    const master = masters.get(s.blockId);
    if (!master) {
      // Master vanished — fall back to the local copy so the page never blanks.
      return { ...s, blockMode: "independent", blockId: null };
    }
    return {
      ...master,
      id: s.id,
      hidden: s.hidden ?? master.hidden,
      visible: s.visible ?? master.visible,
      style: s.style ?? master.style,
      blockId: s.blockId,
      blockMode: "linked",
    };
  });
}

type Usage = { kind: "page" | "project"; id: number; name: string; status: string };

/** Scan stored drafts and published content for references to each block. */
export async function blockUsageMap(): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const scan = (raw: unknown) => {
    for (const s of safeSections(raw)) {
      if (s.blockMode === "linked" && s.blockId) map.set(s.blockId, (map.get(s.blockId) ?? 0) + 1);
    }
  };
  const [pageRows, projectRows] = await Promise.all([
    db.select({ draft: pages.draft, published: pages.published }).from(pages),
    db.select({ draft: projects.builderDraft, published: projects.builderPublished }).from(projects),
  ]);
  for (const r of pageRows) {
    scan(r.draft);
    scan(r.published);
  }
  for (const r of projectRows) {
    scan(r.draft);
    scan(r.published);
  }
  return map;
}

/** Human-readable list of the pages/projects that use a block. */
export async function blockUsage(id: number): Promise<Usage[]> {
  const out: Usage[] = [];
  const [pageRows, projectRows] = await Promise.all([
    db.select({ id: pages.id, title: pages.title, slug: pages.slug, status: pages.status, draft: pages.draft, published: pages.published }).from(pages),
    db.select({ id: projects.id, name: projects.name, slug: projects.slug, published: projects.published, draft: projects.builderDraft, live: projects.builderPublished }).from(projects),
  ]);
  const uses = (raw: unknown) => safeSections(raw).some((s) => s.blockMode === "linked" && s.blockId === id);
  for (const p of pageRows) {
    if (uses(p.draft) || uses(p.published)) out.push({ kind: "page", id: p.id, name: p.title || p.slug, status: p.status });
  }
  for (const p of projectRows) {
    if (uses(p.draft) || uses(p.live)) out.push({ kind: "project", id: p.id, name: p.name || p.slug, status: p.published ? "published" : "draft" });
  }
  return out;
}

export type BlockInput = {
  name: string;
  category?: string | null;
  description?: string | null;
  section: unknown;
};

function assertSection(raw: unknown): BuilderSection {
  const parsed = safeSections([raw]);
  const section = parsed[0];
  if (!section) throw new ApiError(400, "That block content is not a valid section.");
  return section;
}

export async function createBlock(input: BlockInput, userId: number | null): Promise<BuilderBlock> {
  const section = assertSection(input.section);
  // A block is a master, never a reference to another block.
  const clean: BuilderSection = { ...section, blockId: null, blockMode: null, hidden: false };
  const [row] = await db
    .insert(builderBlocks)
    .values({
      name: input.name.trim().slice(0, 120),
      category: input.category?.trim().slice(0, 60) || null,
      description: input.description?.trim().slice(0, 400) || null,
      section: clean,
      createdBy: userId,
    })
    .returning();
  return serializeBlock(row, 0);
}

export async function updateBlock(
  id: number,
  patch: { name?: string; category?: string | null; description?: string | null; section?: unknown },
): Promise<BuilderBlock> {
  const existing = await getBlock(id);
  if (!existing) throw new ApiError(404, "Reusable block not found.");
  const section = patch.section === undefined ? undefined : assertSection(patch.section);
  const [row] = await db
    .update(builderBlocks)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 120) || existing.name } : {}),
      ...(patch.category !== undefined ? { category: patch.category?.trim().slice(0, 60) || null } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim().slice(0, 400) || null } : {}),
      ...(section !== undefined ? { section: { ...section, blockId: null, blockMode: null, hidden: false } } : {}),
      updatedAt: new Date(),
    })
    .where(eq(builderBlocks.id, id))
    .returning();
  return serializeBlock(row, existing.usageCount ?? 0);
}

/** Delete a master block, refusing while any page or project still links to it. */
export async function deleteBlock(id: number): Promise<{ ok: true }> {
  const existing = await getBlock(id);
  if (!existing) throw new ApiError(404, "Reusable block not found.");
  const usage = await blockUsage(id);
  if (usage.length) {
    const where = usage.slice(0, 4).map((u) => u.name).join(", ");
    throw new ApiError(
      409,
      `This block is used on ${usage.length} page${usage.length === 1 ? "" : "s"} (${where}). Unlink it there first, or insert an independent copy instead.`,
    );
  }
  await db.delete(builderBlocks).where(eq(builderBlocks.id, id));
  return { ok: true };
}

/** Default name for a block created from an existing section. */
export function suggestBlockName(section: BuilderSection): string {
  const title = (section.title || section.eyebrow || "").trim();
  return (title || section.label || sectionLabel(section.type)).slice(0, 120);
}

/** Newest blocks first, for the "recently used" strip in the insert dialog. */
export async function recentBlocks(limit = 6): Promise<BuilderBlock[]> {
  const rows = await db.select().from(builderBlocks).orderBy(desc(builderBlocks.updatedAt)).limit(limit);
  const usage = await blockUsageMap();
  return rows.map((r) => serializeBlock(r, usage.get(r.id) ?? 0));
}
