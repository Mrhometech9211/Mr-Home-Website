import Link from "next/link";
import Image from "next/image";
import { Phone, Mail, MapPin, Clock, MessageCircle } from "lucide-react";
import type { SiteSettings } from "@/lib/settings-types";
import type { Market, NavigationItem } from "@/db/schema";
import { buildWhatsAppLink, telLink } from "@/lib/whatsapp";
import { SocialIcon } from "./Icons";
import { NewsletterForm } from "./NewsletterForm";
import { BackToTop } from "./BackToTop";
import { safeHref } from "@/lib/url";

type Props = { settings: SiteSettings; nav: NavigationItem[]; markets: Market[] };

export function Footer({ settings: s, nav, markets }: Props) {
  const year = new Date().getFullYear();
  const wa = buildWhatsAppLink(s.whatsapp, s.whatsappDefaultMessage);
  return (
    <footer className="relative overflow-hidden border-t border-ink/8 bg-ivory" aria-labelledby="footer-heading">
      <div className="ribbon" />
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="relative mx-auto max-w-[1400px] px-4 pb-8 pt-16 sm:px-6 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link href="/" className="relative block h-12 w-[190px]" aria-label={`${s.brandName} home`}>
              <Image src={s.logo} alt={s.brandName} fill className="object-contain object-left" sizes="190px" unoptimized={s.logo.endsWith(".svg")} />
            </Link>
            <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-charcoal/80">{s.footerDescription}</p>
            <p className="mt-2 text-[13px] font-medium tracking-wide text-brand">{s.tagline}</p>
            <ul className="mt-6 flex items-center gap-2" aria-label="Social media">
              {s.socialLinks.filter((l) => l.url).map((l) => (
                <li key={l.platform}>
                  <a href={safeHref(l.url)} target="_blank" rel="noopener noreferrer" aria-label={l.platform} className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white text-ink transition hover:-translate-y-0.5 hover:border-brand hover:text-brand hover:shadow-glow">
                    {l.icon ? (
                      <Image src={l.icon} alt={l.platform} width={18} height={18} className="h-[18px] w-[18px] object-contain" unoptimized />
                    ) : (
                      <SocialIcon platform={l.platform} className="h-4 w-4" />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav className="lg:col-span-2" aria-label="Footer navigation">
            <h3 className="eyebrow mb-4 !text-ink">Navigation</h3>
            <ul className="space-y-2.5 text-[14px] text-charcoal/80">
              {nav.map((n) => (
                <li key={n.id}><Link href={safeHref(n.href)} className="transition hover:text-brand">{n.label}</Link></li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-2">
            <h3 className="eyebrow mb-4 !text-ink">Our Markets</h3>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[14px] text-charcoal/80">
              {markets.map((m) => (
                <li key={m.id}><Link href={`/markets/${m.slug}`} className="transition hover:text-brand">{m.name}</Link></li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="eyebrow mb-4 !text-ink">Contact Us</h3>
            <ul className="space-y-3 text-[14px] text-charcoal/80">
              <li><a href={telLink(s.phone)} className="flex items-start gap-2.5 transition hover:text-brand"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{s.phone}</a></li>
              <li><a href={`mailto:${s.email}`} className="flex items-start gap-2.5 transition hover:text-brand"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{s.email}</a></li>
              <li><a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 transition hover:text-brand"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />WhatsApp</a></li>
              <li><a href={s.mapUrl ? safeHref(s.mapUrl) : "#"} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 transition hover:text-brand"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span>{s.address}</span></a></li>
              <li className="flex items-start gap-2.5"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{s.workingHours}</li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            {s.newsletterEnabled && (
              <>
                <h3 className="eyebrow mb-4 !text-ink">{s.newsletterTitle}</h3>
                <p className="mb-4 text-[14px] leading-relaxed text-charcoal/80">{s.newsletterDescription}</p>
                <NewsletterForm />
              </>
            )}
          </div>
        </div>

        {s.offices.length > 1 && (
          <div className="mt-12 grid gap-4 border-t border-ink/8 pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {s.offices.map((o) => (
              <div key={o.name} className="rounded-2xl border border-ink/8 bg-white/60 p-4 text-[13px] text-charcoal/80">
                <div className="font-semibold text-ink">{o.name}</div>
                <div className="mt-1">{o.address}</div>
                {o.phone && <a href={telLink(o.phone)} className="mt-1 block hover:text-brand">{o.phone}</a>}
                {o.hours && <div className="mt-1 text-mist">{o.hours}</div>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ink/8 pt-6 text-[13px] text-charcoal/70 sm:flex-row">
          <p>© {year} {s.copyrightText}</p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {s.footerLinks.map((l) => (
              <li key={l.href}><Link href={safeHref(l.href)} className="transition hover:text-brand">{l.label}</Link></li>
            ))}
          </ul>
          <BackToTop />
        </div>
        {s.disclaimer && <p className="mt-4 text-center text-[11px] leading-relaxed text-mist sm:text-left">{s.disclaimer}</p>}
      </div>
    </footer>
  );
}
