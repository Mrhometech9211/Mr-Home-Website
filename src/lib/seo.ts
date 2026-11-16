import "server-only";
import type { Metadata } from "next";
import { getSeoEntry, getSettings } from "./content";
import { absoluteSiteUrl } from "./site";
import { getSitePageSeo } from "./site-pages";

/**
 * Build page metadata against the one canonical origin.
 *
 * Canonical + Open Graph URLs are emitted as absolute www URLs so filtered
 * marketplace URLs (`?type=villa`) consolidate on the clean page, and preview
 * or runtime hosts can never become the canonical.
 */
export async function buildMetadata(
  path: string,
  fallback: { title: string; description?: string | null; image?: string | null; noIndex?: boolean },
): Promise<Metadata> {
  const [s, entry, pageSeo] = await Promise.all([getSettings(), getSeoEntry(path), getSitePageSeo(path)]);
  const title = pageSeo?.title || entry?.title || fallback.title;
  const description = pageSeo?.description || entry?.description || fallback.description || s.seoDefaultDescription;
  const image = pageSeo?.ogImage || entry?.ogImage || fallback.image || s.seoOgImage;
  const noIndex = pageSeo?.noIndex ?? (entry?.noIndex || fallback.noIndex || false);
  const canonical = pageSeo?.canonical ? absoluteSiteUrl(pageSeo.canonical) : absoluteSiteUrl(path);
  const imageUrl = image ? absoluteSiteUrl(image) : undefined;
  const ogTitle = pageSeo?.ogTitle || title;
  const ogDescription = pageSeo?.ogDescription || description;
  return {
    title: { absolute: title.includes(s.brandName) ? title : `${title} | ${s.brandName}` },
    description,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
      type: "website",
      siteName: s.brandName,
    },
    twitter: { card: "summary_large_image", title: ogTitle, description: ogDescription, images: imageUrl ? [imageUrl] : undefined },
  };
}
