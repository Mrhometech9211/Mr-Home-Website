import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, initDb } from "@/db";
import { cities, faqs, legalPages, markets, navigationItems, newsArticles, pageSections, pages as builderPages, projects, properties, seoEntries, siteSettings, testimonials, type BuilderPage, type City, type Market, type NewsArticle, type Project, type Property } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { mergeSettings, type SiteSettings } from "./settings-types";
import { AMENITY_GROUPS } from "./amenity-filters";

/** City option for public filters: the record name plus its market (null for free-text project/property cities). */
export type CityFacet = { name: string; marketId: number | null };

export const getSettings = cache(async (): Promise<SiteSettings> => {
  // Static pages (`/_not-found`, `/robots.txt`) are rendered during `next build`.
  // Never let a production build connect to, migrate, or seed the live database;
  // use defaults for build-time metadata instead. Runtime is unaffected.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return mergeSettings(null);
  }
  try {
    await initDb();
    await ensureSeeded();
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
    return mergeSettings(rows[0]?.data);
  } catch (e) {
    console.error("[settings]", e);
    return mergeSettings(null);
  }
});

export const getNavigation = cache(async (location: "header" | "footer") => {
  await ensureSeeded();
  return db.select().from(navigationItems).where(and(eq(navigationItems.location, location), eq(navigationItems.visible, true))).orderBy(asc(navigationItems.order));
});

export const getSections = cache(async (page: string) => {
  await ensureSeeded();
  return db.select().from(pageSections).where(and(eq(pageSections.page, page), eq(pageSections.enabled, true))).orderBy(asc(pageSections.order));
});

export const getPublishedMarkets = cache(async (): Promise<Market[]> => {
  await ensureSeeded();
  return db.select().from(markets).where(eq(markets.published, true)).orderBy(asc(markets.order), asc(markets.name));
});

export const getMarketBySlug = cache(async (slug: string, includeDrafts = false) => {
  await initDb(); // guarantee initialisation even when called concurrently
  const where = includeDrafts ? eq(markets.slug, slug) : and(eq(markets.slug, slug), eq(markets.published, true));
  const rows = await db.select().from(markets).where(where).limit(1);
  return rows[0] ?? null;
});

export const getCitiesByMarket = cache(async (marketId: number): Promise<City[]> => {
  await initDb();
  return db
    .select()
    .from(cities)
    .where(and(eq(cities.marketId, marketId), eq(cities.published, true)))
    .orderBy(desc(cities.featured), asc(cities.order), asc(cities.name));
});

export const getCityBySlug = cache(async (marketId: number, slug: string): Promise<City | null> => {
  await initDb();
  const rows = await db
    .select()
    .from(cities)
    .where(and(eq(cities.marketId, marketId), eq(cities.slug, slug), eq(cities.published, true)))
    .limit(1);
  return rows[0] ?? null;
});

export type ProjectWithMarket = Project & { market: Pick<Market, "id" | "name" | "slug" | "flag" | "countryCode"> | null };

const projectSelect = {
  project: projects,
  market: { id: markets.id, name: markets.name, slug: markets.slug, flag: markets.flag, countryCode: markets.countryCode },
};

function mapRows(rows: { project: Project; market: { id: number; name: string; slug: string; flag: string; countryCode: string } | null }[]): ProjectWithMarket[] {
  return rows.map((r) => ({ ...r.project, market: r.market?.id ? r.market : null }));
}

export type ProjectFilters = { market?: string; type?: string; status?: string; q?: string; city?: string; featured?: boolean; limit?: number; excludeId?: number; purpose?: "sale" | "rent"; minPrice?: number; maxPrice?: number };

export const getPublishedMarketCities = cache(async (): Promise<Record<number, string[]>> => {
  await initDb();
  const rows = await db
    .select({ marketId: cities.marketId, name: cities.name })
    .from(cities)
    .where(eq(cities.published, true))
    .orderBy(desc(cities.featured), asc(cities.order), asc(cities.name));
  const map: Record<number, string[]> = {};
  for (const r of rows) if (r.marketId != null) (map[r.marketId] ??= []).push(r.name);
  return map;
});

/** Published city pages under a published market — used by the sitemap. */
export type CityRoute = { marketSlug: string; citySlug: string; updatedAt: Date };

