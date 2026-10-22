import type { MetadataRoute } from "next";
import { getPublishedLegalPages, getPublishedMarkets, getPublishedProjects, getSettings } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await getSettings();
  const base = "https://www.mrhomerealestate.com";
  const [projects, markets, legal] = await Promise.all([getPublishedProjects(), getPublishedMarkets(), getPublishedLegalPages()]);
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/why-mr-home`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/projects`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/markets`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.6 },
    ...projects.map((p) => ({ url: `${base}/projects/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...markets.map((m) => ({ url: `${base}/markets/${m.slug}`, lastModified: m.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...legal.map((l) => ({ url: `${base}/${l.slug}`, lastModified: l.updatedAt, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
