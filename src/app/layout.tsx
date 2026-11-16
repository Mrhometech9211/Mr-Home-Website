import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSettings } from "@/lib/content";
import { SITE_URL, absoluteSiteUrl } from "@/lib/site";
import { organizationJsonLd } from "@/lib/structured-data";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: s.seoDefaultTitle, template: `%s | ${s.brandName}` },
    description: s.seoDefaultDescription,
    icons: { icon: s.favicon },
    openGraph: { siteName: s.brandName, type: "website", images: s.seoOgImage ? [{ url: absoluteSiteUrl(s.seoOgImage) }] : undefined },
    twitter: { card: "summary_large_image" },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const s = await getSettings();
  // One site-wide Organization entity, referenced by @id from listing/article markup.
  const orgLd = JSON.stringify(organizationJsonLd(s)).replace(/</g, "\\u003c");
  return (
    // suppressHydrationWarning: Lenis and theme tooling mutate <html> classes/styles at
    // runtime (e.g. the `lenis` class); only this element's attribute mismatch is suppressed.
    <html lang="en" suppressHydrationWarning style={{ ["--brand" as string]: s.primaryColor, ["--brand-bright" as string]: s.accentColor }}>
      {/* head/body-level suppress: browser extensions and preview tooling mutate
          these elements' attributes before React hydrates (e.g. injected classes) */}
      <body suppressHydrationWarning className="min-h-screen bg-ivory text-ink antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: orgLd }} />
        {children}
      </body>
    </html>
  );
}
