import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { ApiError } from "./api";
import { getCityById, getMarketById, getProjectById, getPublishedMarkets, getSections, getSettings, isRentPublic } from "./content";
import { resolvePageSeo } from "./seo";
import { getBuiltinPage } from "./site-pages";
import {
  organizationId,
  organizationJsonLd,
  projectJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "./structured-data";

export type StructuredDataPreview = {
  title: string;
  path: string | null;
  jsonLd: Record<string, unknown>;
  /** True when the record is not public yet — the preview still shows what would be emitted. */
  draft: boolean;
  note?: string;
};

/** One valid JSON-LD document, combining separate page entities under @graph. */
function combine(nodes: Record<string, unknown>[]): Record<string, unknown> {
  if (nodes.length === 1) return nodes[0];
  const graph = nodes.map((node) => {
    const { "@context": _context, ...rest } = node;
    void _context;
    return rest;
  });
  return { "@context": "https://schema.org", "@graph": graph };
}

function pageType(key: string): "WebPage" | "CollectionPage" | "ContactPage" {
  if (key === "contact") return "ContactPage";
  if (["buy", "projects", "markets", "news"].includes(key)) return "CollectionPage";
  return "WebPage";
}

export async function buildSitePreview(): Promise<StructuredDataPreview> {
  const [settings, markets] = await Promise.all([getSettings(), getPublishedMarkets()]);
  return {
    title: `${settings.brandName} — Organization & WebSite`,
    path: null,
    jsonLd: combine([
      organizationJsonLd(settings, markets.map((m) => m.name)),
      websiteJsonLd(settings),
    ]),
    draft: false,
    note: "Site-wide entities emitted by the public layout. Business details come from Settings.",
  };
}

export async function buildProjectPreview(id: number): Promise<StructuredDataPreview> {
  const project = await getProjectById(id);
  if (!project) throw new ApiError(404, "Project not found");
  const seo = await resolvePageSeo(`/projects/${project.slug}`, {
    title: project.seoTitle || `${project.name} — ${project.city}, ${project.market?.name ?? project.country}`,
    description: project.seoDescription || project.shortDescription || project.description?.slice(0, 160),
    image: project.coverImage,
  });
  const path = `/projects/${project.slug}`;
  const pageLd = webPageJsonLd({
    path,
    canonical: seo.canonical,
    name: seo.title,
    description: seo.description,
    mainEntityId: `${seo.canonical}#listing`,
    dateModified: project.updatedAt ? new Date(project.updatedAt).toISOString() : null,
  });
  const listingLd = projectJsonLd(project, { canonical: seo.canonical, description: seo.description });
  return {
    title: `${project.name} — Project JSON-LD`,
    path,
    jsonLd: combine([pageLd, listingLd]),
    draft: !project.published || project.archived,
    note: "Offer price appears only when a price check date (or a confirming price verification check) is stored. Availability appears only with a verification date.",
  };
}

export async function buildMarketPreview(id: number): Promise<StructuredDataPreview> {
  const market = await getMarketById(id);
  if (!market) throw new ApiError(404, "Market not found");
  const path = `/markets/${market.slug}`;
  const seo = await resolvePageSeo(path, {
    title: market.seoTitle || `Property for Sale & Investment in ${market.name}`,
    description: market.seoDescription || market.tagline || market.description,
    image: market.coverImage,
  });
  const placeId = `${seo.canonical}#place`;
  const placeLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": placeId,
    url: seo.canonical,
    name: market.name,
    description: seo.description,
    geo: { "@type": "GeoCoordinates", latitude: market.latitude, longitude: market.longitude },
    ...(seo.imageUrl ? { image: seo.imageUrl } : {}),
  };
  const pageLd = webPageJsonLd({
    path,
    canonical: seo.canonical,
    type: "CollectionPage",
    name: seo.title,
    description: seo.description,
    mainEntityId: placeId,
  });
  return {
    title: `${market.name} — Market JSON-LD`,
    path,
    jsonLd: combine([pageLd, placeLd]),
    draft: !market.published,
    note: "Market title, description, canonical and image come from the saved market record and its SEO fields.",
  };
}

