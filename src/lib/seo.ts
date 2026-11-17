import "server-only";
import type { Metadata } from "next";
import { getSeoEntry, getSettings } from "./content";
import { absoluteSiteUrl } from "./site";
import { getSitePageSeo } from "./site-pages";

export type PageSeoFallback = {
  title: string;
  description?: string | null;
  image?: string | null;
  noIndex?: boolean;
};

export type ResolvedPageSeo = {
  title: string;
  description: string;
  image: string | null;
  imageUrl?: string;
  noIndex: boolean;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
};

/**
 * Resolve the SEO values the public page actually renders.
 *
 * Precedence is the same for metadata and JSON-LD:
 *   built-in page override → SEO entry → template fallback → site defaults.
 *
 * Canonical is always absolute on the one production origin, even when the
 * request is a preview or a legacy host.
 */
export async function resolvePageSeo(
  path: string,
  fallback: PageSeoFallback,
  options?: { forceNoIndex?: boolean },
): Promise<ResolvedPageSeo> {
  const [settings, entry, pageSeo] = await Promise.all([getSettings(), getSeoEntry(path), getSitePageSeo(path)]);
  const title = (pageSeo?.title || entry?.title || fallback.title).trim() || settings.brandName;
  const description = (
    pageSeo?.description ||
    entry?.description ||
    fallback.description ||
    settings.seoDefaultDescription ||
    ""
  ).trim();
  const image = pageSeo?.ogImage || entry?.ogImage || fallback.image || settings.seoOgImage || null;
  const noIndex = Boolean(
    options?.forceNoIndex || (pageSeo?.noIndex ?? (entry?.noIndex || fallback.noIndex || false)),
  );
  const canonical = pageSeo?.canonical ? absoluteSiteUrl(pageSeo.canonical) : absoluteSiteUrl(path);
  const imageUrl = image ? absoluteSiteUrl(image) : undefined;
  const ogTitle = pageSeo?.ogTitle || title;
  const ogDescription = pageSeo?.ogDescription || description;
  return { title, description, image, imageUrl, noIndex, canonical, ogTitle, ogDescription };
}

/**
 * Build page metadata against the one canonical origin.
 *
 * Canonical + Open Graph URLs are emitted as absolute www URLs so filtered
 * marketplace URLs (`?type=villa`) consolidate on the clean page, and preview
 * or runtime hosts can never become the canonical.
 */
export async function buildMetadata(
  path: string,
  fallback: PageSeoFallback,
  options?: { forceNoIndex?: boolean },
): Promise<Metadata> {
  const seo = await resolvePageSeo(path, fallback, options);
  const settings = await getSettings();
  return {
    title: { absolute: seo.title.includes(settings.brandName) ? seo.title : `${seo.title} | ${settings.brandName}` },
    description: seo.description,
    alternates: { canonical: seo.canonical },
    robots: seo.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: seo.ogTitle,
      description: seo.ogDescription,
      url: seo.canonical,
      images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined,
      type: "website",
      siteName: settings.brandName,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle,
      description: seo.ogDescription,
      images: seo.imageUrl ? [seo.imageUrl] : undefined,
    },
  };
}
