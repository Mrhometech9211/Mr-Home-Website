import "server-only";
import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db, initDb } from "@/db";
import {
  pageSections,
  sitePages,
  type SectionItem,
  type SitePageContent,
  type SitePageSectionPatch,
  type SitePageSeo,
} from "@/db/schema";
import { getCurrentUser, userCan } from "./auth";
import type { LypItem, SiteSettings } from "./settings-types";

/**
 * Built-in public pages. Pages with real `page_sections` rows use those rows
 * as their base content. List Your Property derives its base copy from the
 * existing Settings → List Your Property block, so the seller form, visible
 * fields and lead handling keep their current source.
 */
export type BuiltinPage = {
  /** page_sections.page key; also the site_pages primary key. */
  key: string;
  title: string;
  path: string;
  content: "sections" | "settings" | "listings";
  note?: string;
};

export const BUILTIN_PAGES: BuiltinPage[] = [
  { key: "home", title: "Home", path: "/", content: "sections" },
  { key: "why-mr-home", title: "Why MR.HOME", path: "/why-mr-home", content: "sections" },
  { key: "projects", title: "Projects", path: "/projects", content: "sections" },
  {
    key: "buy",
    title: "Buy",
    path: "/buy",
    content: "sections",
    note: "Only the page copy is editable here. Live listings, filters and availability still come from the Projects CMS and are never copied into this page.",
  },
  { key: "rent", title: "Rent", path: "/rent", content: "listings", note: "Listings and filters are managed under Rent properties. Marketing copy for this page is not section-based yet; SEO can be edited here." },
  { key: "markets", title: "Markets", path: "/markets", content: "sections" },
  { key: "contact", title: "Contact", path: "/contact", content: "sections" },
  {
    key: "list-your-property",
    title: "List Your Property",
    path: "/list-your-property",
    content: "sections",
    note: "Copy and display sections are editable here. The seller form, its fields, settings toggles and lead handling remain in Settings → List Your Property.",
  },
  { key: "news", title: "News", path: "/news", content: "sections" },
];

export const PREVIEW_COOKIE = "mh_page_preview";

export function getBuiltinPage(key: string): BuiltinPage | null {
  return BUILTIN_PAGES.find((p) => p.key === key) ?? null;
}

export function pageKeyFromPath(path: string): string | null {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  return BUILTIN_PAGES.find((p) => p.path === clean)?.key ?? null;
}

export const EMPTY_CONTENT: SitePageContent = { sections: {}, seo: {} };

export type PageSectionBase = {
  id: number;
  key: string;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  image: string | null;
  video: string | null;
  background: string | null;
  items: SectionItem[];
  order: number;
  enabled: boolean;
  updatedAt?: Date | string | null;
  virtual?: boolean;
};

const STRING_FIELDS = [
  "eyebrow",
  "title",
  "subtitle",
  "body",
  "ctaLabel",
  "ctaHref",
  "secondaryCtaLabel",
  "secondaryCtaHref",
  "image",
  "video",
  "background",
] as const;

const ALLOWED_FIELDS = new Set<string>([...STRING_FIELDS, "items", "enabled", "order"]);

/** Defaults shown only when the Settings block has no items yet. */
export const LYP_DEFAULT_BENEFITS: LypItem[] = [
  { title: "Reach genuine buyers and tenants", body: "Your property is presented to our global buyer base and marketed across our channels — not listed and forgotten." },
  { title: "Right price, backed by data", body: "Every listing starts with a free market assessment so your asking price reflects real transaction evidence." },
  { title: "One end-to-end partner", body: "Photography, viewings, negotiation and paperwork are handled by one dedicated advisor." },
  { title: "Vetted enquiries only", body: "We pre-qualify every enquiry before it reaches you, so viewings are productive and private." },
];

export const LYP_DEFAULT_STEPS: LypItem[] = [
  { title: "1. Submit your property", body: "Share the basics below — address, type and whether you want to sell or rent. It takes two minutes." },
  { title: "2. Get a free valuation", body: "Your advisor confirms the market value, rental potential and the best channel for your property." },
  { title: "3. Professional presentation", body: "We organise photography, floor plans and a listing description that sells the property." },
  { title: "4. Viewings & offers", body: "We coordinate viewings and negotiate offers on your behalf — you approve everything." },
  { title: "5. Paperwork to handover", body: "Contracts, deposits and key handover are managed to completion, wherever you are." },
];

