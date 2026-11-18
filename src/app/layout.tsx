import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSettings } from "@/lib/content";
import { SITE_URL, absoluteSiteUrl } from "@/lib/site";
import { MetaPixelPageViews } from "@/components/site/MetaPixelPageViews";
import "./globals.css";

const META_PIXEL_ID = "1437729025189350";

const META_PIXEL_SCRIPT = `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
`.trim();

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
  return (
    // suppressHydrationWarning: Lenis and theme tooling mutate <html> classes/styles at
    // runtime (e.g. the `lenis` class); only this element's attribute mismatch is suppressed.
    <html lang="en" suppressHydrationWarning style={{ ["--brand" as string]: s.primaryColor, ["--brand-bright" as string]: s.accentColor }}>
      <head>
        <script id="meta-pixel" dangerouslySetInnerHTML={{ __html: META_PIXEL_SCRIPT }} />
      </head>
      {/* head/body-level suppress: browser extensions and preview tooling mutate
          these elements' attributes before React hydrates (e.g. injected classes) */}
      <body suppressHydrationWarning className="min-h-screen bg-ivory text-ink antialiased">
        <noscript
          dangerouslySetInnerHTML={{
            __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1" alt="" />`,
          }}
        />
        {children}
        <MetaPixelPageViews />
      </body>
    </html>
  );
}
