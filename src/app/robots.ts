import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await getSettings();
  const base = "https://www.mrhomerealestate.com";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/admin/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
