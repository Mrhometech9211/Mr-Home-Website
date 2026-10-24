/**
 * Canonical public origin.
 *
 * Hard-coded on purpose: preview deployments, generated worker URLs and the
 * legacy vercel.app domain must never leak into canonical, Open Graph,
 * JSON-LD, sitemap or robots output. Request headers and the editable
 * `siteUrl` setting are deliberately not used here.
 */
export const SITE_URL = "https://www.mrhomerealestate.com";

/** Resolve a site path (or an already-absolute asset URL) against the canonical origin. */
export function absoluteSiteUrl(path: string): string {
  try {
    return new URL(path, `${SITE_URL}/`).toString();
  } catch {
    return SITE_URL;
  }
}