export const getPublishedCityRoutes = cache(async (): Promise<CityRoute[]> => {
  await initDb();
  const rows = await db
    .select({ marketSlug: markets.slug, citySlug: cities.slug, updatedAt: cities.updatedAt })
    .from(cities)
    .innerJoin(markets, eq(cities.marketId, markets.id))
    .where(and(eq(cities.published, true), eq(markets.published, true)));
  return rows;
});

/**
 * Every city a visitor can filter by — Cities created in the admin, plus city
 * names already used by published projects/listings (so a newly added city
 * shows up in the public filters immediately).
 */
export const getCityFacets = cache(async (): Promise<CityFacet[]> => {
  await ensureSeeded();
  const [cityRows, projectRows, propertyRows] = await Promise.all([
    db.select({ name: cities.name, marketId: cities.marketId }).from(cities).where(eq(cities.published, true)),
    db
      .selectDistinct({ name: projects.city, marketId: projects.marketId })
      .from(projects)
      .where(and(eq(projects.published, true), eq(projects.archived, false))),
    db
      .selectDistinct({ name: properties.city, marketId: properties.marketId })
      .from(properties)
      .where(and(eq(properties.published, true), eq(properties.archived, false))),
  ]);
  const seen = new Map<string, CityFacet>();
  const add = (name: string | null, marketId: number | null) => {
    const clean = (name ?? "").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: clean, marketId: marketId ?? null });
  };
  for (const r of cityRows) add(r.name, r.marketId);
  for (const r of projectRows) add(r.name, r.marketId);
  for (const r of propertyRows) add(r.name, r.marketId);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
});

export const getPublishedProjects = cache(async (filters: ProjectFilters = {}): Promise<ProjectWithMarket[]> => {
  await ensureSeeded();
  const conds: SQL[] = [eq(projects.published, true), eq(projects.archived, false)];
  if (filters.market) conds.push(eq(markets.slug, filters.market));
  if (filters.city) conds.push(eq(projects.city, filters.city));
  if (filters.type) conds.push(eq(projects.propertyType, filters.type));
  if (filters.status) conds.push(eq(projects.status, filters.status));
  if (filters.featured) conds.push(eq(projects.featured, true));
  if (filters.purpose) conds.push(eq(projects.purpose, filters.purpose));
  if (filters.minPrice != null) conds.push(sql`${projects.price}::numeric >= ${filters.minPrice}`);
  if (filters.maxPrice != null) conds.push(sql`${projects.price}::numeric <= ${filters.maxPrice}`);
  if (filters.excludeId) conds.push(sql`${projects.id} <> ${filters.excludeId}`);
  if (filters.q) {
    const q = `%${filters.q}%`;
    conds.push(or(ilike(projects.name, q), ilike(projects.city, q), ilike(projects.developer, q), ilike(markets.name, q))!);
  }
  const query = db.select(projectSelect).from(projects).leftJoin(markets, eq(projects.marketId, markets.id)).where(and(...conds)).orderBy(desc(projects.featured), asc(projects.order), desc(projects.createdAt));
  const rows = filters.limit ? await query.limit(filters.limit) : await query;
  return mapRows(rows);
});

export const getProjectBySlug = cache(async (slug: string, includeDrafts = false): Promise<ProjectWithMarket | null> => {
  await initDb();
  const conds: SQL[] = [eq(projects.slug, slug)];
  if (!includeDrafts) conds.push(eq(projects.published, true), eq(projects.archived, false));
  const rows = await db.select(projectSelect).from(projects).leftJoin(markets, eq(projects.marketId, markets.id)).where(and(...conds)).limit(1);
  return mapRows(rows)[0] ?? null;
});

