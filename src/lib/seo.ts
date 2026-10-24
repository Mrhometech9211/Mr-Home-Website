import "server-only";
import type { Metadata } from "next";
import { getSeoEntry, getSettings } from "./content";
import { absoluteSiteUrl } from "./site";

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
  const [s, entry] = await Promise.all([getSettings(), getSeoEntry(path)]);
  const title = entry?.title || fallback.title;
  const description = entry?.description || fallback.description || s.seoDefaultDescription;
  const image = entry?.ogImage || fallback.image || s.seoOgImage;
  const noIndex = entry?.noIndex || fallback.noIndex || false;
  const canonical = absoluteSiteUrl(path);
  const imageUrl = image ? absoluteSiteUrl(image) : undefined;
  return {
    title: { absolute: title.includes(s.brandName) ? title : `${title} | ${s.brandName}` },
    description,
    alternates: { canonical },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
      type: "website",
      siteName: s.brandName,
    },
    twitter: { card: "summary_large_image", title, description, images: imageUrl ? [imageUrl] : undefined },
  };
}
