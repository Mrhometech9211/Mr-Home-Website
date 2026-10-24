import type { ReactNode } from "react";
import { getNavigation, getPublishedMarkets, getSettings, getBuilderNavPages } from "@/lib/content";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { Navbar, type NavItem } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { SmoothScroll } from "@/components/site/SmoothScroll";
import { CookieConsent } from "@/components/site/CookieConsent";
import { WhatsAppFloat } from "@/components/site/WhatsAppFloat";
import { JsonLd } from "@/components/site/Breadcrumbs";
import { SITE_URL, absoluteSiteUrl } from "@/lib/site";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [settings, headerNav, footerNav, markets, builderPages] = await Promise.all([getSettings(), getNavigation("header"), getNavigation("footer"), getPublishedMarkets(), getBuilderNavPages()]);
  const top = headerNav.filter((n) => !n.parentId);
  const items: NavItem[] = top.map((n) => ({ id: n.id, label: n.label, href: n.href, openInNewTab: n.openInNewTab, children: headerNav.filter((c) => c.parentId === n.id).map((c) => ({ id: c.id, label: c.label, href: c.href })) }));
  // Published custom pages with "In main menu" enabled appear after the
  // managed navigation items, ordered by their Nav order value.
  const maxNavId = items.reduce((m, n) => Math.max(m, n.id), 0);
  let bpId = maxNavId;
  for (const p of builderPages) {
    bpId += 1;
    items.push({ id: bpId, label: p.navLabel || p.title, href: `/${p.slug}` });
  }
  const wa = buildWhatsAppLink(settings.whatsapp, settings.whatsappDefaultMessage);
  const org = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: settings.brandName,
    slogan: settings.tagline,
    telephone: settings.phone,
    email: settings.email,
    address: settings.address,
    "@id": `${SITE_URL}/#organization`,
    url: SITE_URL,
    logo: settings.logo ? absoluteSiteUrl(settings.logo) : undefined,
    image: settings.seoOgImage ? absoluteSiteUrl(settings.seoOgImage) : undefined,
    sameAs: settings.socialLinks.map((l) => l.url).filter(Boolean),
    areaServed: markets.map((m) => m.name),
  };
  return (
    <>
      <SmoothScroll />
      <JsonLd data={org} />
      {settings.announcementEnabled && settings.announcement && (
        <div className="fixed inset-x-0 top-0 z-[55] bg-brand py-1.5 text-center text-[12px] font-medium text-white">{settings.announcement}</div>
      )}
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <Navbar brandName={settings.brandName} logo={settings.logo} items={items} whatsappHref={wa} />
      <main id="main">{children}</main>
      <Footer settings={settings} nav={footerNav} markets={markets} />
      {settings.whatsappFloatEnabled !== false && <WhatsAppFloat href={wa} />}
      {settings.cookieConsentEnabled !== false && <CookieConsent text={settings.cookieConsentText} gaId={settings.gaId} />}
    </>
  );
}