export const getProjectCountsByMarket = cache(async () => {
  await initDb();
  const rows = await db
    .select({ marketId: projects.marketId, count: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(eq(projects.published, true), eq(projects.archived, false)))
    .groupBy(projects.marketId);
  const map: Record<number, number> = {};
  for (const r of rows) if (r.marketId != null) map[r.marketId] = r.count;
  return map;
});

export const getPropertyTypes = cache(async () => {
  await initDb();
  const rows = await db.selectDistinct({ t: projects.propertyType }).from(projects).where(and(eq(projects.published, true), eq(projects.archived, false)));
  return rows.map((r) => r.t).filter((t): t is string => !!t).sort();
});

export const getLegalPage = cache(async (slug: string) => {
  await initDb();
  await ensureSeeded();
  const rows = await db.select().from(legalPages).where(and(eq(legalPages.slug, slug), eq(legalPages.published, true))).limit(1);
  return rows[0] ?? null;
});

export const getPublishedLegalPages = cache(async () => {
  await initDb();
  await ensureSeeded();
  return db.select({ slug: legalPages.slug, title: legalPages.title, updatedAt: legalPages.updatedAt }).from(legalPages).where(eq(legalPages.published, true));
});

export const getFaqs = cache(async () => {
  await initDb(); // no-op after first call
  return db.select().from(faqs).where(eq(faqs.published, true)).orderBy(asc(faqs.order));
});
export const getTestimonials = cache(async () => {
  await initDb(); // no-op after first call
  return db.select().from(testimonials).where(eq(testimonials.published, true)).orderBy(asc(testimonials.order));
});

export const getSeoEntry = cache(async (path: string) => {
  await initDb(); // no-op after first call
  const rows = await db.select().from(seoEntries).where(eq(seoEntries.path, path)).limit(1);
  return rows[0] ?? null;
});

/* ------------------------------------------------------------------
 *  Phase 2 — Buy / Rent property marketplace (properties table).
 *  ------------------------------------------------------------------ */

export type PropertyWithMarket = Property & { market: Pick<Market, "id" | "name" | "slug" | "flag" | "countryCode"> | null };

const propertySelect = {
  property: properties,
  market: { id: markets.id, name: markets.name, slug: markets.slug, flag: markets.flag, countryCode: markets.countryCode },
};

function mapPropertyRows(rows: { property: Property; market: { id: number; name: string; slug: string; flag: string; countryCode: string } | null }[]): PropertyWithMarket[] {
  return rows.map((r) => ({ ...r.property, market: r.market?.id ? r.market : null }));
}

export type PropertyQuery = {
  purpose?: "sale" | "rent";
  q?: string;
  market?: string; // market slug
  city?: string;
  type?: string; // property type
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  minArea?: number;
  maxArea?: number;
  furnished?: string; // unfurnished | semi | furnished
  currency?: string;
  period?: string; // month | year (rent only)
  /** Provident-style amenity group labels — matches any amenity label containing a group key. */
  amenities?: string[];
  /** Provident-style reference-number search: matches id (numeric), slug or title. */
  ref?: string;
  maxBedrooms?: number;
  sort?: string; // price-asc | price-desc | newest | area-desc
  featured?: boolean;
  excludeId?: number;
  page?: number;
  pageSize?: number;
};

function numericCond(col: PgColumn, min?: number, max?: number): SQL[] {
  const conds: SQL[] = [];
  if (min != null) conds.push(sql`${col} >= ${min}`);
  if (max != null) conds.push(sql`${col} <= ${max}`);
  return conds;
}

export const getPublishedProperties = cache(
  async (query: PropertyQuery = {}): Promise<{ items: PropertyWithMarket[]; total: number }> => {
    await ensureSeeded();
    const conds: SQL[] = [eq(properties.published, true), eq(properties.archived, false)];
    if (query.purpose) conds.push(eq(properties.purpose, query.purpose));
    if (query.market) conds.push(eq(markets.slug, query.market));
    if (query.city) conds.push(eq(properties.city, query.city));
    if (query.type) conds.push(eq(properties.propertyType, query.type));
    if (query.furnished) conds.push(eq(properties.furnished, query.furnished));
    if (query.currency) conds.push(eq(properties.currency, query.currency));
    if (query.period) conds.push(eq(properties.rentPeriod, query.period));
    if (query.featured) conds.push(eq(properties.featured, true));
    if (query.excludeId) conds.push(sql`${properties.id} <> ${query.excludeId}`);
    if (query.bedrooms != null) conds.push(sql`${properties.bedrooms} >= ${query.bedrooms}`);
    if (query.bathrooms != null) conds.push(sql`${properties.bathrooms} >= ${query.bathrooms}`);
    if (query.maxBedrooms != null && query.maxBedrooms > 0) conds.push(sql`${properties.bedrooms} <= ${query.maxBedrooms}`);
    // Each selected amenity group matches if ANY of its keys appears in the
    // listing's amenity labels (case-insensitive). Selected groups = AND.
    for (const group of query.amenities ?? []) {
      const keys = AMENITY_GROUPS[group];
      if (!keys || keys.length === 0) continue;
      conds.push(or(...keys.map((k) => sql`${properties.amenities}::text ilike ${`%${k.toLowerCase()}%`}`))!);
    }
    if (query.ref && query.ref.trim()) {
      const ref = query.ref.trim();
      // Numeric reference = an exact listing id; text = slug/text match.
      conds.push(
        /^\d+$/.test(ref)
          ? eq(properties.id, Number(ref))
          : or(ilike(properties.slug, `%${ref.toLowerCase()}%`), ilike(properties.title, `%${ref}%`))!,
      );
    }
    conds.push(...numericCond(properties.price, query.minPrice, query.maxPrice));
    conds.push(...numericCond(properties.areaSqm, query.minArea, query.maxArea));
    if (query.q) {
      const q = `%${query.q}%`;
      conds.push(or(ilike(properties.title, q), ilike(properties.city, q), ilike(properties.country, q), ilike(properties.shortDescription, q), ilike(markets.name, q))!);
    }
    const order =
      query.sort === "price-asc"
        ? [asc(sql`${properties.price}::numeric`)]
        : query.sort === "price-desc"
          ? [desc(sql`${properties.price}::numeric`)]
          : query.sort === "area-desc"
            ? [desc(sql`${properties.areaSqm}::numeric`)]
            : [desc(properties.featured), desc(properties.createdAt)];
    const where = and(...conds);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(properties).leftJoin(markets, eq(properties.marketId, markets.id)).where(where);
    const pageSize = Math.min(Math.max(query.pageSize ?? 12, 1), 48);
    const page = Math.max(1, query.page ?? 1);
    const rows = await db.select(propertySelect).from(properties).leftJoin(markets, eq(properties.marketId, markets.id)).where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize);
    return { items: mapPropertyRows(rows), total: count };
  },
);