function toBase(row: typeof pageSections.$inferSelect): PageSectionBase {
  return {
    id: row.id,
    key: row.key,
    eyebrow: row.eyebrow,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    secondaryCtaLabel: row.secondaryCtaLabel,
    secondaryCtaHref: row.secondaryCtaHref,
    image: row.image,
    video: row.video,
    background: row.background,
    items: row.items ?? [],
    order: row.order,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
}

function lypItems(items: LypItem[]): SectionItem[] {
  return items.map((i) => ({ title: i.title ?? "", description: i.body ?? "" }));
}

/**
 * Virtual base sections for List Your Property. They mirror the Settings block
 * exactly, so Settings remains the source whenever an override is absent.
 */
export function buildLypSections(settings: SiteSettings): PageSectionBase[] {
  const lyp = settings.listYourProperty;
  const benefits = lyp.benefits?.length ? lyp.benefits : LYP_DEFAULT_BENEFITS;
  const steps = lyp.steps?.length ? lyp.steps : LYP_DEFAULT_STEPS;
  const common = {
    subtitle: null,
    ctaLabel: null,
    ctaHref: null,
    secondaryCtaLabel: null,
    secondaryCtaHref: null,
    video: null,
    background: null,
    enabled: true,
    virtual: true,
  };
  return [
    {
      ...common,
      id: 0,
      key: "hero",
      eyebrow: lyp.eyebrow || null,
      title: lyp.title || null,
      body: lyp.heroBody || null,
      image: lyp.heroImage || null,
      items: [],
      order: 0,
    },
    {
      ...common,
      id: 0,
      key: "benefits",
      eyebrow: null,
      title: "Why list with Mr.Home",
      body: null,
      image: null,
      items: lypItems(benefits),
      order: 1,
    },
    {
      ...common,
      id: 0,
      key: "steps",
      eyebrow: null,
      title: "How listing with us works",
      body: null,
      image: null,
      items: lypItems(steps),
      order: 2,
    },
    {
      ...common,
      id: 0,
      key: "form",
      eyebrow: null,
      title: lyp.formTitle || null,
      body: lyp.formIntro || null,
      image: null,
      ctaLabel: lyp.formCtaLabel || null,
      ctaHref: lyp.formCtaHref || null,
      items: [],
      order: 3,
    },
  ];
}

/** Base rows for a page: real Content rows, or the List Your Property settings. */
export async function getBaseSections(key: string): Promise<PageSectionBase[]> {
  await initDb();
  if (key === "list-your-property") {
    const { getSettings } = await import("./content");
    return buildLypSections(await getSettings());
  }
  const rows = await db.select().from(pageSections).where(eq(pageSections.page, key)).orderBy(asc(pageSections.order));
  return rows.map(toBase);
}

function asContent(value: unknown): SitePageContent {
  const v = (value ?? {}) as Partial<SitePageContent>;
  return {
    sections: v.sections && typeof v.sections === "object" ? (v.sections as Record<string, SitePageSectionPatch>) : {},
    seo: v.seo && typeof v.seo === "object" ? (v.seo as SitePageSeo) : {},
  };
}

/** Preview is only honoured for a signed-in user who can read pages. */
export async function isPagePreview(key: string): Promise<boolean> {
  try {
    const store = await cookies();
    if (store.get(PREVIEW_COOKIE)?.value !== key) return false;
    const user = await getCurrentUser();
    return !!user && userCan(user, "content.read");
  } catch {
    return false;
  }
}

/** The sparse override snapshot the public site should use for a built-in page. */
export async function getSitePageContent(key: string): Promise<SitePageContent> {
  const page = getBuiltinPage(key);
  if (!page) return EMPTY_CONTENT;
  await initDb();
  const rows = await db.select().from(sitePages).where(eq(sitePages.slug, key)).limit(1);
  const row = rows[0];
  if (!row) return EMPTY_CONTENT;
  const preview = await isPagePreview(key);
  return asContent(preview ? row.draft : row.published);
}

/** Published (or, for an authorised preview, draft) SEO overrides for a path. */
export async function getSitePageSeo(path: string): Promise<SitePageSeo | null> {
  const key = pageKeyFromPath(path);
  if (!key) return null;
  const content = await getSitePageContent(key);
  return Object.keys(content.seo ?? {}).length ? content.seo : null;
}

function has(obj: object, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Merge one sparse patch over base content; absent fields inherit, present blanks stay blank. */
export function mergeSection(base: PageSectionBase, patch: SitePageSectionPatch | undefined): PageSectionBase {
  if (!patch) return base;
  const next: PageSectionBase = { ...base, items: [...(base.items ?? [])] };
  for (const k of STRING_FIELDS) {
    if (has(patch, k)) (next as Record<string, unknown>)[k] = patch[k] ?? null;
  }
  if (has(patch, "items") && Array.isArray(patch.items)) next.items = patch.items;
  if (has(patch, "enabled") && typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (has(patch, "order") && typeof patch.order === "number" && Number.isFinite(patch.order)) next.order = patch.order;
  return next;
}

function findPatch(patches: Record<string, SitePageSectionPatch>, base: PageSectionBase) {
  return patches[base.key] ?? patches[String(base.id)];
}

/** Merge base sections with a sparse patch map (used by public pages and the editor). */
export function mergeSections(bases: PageSectionBase[], patches: Record<string, SitePageSectionPatch>): PageSectionBase[] {
  return bases.map((base) => mergeSection(base, findPatch(patches, base)));
}

/** Merge published (or previewed draft) overrides onto Content section rows. */
export async function applyPageOverrides<T extends typeof pageSections.$inferSelect>(page: string, rows: T[]): Promise<T[]> {
  const content = await getSitePageContent(page);
  const bases = rows.map(toBase);
  const merged = mergeSections(bases, content.sections ?? {});
  return merged
    .filter((row) => row.enabled)
    .sort((a, b) => a.order - b.order)
    .map((row) => {
      const original = rows.find((r) => r.id === row.id) ?? rows[0];
      return {
        ...original,
        ...row,
        items: row.items,
        updatedAt: original?.updatedAt ?? new Date(),
      } as T;
    });
}

/* ------------------------------------------------------------------ *
 * Sparse override maintenance
 * ------------------------------------------------------------------ */

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

/** Stable JSON comparison: object key order must not create a false difference. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const stableEqual = (a: unknown, b: unknown) => stable(a) === stable(b);

export type NormalizationReport = {
  rows: number;
  converted: number;
  prunedFields: number;
  preserved: { page: string; key: string; reason: string }[];
};

function prunePatch(base: PageSectionBase, patch: SitePageSectionPatch, report: NormalizationReport, page: string, key: string): SitePageSectionPatch {
  const out: SitePageSectionPatch = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!ALLOWED_FIELDS.has(field)) {
      // Unknown legacy fields are preserved rather than discarded.
      (out as Record<string, unknown>)[field] = value;
      report.preserved.push({ page, key, reason: `unknown field "${field}"` });
      continue;
    }
    if (field === "items") {
      if (!Array.isArray(value)) continue;
      if (!stableEqual(value, base.items ?? [])) out.items = value as SectionItem[];
      else report.prunedFields += 1;
      continue;
    }
    if (field === "enabled") {
      if (value !== base.enabled) out.enabled = Boolean(value);
      else report.prunedFields += 1;
      continue;
    }
    if (field === "order") {
      if (value !== base.order) out.order = Number(value);
      else report.prunedFields += 1;
      continue;
    }
    const fieldName = field as (typeof STRING_FIELDS)[number];
    const same = normalizeText(value) === normalizeText(base[fieldName]);
    if (!same) {
      // Preserve the exact value, including an intentionally cleared "".
      (out as Record<string, unknown>)[field] = value;
    } else {
      report.prunedFields += 1;
    }
  }
  return out;
}

/**
 * Prune a stored override against current base content:
 * - numeric legacy keys become stable section keys;
 * - fields equal to base become inherited (absent);
 * - differing fields, including explicit empties, are retained;
 * - patches with no matching base stay untouched and are reported.
 */
export function pruneContentWithBases(
  content: SitePageContent,
  bases: PageSectionBase[],
  report: NormalizationReport,
  pageKey = "",
): { content: SitePageContent; changed: boolean } {
  const outSections: Record<string, SitePageSectionPatch> = {};
  for (const [rawKey, patch] of Object.entries(content.sections ?? {})) {
    if (!patch || typeof patch !== "object") continue;
    const base = bases.find((b) => b.key === rawKey) ?? bases.find((b) => String(b.id) === rawKey);
    if (!base) {
      outSections[rawKey] = patch;
      report.preserved.push({ page: pageKey, key: rawKey, reason: "no matching base section" });
      continue;
    }
    const pruned = prunePatch(base, patch, report, pageKey, base.key);
    if (Object.keys(pruned).length === 0) continue;
    outSections[base.key] = { ...(outSections[base.key] ?? {}), ...pruned };
  }
  const seo: SitePageSeo = {};
  for (const [k, v] of Object.entries(content.seo ?? {})) {
    if (v == null || v === "" || v === false) continue;
    (seo as Record<string, unknown>)[k] = v;
  }
  const next = { sections: outSections, seo };
  return { content: next, changed: !stableEqual(next, content) };
}

/** Load base content and sanitize a draft/published snapshot before storage. */
export async function pruneContent(page: string, content: SitePageContent) {
  const bases = await getBaseSections(page);
  const report: NormalizationReport = { rows: 1, converted: 0, prunedFields: 0, preserved: [] };
  const result = pruneContentWithBases(content, bases, report, page);
  report.converted = report.prunedFields > 0 || report.preserved.length > 0 ? 1 : 0;
  return { content: result.content, changed: result.changed, report };
}

let normalizationPromise: Promise<NormalizationReport> | null = null;

async function runNormalization(): Promise<NormalizationReport> {
  await initDb();
  const rows = await db.select().from(sitePages);
  const report: NormalizationReport = { rows: rows.length, converted: 0, prunedFields: 0, preserved: [] };
  for (const row of rows) {
    const page = getBuiltinPage(row.slug);
    if (!page) continue;
    const bases = await getBaseSections(page.key);
    const draft = pruneContentWithBases(asContent(row.draft), bases, report, page.key);
    const published = pruneContentWithBases(asContent(row.published), bases, report, page.key);
    if (draft.changed || published.changed) {
      report.converted += 1;
      await db
        .update(sitePages)
        .set({ draft: draft.content, published: published.content, updatedAt: new Date() })
        .where(eq(sitePages.slug, page.key));
    }
  }
  for (const p of report.preserved) {
    console.warn(`[site-pages] preserved override ${p.page}/${p.key}: ${p.reason}`);
  }
  if (report.converted > 0) {
    console.info(`[site-pages] normalized ${report.converted} page(s); pruned ${report.prunedFields} inherited field(s)`);
  }
  return report;
}

/**
 * Repeatable, idempotent conversion of legacy full snapshots/numeric keys.
 * Runs once per process; safe to call before every admin read/write.
 */
export function normalizeSitePageOverrides(): Promise<NormalizationReport> {
  if (!normalizationPromise) {
    normalizationPromise = runNormalization().catch((e) => {
      normalizationPromise = null;
      throw e;
    });
  }
  return normalizationPromise;
}

/** Everything the admin editor needs for one page. */
export async function getBuiltinPageAdminData(key: string) {
  const page = getBuiltinPage(key);
  if (!page) return null;
  const normalization = await normalizeSitePageOverrides();
  await initDb();
  const [bases, rows, all] = await Promise.all([
    getBaseSections(key),
    db.select().from(sitePages).where(eq(sitePages.slug, key)).limit(1),
    db.select().from(sitePages),
  ]);
  const row = rows[0];
  const stored = row ? asContent(row.draft) : EMPTY_CONTENT;
  return {
    page,
    liveSections: bases.map((s) => ({ ...s, updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt ?? null })),
    draft: { sections: { ...stored.sections }, seo: stored.seo ?? {} } satisfies SitePageContent,
    publishedAt: row?.publishedAt?.toISOString() ?? null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    normalization,
    seoTitles: all.map((r) => ({ slug: r.slug, title: asContent(r.published).seo?.title ?? asContent(r.draft).seo?.title ?? null })),
    seoDescriptions: all.map((r) => ({ slug: r.slug, description: asContent(r.published).seo?.description ?? asContent(r.draft).seo?.description ?? null })),
  };
}

/** All built-in rows with light status, for the admin list. */
export async function listBuiltinPageStatus() {
  const normalization = await normalizeSitePageOverrides();
  await initDb();
  const rows = await db.select().from(sitePages);
  const byKey = new Map(rows.map((r) => [r.slug, r]));
  const all = await Promise.all(
    BUILTIN_PAGES.map(async (p) => {
      const bases = await getBaseSections(p.key);
      return { key: p.key, count: bases.length };
    }),
  );
  const counts = new Map(all.map((a) => [a.key, a.count]));
  return BUILTIN_PAGES.map((p) => {
    const row = byKey.get(p.key);
    return {
      ...p,
      sectionCount: counts.get(p.key) ?? 0,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      hasDraft: row ? !stableEqual(row.draft, row.published) : false,
      normalization,
    };
  });
}

/** Merged List Your Property sections for the public page. */
export async function getLypSections(settings: SiteSettings): Promise<PageSectionBase[]> {
  const content = await getSitePageContent("list-your-property");
  return mergeSections(buildLypSections(settings), content.sections);
}
