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
 * Page-level entity used by public templates. `canonical` is resolved from the
 * same SEO override used for the <link rel="canonical"> and Open Graph URL, so
 * title/description/canonical edits flow through to JSON-LD automatically.
 */
export function webPageJsonLd(input: {
  path: string;
  canonical?: string | null;
  name: string;
  description?: string | null;
  type?: "WebPage" | "CollectionPage" | "ContactPage";
  mainEntityId?: string;
  dateModified?: string | null;
}) {
  const url = input.canonical ? absoluteSiteUrl(input.canonical) : absoluteSiteUrl(input.path);
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
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
  };
}

/** True only for a stored date that parses to a real instant. */
function isValidVerificationDate(value: Date | string | null | undefined): boolean {
  if (value == null || value === "") return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Availability is a manual claim: the admin must tick "In Stock confirmed" AND
 * the project must carry a valid Verification Date. Neither on its own is enough,
 * and a status value never invents availability.
 */
function availabilityForProject(
  confirmedInStock: boolean | null | undefined,
  verifiedAt: Date | string | null | undefined,
) {
  if (confirmedInStock !== true) return undefined;
  if (!isValidVerificationDate(verifiedAt)) return undefined;
  return "https://schema.org/InStock";
}

/**
 * A project price is public only when an admin recorded a price check date, or
 * a verification check explicitly confirms pricing with its own check date.
 * The price value itself is never inferred from ROI, handover or status.
 */
function confirmedProjectPrice(p: ProjectWithMarket): number | null {
  const price = positiveNumber(p.price);
  if (!price) return null;
  const checkedCheck = (p.verificationChecks ?? []).some(
    (check) =>
      /price|pricing/i.test(check.check) &&
      /^(confirmed|verified|passed|complete|ok)$/i.test(check.status.trim()) &&
      Boolean(check.checkedAt),
  );
  return p.priceCheckedAt || checkedCheck ? price : null;
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

export function projectJsonLd(
  p: ProjectWithMarket,
  options: { canonical?: string | null; description?: string | null } = {},
) {
  const url = options.canonical ? absoluteSiteUrl(options.canonical) : absoluteSiteUrl(`/projects/${p.slug}`);
  const price = confirmedProjectPrice(p);
  const availability = availabilityForProject(p.inStockConfirmed, p.verificationCheckedAt);
  const image = [p.coverImage, ...(p.gallery ?? [])].filter((i): i is string => !!i).map(absoluteSiteUrl);
  const address = postalAddress(p);
  const bedrooms = integerOrNull(p.bedrooms);
  const bathrooms = integerOrNull(p.bathrooms);
  const size = floorSize(p.areaValue, p.areaUnit);
  const geo = p.latitude != null && p.longitude != null
    ? { "@type": "GeoCoordinates", latitude: p.latitude, longitude: p.longitude }
    : undefined;
  const property = {
    "@type": "Accommodation",
    "@id": `${url}#property`,
    name: p.name,
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(bedrooms ? { numberOfBedrooms: bedrooms } : {}),
    ...(bathrooms ? { numberOfBathroomsTotal: bathrooms } : {}),
    ...(size ? { floorSize: size } : {}),
  };
  const hasPropertyFacts = Boolean(address || geo || bedrooms || bathrooms || size);
  // One Offer carries whatever is verified — a price, an availability, or both.
  // An unverified price is never invented to make the Offer valid.
  const offers =
    price != null || availability
      ? {
          "@type": "Offer",
          ...(price != null
            ? { price, ...(p.currency ? { priceCurrency: p.currency } : {}) }
            : {}),
          ...(availability ? { availability } : {}),
          url,
        }
      : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${url}#webpage` },
    name: p.name,
    description: options.description?.trim() || p.shortDescription || p.description || undefined,
    ...(image.length ? { image } : {}),
    ...(hasPropertyFacts ? { about: property } : {}),
    ...(offers ? { offers } : {}),
    ...(p.updatedAt ? { dateModified: new Date(p.updatedAt).toISOString() } : {}),
    provider: { "@id": organizationId() },
  };
}

export function propertyJsonLd(
  p: PropertyWithMarket,
  options: { canonical?: string | null; description?: string | null } = {},
) {
  const url = options.canonical ? absoluteSiteUrl(options.canonical) : absoluteSiteUrl(`/properties/${p.slug}`);
  const price = positiveNumber(p.price);
  const image = [p.coverImage, ...(p.gallery ?? [])].filter((i): i is string => !!i).map(absoluteSiteUrl);
  const address = postalAddress(p);
  const bedrooms = integerOrNull(p.bedrooms);
  const size = floorSize(null, null, p.areaSqm);
  const property = {
    "@type": "Accommodation",
    "@id": `${url}#property`,
    name: p.title,
    ...(address ? { address } : {}),
    ...(bedrooms ? { numberOfBedrooms: bedrooms } : {}),
    ...(size ? { floorSize: size } : {}),
  };
  const hasPropertyFacts = Boolean(address || bedrooms || size);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${url}#webpage` },
    name: p.title,
    description: options.description?.trim() || p.shortDescription || p.description || undefined,
    ...(image.length ? { image } : {}),
    ...(hasPropertyFacts ? { about: property } : {}),
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
    ...(p.updatedAt ? { dateModified: new Date(p.updatedAt).toISOString() } : {}),
    provider: { "@id": organizationId() },
  };
}

export function articleJsonLd(
  a: NewsArticleWithMarket,
  options: { canonical?: string | null; description?: string | null } = {},
) {
  const url = options.canonical ? absoluteSiteUrl(options.canonical) : absoluteSiteUrl(`/news/${a.slug}`);
  const image = a.socialImage || a.coverImage;
  const citations = (a.sources ?? []).map((s) => s.url).filter((u): u is string => !!u);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: a.title,
    description: options.description?.trim() || a.excerpt || a.seoDescription || undefined,
    ...(image ? { image: [absoluteSiteUrl(image)] } : {}),
    datePublished: (a.publishedAt || a.createdAt).toISOString(),
    dateModified: a.updatedAt.toISOString(),
    ...(a.author
      ? { author: { "@type": "Person", name: a.author, ...(a.authorRole ? { jobTitle: a.authorRole } : {}) } }
      : {}),
    publisher: { "@id": organizationId() },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${url}#webpage` },
    ...(a.category ? { articleSection: a.category } : {}),
    ...(a.seoKeywords ? { keywords: a.seoKeywords } : {}),
    ...(citations.length ? { citation: citations } : {}),
  };
}