export const getPropertyBySlug = cache(async (slug: string, includeDrafts = false): Promise<PropertyWithMarket | null> => {
  await initDb();
  const conds: SQL[] = [eq(properties.slug, slug)];
  if (!includeDrafts) conds.push(eq(properties.published, true), eq(properties.archived, false));
  const rows = await db.select(propertySelect).from(properties).leftJoin(markets, eq(properties.marketId, markets.id)).where(and(...conds)).limit(1);
  return mapPropertyRows(rows)[0] ?? null;
});

/** Published, non-archived listing URLs — used by the sitemap without the marketplace page cap. */
export const getPublishedPropertyRoutes = cache(async (): Promise<{ slug: string; updatedAt: Date }[]> => {
  await initDb();
  return db
    .select({ slug: properties.slug, updatedAt: properties.updatedAt })
    .from(properties)
    .where(and(eq(properties.published, true), eq(properties.archived, false)));
});

export const getPropertyCountsByPurpose = cache(async () => {
  await initDb();
  const rows = await db
    .select({ purpose: properties.purpose, count: sql<number>`count(*)::int` })
    .from(properties)
    .where(and(eq(properties.published, true), eq(properties.archived, false)))
    .groupBy(properties.purpose);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.purpose] = r.count;
  return { sale: counts["sale"] ?? 0, rent: counts["rent"] ?? 0 };
});

/** Distinct filter values for the marketplace facets. */
export const getPropertyFacets = cache(async (purpose?: "sale" | "rent") => {
  await initDb();
  const conds: SQL[] = [eq(properties.published, true), eq(properties.archived, false)];
  if (purpose) conds.push(eq(properties.purpose, purpose));
  const [typeRows, currencyRows] = await Promise.all([
    db.selectDistinct({ t: properties.propertyType }).from(properties).where(and(...conds)),
    db.selectDistinct({ c: properties.currency }).from(properties).where(and(...conds)),
  ]);
  return {
    types: typeRows.map((r) => r.t).filter((t): t is string => !!t).sort(),
    currencies: currencyRows.map((r) => r.c).filter((c): c is string => !!c).sort(),
  };
});

/* Phase 5 — News CMS ------------------------------------------------------ */

export type NewsArticleWithMarket = NewsArticle & { marketName: string | null; marketSlug: string | null; marketFlag: string | null };

const newsSelect = {
  id: newsArticles.id,
  slug: newsArticles.slug,
  title: newsArticles.title,
  excerpt: newsArticles.excerpt,
  body: newsArticles.body,
  category: newsArticles.category,
  marketId: newsArticles.marketId,
  country: newsArticles.country,
  author: newsArticles.author,
  authorRole: newsArticles.authorRole,
  coverImage: newsArticles.coverImage,
  coverImageAlt: newsArticles.coverImageAlt,
  videoUrl: newsArticles.videoUrl,
  featured: newsArticles.featured,
  published: newsArticles.published,
  archived: newsArticles.archived,
  publishedAt: newsArticles.publishedAt,
  seoTitle: newsArticles.seoTitle,
  seoDescription: newsArticles.seoDescription,
  seoKeywords: newsArticles.seoKeywords,
  createdAt: newsArticles.createdAt,
  updatedAt: newsArticles.updatedAt,
  marketName: markets.name,
  marketSlug: markets.slug,
  marketFlag: markets.flag,
};

