import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { markets, newsArticles, type Market, type NewsArticle } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { safeSections, validateForPublish, type BuilderSection } from "@/lib/page-builder";
import type { Permission } from "@/lib/permissions";

/**
 * Builder targets for editorial content (Phase 12).
 *
 * Pages and projects already own their builder columns. Markets and news
 * articles get the same draft/published pair so the universal builder can edit
 * them without a second, divergent section model. Everything here is additive:
 * a record with an empty `builderPublished` renders exactly as it did before.
 */
export type ContentBuilderKind = "market" | "news";

type TargetMeta = {
  kind: ContentBuilderKind;
  label: string;
  read: Permission;
  write: Permission;
  publish: Permission;
  /** Admin editor route for the record itself. */
  editHref: (id: number) => string;
  /** Private draft preview inside the admin. */
  previewHref: (id: number) => string;
};

export const CONTENT_BUILDER_TARGETS: Record<ContentBuilderKind, TargetMeta> = {
  market: {
    kind: "market",
    label: "market page",
    read: "markets.read",
    write: "markets.write",
    publish: "markets.publish",
    editHref: (id) => `/admin/markets/${id}`,
    previewHref: (id) => `/preview/markets/${id}`,
  },
  news: {
    kind: "news",
    label: "article",
    read: "news.read",
    write: "news.write",
    publish: "news.publish",
    editHref: (id) => `/admin/news/${id}`,
    previewHref: (id) => `/preview/news/${id}`,
  },
};

export function isContentBuilderKind(value: string): value is ContentBuilderKind {
  return value === "market" || value === "news";
}

export function targetMeta(kind: ContentBuilderKind): TargetMeta {
  return CONTENT_BUILDER_TARGETS[kind];
}

export type ContentBuilderRecord = {
  kind: ContentBuilderKind;
  id: number;
  title: string;
  slug: string;
  published: boolean;
  draft: BuilderSection[];
  publishedSections: BuilderSection[];
  /** Public path a published payload appears at. */
  publicHref: string;
};

function newId(prefix: string, i: number): string {
  return `${prefix}-${i}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Starting sections built only from the record's own fields — no invented copy,
 * no fabricated figures. The administrator reviews and rewrites them.
 */
export function contentSeedSections(kind: ContentBuilderKind, row: Market | NewsArticle): BuilderSection[] {
  if (kind === "market") {
    const market = row as Market;
    const out: BuilderSection[] = [];
    out.push({
      id: newId("overview", out.length),
      type: "text",
      eyebrow: market.tagline ?? null,
      title: `Market overview`,
      body: market.description ?? "",
      image: market.coverImage ?? null,
      imageLayout: "right",
      visible: { desktop: true, tablet: true, mobile: true },
    });
    if (market.investmentOverview) {
      out.push({
        id: newId("outlook", out.length),
        type: "text",
        title: "Investment outlook",
        body: market.investmentOverview,
        visible: { desktop: true, tablet: true, mobile: true },
      });
    }
    // The hero and the statistics band stay on the page above the builder body,
    // so the seed deliberately does not duplicate the stats as a section.
    out.push({
      id: newId("projects", out.length),
      type: "related",
      title: `Projects in ${market.name}`,
      body: market.slug,
      visible: { desktop: true, tablet: true, mobile: true },
    });
    out.push({
      id: newId("form", out.length),
      type: "form",
      eyebrow: "Enquire",
      title: `Invest in ${market.name}`,
      body: "Tell us what you are looking for and an advisor will reply within one business day.",
      visible: { desktop: true, tablet: true, mobile: true },
    });
    return out;
  }

  const article = row as NewsArticle;
  const out: BuilderSection[] = [];
  // The article header and cover image already render above the builder body,
  // so the seed starts with the copy rather than repeating the title in a hero.
  if (article.body.trim()) {
    out.push({
      id: newId("body", out.length),
      type: "text",
      body: article.body,
      visible: { desktop: true, tablet: true, mobile: true },
    });
  }
  if (article.videoUrl) {
    out.push({
      id: newId("video", out.length),
      type: "video",
      title: "Watch the film",
      videoUrl: article.videoUrl,
      visible: { desktop: true, tablet: true, mobile: true },
    });
  }
  out.push({
    id: newId("cta", out.length),
    type: "cta",
    title: "Speak with an advisor",
    body: "We reply within one business day.",
    ctaLabel: "Contact us",
    ctaHref: "/contact",
    visible: { desktop: true, tablet: true, mobile: true },
  });
  return out;
}

function invalidId(raw: string): never {
  throw new ApiError(400, "Invalid id");
}

export function parseTargetId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) invalidId(raw);
  return id;
}

export async function loadContentBuilder(kind: ContentBuilderKind, id: number): Promise<ContentBuilderRecord> {
  if (kind === "market") {
    const [row] = await db.select().from(markets).where(eq(markets.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Market not found.");
    return {
      kind,
      id: row.id,
      title: row.name,
      slug: row.slug,
      published: row.published,
      draft: safeSections(row.builderDraft),
      publishedSections: safeSections(row.builderPublished),
      publicHref: `/markets/${row.slug}`,
    };
  }
  const [row] = await db.select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Article not found.");
  return {
    kind,
    id: row.id,
    title: row.title,
    slug: row.slug,
    published: row.published && !row.archived,
    draft: safeSections(row.builderDraft),
    publishedSections: safeSections(row.builderPublished),
    publicHref: `/news/${row.slug}`,
  };
}

async function loadRow(kind: ContentBuilderKind, id: number): Promise<Market | NewsArticle> {
  if (kind === "market") {
    const [row] = await db.select().from(markets).where(eq(markets.id, id)).limit(1);
    if (!row) throw new ApiError(404, "Market not found.");
    return row;
  }
  const [row] = await db.select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Article not found.");
  return row;
}

export async function saveContentDraft(kind: ContentBuilderKind, id: number, draft: BuilderSection[]): Promise<void> {
  if (kind === "market") {
    await db.update(markets).set({ builderDraft: draft, updatedAt: new Date() }).where(eq(markets.id, id));
    return;
  }
  await db.update(newsArticles).set({ builderDraft: draft, updatedAt: new Date() }).where(eq(newsArticles.id, id));
}

export async function seedContentDraft(kind: ContentBuilderKind, id: number): Promise<BuilderSection[]> {
  const row = await loadRow(kind, id);
  const sections = contentSeedSections(kind, row);
  await saveContentDraft(kind, id, sections);
  return sections;
}

export async function publishContentDraft(kind: ContentBuilderKind, id: number): Promise<BuilderSection[]> {
  const record = await loadContentBuilder(kind, id);
  const draft = record.draft;
  if (!draft.length) throw new ApiError(400, "Add at least one section before publishing.");
  try {
    validateForPublish(draft);
  } catch (e) {
    throw new ApiError(400, e instanceof Error ? e.message : "This page is not ready to publish.");
  }
  if (kind === "market") {
    await db.update(markets).set({ builderPublished: draft, updatedAt: new Date() }).where(eq(markets.id, id));
  } else {
    await db.update(newsArticles).set({ builderPublished: draft, updatedAt: new Date() }).where(eq(newsArticles.id, id));
  }
  return draft;
}

export async function resetContentBuilder(kind: ContentBuilderKind, id: number): Promise<void> {
  if (kind === "market") {
    await db.update(markets).set({ builderDraft: [], builderPublished: [], updatedAt: new Date() }).where(eq(markets.id, id));
    return;
  }
  await db.update(newsArticles).set({ builderDraft: [], builderPublished: [], updatedAt: new Date() }).where(eq(newsArticles.id, id));
}
