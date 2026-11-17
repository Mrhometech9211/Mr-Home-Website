import type { ReactNode } from "react";
import { getNavigation, getPublishedMarkets, getSettings, getBuilderNavPages, isRentPublic } from "@/lib/content";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { Navbar, type NavItem } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { SmoothScroll } from "@/components/site/SmoothScroll";
import { CookieConsent } from "@/components/site/CookieConsent";
import { WhatsAppFloat } from "@/components/site/WhatsAppFloat";
import { JsonLd } from "@/components/site/Breadcrumbs";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [settings, headerNav, footerNav, markets, builderPages, rentPublic] = await Promise.all([getSettings(), getNavigation("header"), getNavigation("footer"), getPublishedMarkets(), getBuilderNavPages(), isRentPublic()]);
  // Rent stays out of the public navigation until there is real rental
  // inventory or an explicit rental-services confirmation in Settings.
  const isRentHref = (href: string) => href.split(/[?#]/)[0].replace(/\/+$/, "") === "/rent";
  const visibleHeader = rentPublic ? headerNav : headerNav.filter((n) => !isRentHref(n.href));
  const visibleFooter = rentPublic ? footerNav : footerNav.filter((n) => !isRentHref(n.href));
  const top = visibleHeader.filter((n) => !n.parentId);
  const items: NavItem[] = top.map((n) => ({ id: n.id, label: n.label, href: n.href, openInNewTab: n.openInNewTab, children: visibleHeader.filter((c) => c.parentId === n.id).map((c) => ({ id: c.id, label: c.label, href: c.href })) }));
  // Published custom pages with "In main menu" enabled appear after the
  // managed navigation items, ordered by their Nav order value.
  const maxNavId = items.reduce((m, n) => Math.max(m, n.id), 0);
  let bpId = maxNavId;
  for (const p of builderPages) {
    bpId += 1;
    items.push({ id: bpId, label: p.navLabel || p.title, href: `/${p.slug}` });
  }
  const wa = buildWhatsAppLink(settings.whatsapp, settings.whatsappDefaultMessage);
  return (
    <>
      <SmoothScroll />
      <JsonLd data={organizationJsonLd(settings, markets.map((m) => m.name))} />
      <JsonLd data={websiteJsonLd(settings)} />
      {settings.announcementEnabled && settings.announcement && (
        <div className="fixed inset-x-0 top-0 z-[55] bg-brand py-1.5 text-center text-[12px] font-medium text-white">{settings.announcement}</div>
      )}
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <Navbar brandName={settings.brandName} logo={settings.logo} items={items} whatsappHref={wa} />
      <main id="main">{children}</main>
      <Footer settings={settings} nav={visibleFooter} markets={markets} />
      {settings.whatsappFloatEnabled !== false && <WhatsAppFloat href={wa} />}
      {settings.cookieConsentEnabled !== false && <CookieConsent text={settings.cookieConsentText} gaId={settings.gaId} />}
    </>
  );
}
