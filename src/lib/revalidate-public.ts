import "server-only";
import { revalidatePath } from "next/cache";

/** Resources whose edits can change a public page or the global nav/footer. */
const PUBLIC_RESOURCES = new Set([
  "news",
  "projects",
  "markets",
  "sections",
  "navigation",
  "legal",
  "faqs",
  "testimonials",
  "seo",
  "metrics",
  "cities",
  "whatsapp",
]);

/**
 * Invalidate every runtime-ISR public page after a successful publish/update.
 *
 * A layout revalidation covers nested news, legal/custom and property routes,
 * including pages created before this optimization. Admin writes are rare, so
 * this is preferable to maintaining a fragile per-slug path list.
 */
export function revalidatePublicContent() {
  revalidatePath("/", "layout");
  revalidatePath("/sitemap.xml");
}

export function revalidateResource(resource: string) {
  if (PUBLIC_RESOURCES.has(resource)) revalidatePublicContent();
}