function mapNewsRows(rows: (NewsArticle & { marketName: string | null; marketSlug: string | null; marketFlag: string | null })[]): NewsArticleWithMarket[] {
  return rows.map((r) => ({ ...r }));
}

/** Published, non-archived articles for the public /news listing. */
export const getPublishedNews = cache(async (filters?: { market?: string; category?: string }): Promise<NewsArticleWithMarket[]> => {
  await initDb();
  await ensureSeeded();
  const conds: SQL[] = [eq(newsArticles.published, true), eq(newsArticles.archived, false)];
  if (filters?.market) conds.push(eq(markets.slug, filters.market));
  if (filters?.category) conds.push(eq(newsArticles.category, filters.category));
  const rows = await db
    .select(newsSelect)
    .from(newsArticles)
    .leftJoin(markets, eq(newsArticles.marketId, markets.id))
    .where(and(...conds))
    .orderBy(desc(newsArticles.featured), desc(sql`coalesce(${newsArticles.publishedAt}, ${newsArticles.createdAt})`))
    .limit(120);
  return mapNewsRows(rows as never);
});

/** Distinct categories of published articles, for listing filters and admin hints. */
export const getNewsCategories = cache(async (): Promise<string[]> => {
  await initDb();
  const rows = await db
    .selectDistinct({ c: newsArticles.category })
    .from(newsArticles)
    .where(and(eq(newsArticles.published, true), eq(newsArticles.archived, false)))
    .orderBy(asc(newsArticles.category));
  return rows.map((r) => r.c).filter((c): c is string => !!c);
});

/* Phase 7 — Custom Page Builder ---------------------------------------- */

/** Published, nav-visible builder pages merged into the site header. */
export const getBuilderNavPages = cache(async () => {
  await initDb();
  return db
    .select({ id: builderPages.id, slug: builderPages.slug, title: builderPages.title, navLabel: builderPages.navLabel, navOrder: builderPages.navOrder, parentId: builderPages.parentId })
    .from(builderPages)
    .where(and(eq(builderPages.status, "published"), eq(builderPages.navVisible, true)))
    .orderBy(asc(builderPages.navOrder));
});

/** A published builder page for the public /{slug} route. Drafts never resolve here. */
export const getPublishedBuilderPage = cache(async (slug: string): Promise<BuilderPage | null> => {
  await initDb();
  const rows = await db
    .select()
    .from(builderPages)
    .where(and(eq(builderPages.slug, slug), eq(builderPages.status, "published")))
    .limit(1);
  return rows[0] ?? null;
});

/** All published builder pages (sitemap). */
export const getPublishedBuilderPages = cache(async (): Promise<BuilderPage[]> => {
  await initDb();
  return db.select().from(builderPages).where(eq(builderPages.status, "published"));
});

/* Phase 8 — Brochure downloads ----------------------------------------- */

/** Whether an active brochure exists for a project (metadata only, no bytes). */
export const getActiveBrochureForProject = cache(async (projectId: number) => {
  await initDb();
  const { brochures } = await import("@/db/schema");
  // Ready rows only — an in-flight direct-to-R2 upload must not flip the public
  // "Download Brochure" button on until the object is actually verified.
  const rows = await db
    .select({ id: brochures.id, allowDownload: brochures.allowDownload })
    .from(brochures)
    .where(and(eq(brochures.projectId, projectId), eq(brochures.status, "ready")))
    .orderBy(desc(brochures.createdAt))
    .limit(1);
  return rows[0] ?? null;
});

export const getNewsArticleBySlug = cache(async (slug: string): Promise<NewsArticleWithMarket | null> => {
  await initDb();
  const rows = await db
    .select(newsSelect)
    .from(newsArticles)
    .leftJoin(markets, eq(newsArticles.marketId, markets.id))
    .where(and(eq(newsArticles.slug, slug), eq(newsArticles.published, true), eq(newsArticles.archived, false)))
    .limit(1);
  return (mapNewsRows(rows as never))[0] ?? null;
});
