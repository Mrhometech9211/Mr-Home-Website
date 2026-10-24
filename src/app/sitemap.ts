import type { MetadataRoute } from "next";
import {
  getPublishedBuilderPages,
  getPublishedCityRoutes,
  getPublishedLegalPages,
  getPublishedMarkets,
  getPublishedNews,
  getPublishedProjects,
  getPublishedPropertyRoutes,
} from "@/lib/content";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const url = (path: string) => `${SITE_URL}${path}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, markets, legal, news, builderPages, properties, cities] = await Promise.all([
    getPublishedProjects(),
    getPublishedMarkets(),
    getPublishedLegalPages(),
    getPublishedNews(),
    getPublishedBuilderPages(),
    getPublishedPropertyRoutes(),
    getPublishedCityRoutes(),
  ]);
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: url("/buy"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: url("/rent"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: url("/projects"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: url("/markets"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: url("/news"), lastModified: news[0]?.updatedAt ?? now, changeFrequency: "daily", priority: 0.7 },
    { url: url("/why-mr-home"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: url("/list-your-property"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: url("/contact"), lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    ...projects.map((p) => ({
      url: url(`/projects/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...properties.map((p) => ({
      url: url(`/properties/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...markets.map((m) => ({
      url: url(`/markets/${m.slug}`),
      lastModified: m.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...cities.map((c) => ({
      url: url(`/markets/${c.marketSlug}/${c.citySlug}`),
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...news.map((n) => ({
      url: url(`/news/${n.slug}`),
      lastModified: n.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...legal.map((l) => ({
      url: url(`/${l.slug}`),
      lastModified: l.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  // Builder pages share the /[slug] route with legal pages and the static
  // pages above. Skip drafts, no-index pages and any slug that would duplicate
  // an existing top-level URL (e.g. a page named "buy").
  const reserved = new Set([
    "",
    "buy",
    "rent",
    "projects",
    "markets",
    "news",
    "why-mr-home",
    "list-your-property",
    "contact",
    ...legal.map((l) => l.slug),
  ]);
  for (const page of builderPages) {
    if (!page.slug || page.noIndex || reserved.has(page.slug)) continue;
    entries.push({
      url: url(`/${page.slug}`),
      lastModified: page.updatedAt,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  // Defensive de-duplicate: one <loc> per URL even if two content sources collide.
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
