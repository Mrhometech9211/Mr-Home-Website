import type { NewsArticleWithMarket, ProjectWithMarket, PropertyWithMarket } from "./content";
import type { SiteSettings } from "./settings-types";
import { SITE_URL, absoluteSiteUrl } from "./site";

/**
 * Structured data is descriptive markup built only from records that already
 * exist in the CMS. Nothing here invents a price, size, availability or
 * verification claim; absent fields are omitted.
 */

export function organizationId() {
  return `${SITE_URL}/#organization`;
}

export function websiteId() {
  return `${SITE_URL}/#website`;
}

/** One site-wide business entity. Public pages reference it by @id. */
export function organizationJsonLd(s: SiteSettings, areaServed: string[] = []) {
  const socials = (s.socialLinks ?? []).map((l) => l.url).filter((u): u is string => !!u);
  const served = areaServed.map((a) => a.trim()).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": organizationId(),
    name: s.brandName,
    url: SITE_URL,
    ...(s.tagline ? { slogan: s.tagline } : {}),
    ...(s.logo ? { logo: absoluteSiteUrl(s.logo) } : {}),
    ...(s.email ? { email: s.email } : {}),
    ...(s.phone ? { telephone: s.phone } : {}),
    ...(s.address
      ? { address: { "@type": "PostalAddress", streetAddress: s.address } }
      : {}),
    ...(socials.length ? { sameAs: socials } : {}),
    ...(served.length ? { areaServed: served } : {}),
  };
}

/** Site-wide WebSite entity; page templates reference this by @id. */
export function websiteJsonLd(s: SiteSettings) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId(),
    url: SITE_URL,
    name: s.brandName,
    publisher: { "@id": organizationId() },
  };
}

/**
 * Page-level entity used by the homepage, Buy and Contact templates. The
 * WebPage types describe the existing page; they do not add claims or copy.
 */
export function webPageJsonLd(input: {
  path: string;
  name: string;
  description?: string | null;
  type?: "WebPage" | "CollectionPage" | "ContactPage";
  mainEntityId?: string;
}) {
  const url = absoluteSiteUrl(input.path);
  const description = input.description?.trim();
  return {
    "@context": "https://schema.org",
    "@type": input.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: input.name,
    ...(description ? { description } : {}),
    isPartOf: { "@id": websiteId() },
    about: { "@id": organizationId() },
    ...(input.mainEntityId ? { mainEntity: { "@id": input.mainEntityId } } : {}),
  };
}

/** Only statuses explicitly stored in the CMS map to a schema.org availability. */
function availabilityForProject(status: string | null | undefined, verifiedAt: Date | string | null | undefined) {
  // A status alone is not enough: only claim availability when a verification
  // check date is recorded for the listing.
  if (!verifiedAt) return undefined;
  if (status === "available" || status === "ready") return "https://schema.org/InStock";
  if (status === "sold-out") return "https://schema.org/SoldOut";
  return undefined;
}

function positiveNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function integerOrNull(value: unknown): number | null {
  if (value == null) return null;
  const m = String(value).match(/^\d+$/);
  return m ? Number(m[0]) : null;
}

function postalAddress(source: { address?: string | null; city?: string | null; country?: string | null; market?: { name: string } | null }) {
  const streetAddress = source.address?.trim() || undefined;
  const addressLocality = source.city?.trim() || undefined;
  const addressCountry = source.country?.trim() || source.market?.name?.trim() || undefined;
  if (!streetAddress && !addressLocality && !addressCountry) return undefined;
  return { "@type": "PostalAddress", streetAddress, addressLocality, addressCountry };
}

function floorSize(areaValue: unknown, unit: string | null | undefined, sqm?: unknown) {
  const sqmValue = positiveNumber(sqm);
  if (sqmValue) return { "@type": "QuantitativeValue", value: sqmValue, unitCode: "MTK" };
  const value = positiveNumber(areaValue);
  const code = unit === "sqft" ? "FTK" : unit === "sqmt" ? "MTK" : null;
  if (!value || !code) return undefined;
  return { "@type": "QuantitativeValue", value, unitCode: code };
}

export function projectJsonLd(p: ProjectWithMarket) {
  const url = absoluteSiteUrl(`/projects/${p.slug}`);
  const price = positiveNumber(p.price);
  const availability = availabilityForProject(p.status, p.verificationCheckedAt);
  const image = [p.coverImage, ...(p.gallery ?? [])].filter((i): i is string => !!i).map(absoluteSiteUrl);
  const address = postalAddress(p);
  const rooms = integerOrNull(p.bedrooms);
  const size = floorSize(p.areaValue, p.areaUnit);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${url}#webpage` },
    name: p.name,
    description: p.shortDescription || p.description || undefined,
    ...(image.length ? { image } : {}),
    ...(address ? { address } : {}),
    ...(p.latitude != null && p.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: p.latitude, longitude: p.longitude } }
      : {}),
    ...(price
      ? {
          offers: {
            "@type": "Offer",
            price,
            ...(p.currency ? { priceCurrency: p.currency } : {}),
            ...(availability ? { availability } : {}),
            url,
          },
        }
      : {}),
    ...(rooms ? { numberOfRooms: rooms } : {}),
    ...(size ? { floorSize: size } : {}),
    ...(p.updatedAt ? { dateModified: new Date(p.updatedAt).toISOString() } : {}),
    provider: { "@id": organizationId() },
  };
}

export function propertyJsonLd(p: PropertyWithMarket) {
  const url = absoluteSiteUrl(`/properties/${p.slug}`);
  const price = positiveNumber(p.price);
  const image = [p.coverImage, ...(p.gallery ?? [])].filter((i): i is string => !!i).map(absoluteSiteUrl);
  const address = postalAddress(p);
  const rooms = integerOrNull(p.bedrooms);
  const size = floorSize(null, null, p.areaSqm);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    name: p.title,
    description: p.shortDescription || p.description || undefined,
    ...(image.length ? { image } : {}),
    ...(address ? { address } : {}),
    ...(price
      ? {
          offers: {
            "@type": "Offer",
            price,
            ...(p.currency ? { priceCurrency: p.currency } : {}),
            url,
          },
        }
      : {}),
    ...(rooms ? { numberOfRooms: rooms } : {}),
    ...(size ? { floorSize: size } : {}),
    ...(p.updatedAt ? { dateModified: new Date(p.updatedAt).toISOString() } : {}),
    provider: { "@id": organizationId() },
  };
}

export function articleJsonLd(a: NewsArticleWithMarket) {
  const url = absoluteSiteUrl(`/news/${a.slug}`);
  const image = a.socialImage || a.coverImage;
  const citations = (a.sources ?? []).map((s) => s.url).filter((u): u is string => !!u);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: a.title,
    description: a.excerpt || a.seoDescription || undefined,
    ...(image ? { image: [absoluteSiteUrl(image)] } : {}),
    datePublished: (a.publishedAt || a.createdAt).toISOString(),
    dateModified: a.updatedAt.toISOString(),
    ...(a.author
      ? { author: { "@type": "Person", name: a.author, ...(a.authorRole ? { jobTitle: a.authorRole } : {}) } }
      : {}),
    publisher: { "@id": organizationId() },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(a.category ? { articleSection: a.category } : {}),
    ...(a.seoKeywords ? { keywords: a.seoKeywords } : {}),
    ...(citations.length ? { citation: citations } : {}),
  };
}