export async function buildCityPreview(id: number): Promise<StructuredDataPreview> {
  const city = await getCityById(id);
  if (!city) throw new ApiError(404, "City not found");
  const market = city.marketId ? await getMarketById(city.marketId) : null;
  if (!market) throw new ApiError(404, "City market not found");
  const path = `/markets/${market.slug}/${city.slug}`;
  const seo = await resolvePageSeo(path, {
    title: city.seoTitle || `Property for Sale in ${city.name}, ${market.name}`,
    description: city.seoDescription || city.tagline || city.description || undefined,
    image: city.coverImage || market.coverImage,
  });
  const cityId = `${seo.canonical}#city`;
  const cityLd = {
    "@context": "https://schema.org",
    "@type": "City",
    "@id": cityId,
    url: seo.canonical,
    name: city.name,
    description: seo.description,
    containedInPlace: { "@type": "Country", name: market.name },
    geo: city.latitude != null && city.longitude != null ? { "@type": "GeoCoordinates", latitude: city.latitude, longitude: city.longitude } : undefined,
    ...(seo.imageUrl ? { image: seo.imageUrl } : {}),
  };
  const pageLd = webPageJsonLd({
    path,
    canonical: seo.canonical,
    type: "CollectionPage",
    name: seo.title,
    description: seo.description,
    mainEntityId: cityId,
  });
  return {
    title: `${city.name} — City JSON-LD`,
    path,
    jsonLd: combine([pageLd, cityLd]),
    draft: !city.published || !market.published,
    note: "City title, description, canonical and image come from the saved city record and its SEO fields.",
  };
}

export async function buildBuiltinPagePreview(key: string): Promise<StructuredDataPreview> {
  const page = getBuiltinPage(key);
  if (!page) throw new ApiError(404, "Built-in page not found");
  const [settings, sections, rentPublic] = await Promise.all([getSettings(), getSections(key), isRentPublic()]);
  const hero = sections.find((section) => section.key === "hero");
  let fallback = { title: page.title, description: hero?.body, image: hero?.image };
  if (key === "home") fallback = { title: settings.seoDefaultTitle, description: settings.seoDefaultDescription, image: settings.seoOgImage };
  if (key === "contact") fallback = { title: "Contact — Let’s Find the Right Property for You", description: hero?.body, image: hero?.image };
  if (key === "buy") fallback = { title: "Properties for Sale Across The Globe", description: hero?.body || "Curated apartments, villas and townhouses across our global markets.", image: hero?.image };
  if (key === "rent") fallback = { title: "Homes for Rent Across The Globe", description: hero?.body, image: hero?.image };
  if (key === "projects") fallback = { title: "Premium Projects Across The Globe", description: hero?.body, image: hero?.image };
  if (key === "markets") fallback = { title: "Global Presence, Local Expertise", description: hero?.body, image: hero?.image };
  if (key === "news") fallback = { title: "News & Market Insights", description: "Market reports, investment guides and updates from MR.HOME across 10 global real estate markets.", image: hero?.image };
  if (key === "list-your-property") fallback = { title: settings.listYourProperty.title || "List Your Property with Mr.Home", description: hero?.body, image: hero?.image };
  if (key === "why-mr-home") fallback = { title: hero?.title || "Why Mr.Home", description: hero?.body, image: hero?.image };
  const seo = await resolvePageSeo(page.path, fallback);
  const pageLd = webPageJsonLd({
    path: page.path,
    canonical: seo.canonical,
    type: pageType(key),
    name: seo.title,
    description: seo.description,
    ...(key === "contact" ? { mainEntityId: organizationId() } : {}),
  });
  return {
    title: `${page.title} — Page JSON-LD`,
    path: page.path,
    jsonLd: pageLd,
    draft: false,
    note:
      key === "rent" && !rentPublic
        ? "Rent is currently disabled publicly because no rental inventory or confirmed rental service exists. This page-level node is shown for review only."
        : "Page-level node. The public page may also emit page-specific nodes (for example FAQ).",
  };
}

export async function buildCustomPagePreview(id: number): Promise<StructuredDataPreview> {
  const [page] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!page) throw new ApiError(404, "Page not found");
  const path = `/${page.slug}`;
  const seo = await resolvePageSeo(path, {
    title: page.seoTitle || page.title,
    description: page.seoDescription,
    image: page.ogImage,
    noIndex: page.noIndex,
  });
  return {
    title: `${page.title} — Page JSON-LD`,
    path,
    jsonLd: webPageJsonLd({
      path,
      canonical: seo.canonical,
      name: seo.title,
      description: seo.description,
      dateModified: page.updatedAt ? new Date(page.updatedAt).toISOString() : null,
    }),
    draft: page.status !== "published",
    note: "Page title, description, canonical and image come from this page's saved fields.",
  };
}
