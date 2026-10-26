import type { Metadata } from "next";
import { Phone, Mail, MapPin, Clock, MessageCircle } from "lucide-react";
import { getPublishedMarketCities, getPublishedMarkets, getPublishedProjects, getSections, getSettings } from "@/lib/content";
import { buildMetadata } from "@/lib/seo";
import { buildWhatsAppLink, telLink } from "@/lib/whatsapp";
import { PageHero } from "@/components/site/PageHero";
import { InquiryForm } from "@/components/site/InquiryForm";
import { Reveal } from "@/components/site/Reveal";
import { SocialIcon } from "@/components/site/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/contact", { title: "Contact — Let’s Find the Right Property for You" });
}

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ market?: string; city?: string; project?: string }> }) {
  const sp = await searchParams;
  const [s, markets, marketCitiesMap, projects, sections] = await Promise.all([getSettings(), getPublishedMarkets(), getPublishedMarketCities(), getPublishedProjects(), getSections("contact")]);
  // "Request Details" buttons deep-link here with ?project=<slug>; preselect
  // that project (and its market) so the visitor never re-types the context.
  const preProject = sp.project ? projects.find((p) => p.slug === sp.project && p.published && !p.archived) : undefined;
  const hero = sections.find((x) => x.key === "hero");
  const wa = buildWhatsAppLink(s.whatsapp, s.whatsappDefaultMessage);
  return (
    <>
      <PageHero eyebrow={hero?.eyebrow || "Contact"} title={hero?.title || "Let’s Find the Right Property for You"} body={hero?.body} crumbs={[{ name: "Home", href: "/" }, { name: "Contact", href: "/contact" }]} />
      <section className="pb-24">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 sm:px-6 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <ul className="space-y-3">
              {[
                { icon: Phone, label: "Phone", value: s.phone, href: telLink(s.phone) },
                { icon: MessageCircle, label: "WhatsApp", value: s.whatsapp, href: wa },
                { icon: Mail, label: "Email", value: s.email, href: `mailto:${s.email}` },
                { icon: MapPin, label: "Head Office", value: s.address, href: s.mapUrl },
                { icon: Clock, label: "Working Hours", value: s.workingHours },
              ].map((c) => (
                <li key={c.label} className="rounded-3xl border border-ink/8 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card">
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand"><c.icon className="h-5 w-5" /></span>
                    <div><div className="text-[11px] uppercase tracking-[0.18em] text-mist">{c.label}</div>{c.href ? <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="mt-1 block text-[15px] font-medium text-ink hover:text-brand">{c.value}</a> : <div className="mt-1 text-[15px] font-medium text-ink">{c.value}</div>}</div>
                  </div>
                </li>
              ))}
            </ul>
            {s.offices.length > 0 && (
              <div className="mt-8">
                <h2 className="eyebrow !text-ink">Offices</h2>
                <ul className="mt-3 space-y-3">{s.offices.map((o) => <li key={o.name} className="rounded-2xl bg-ivory-deep/70 p-4 text-[13.5px] text-charcoal"><div className="font-semibold text-ink">{o.name}</div><div>{o.address}</div>{o.phone && <a href={telLink(o.phone)} className="block hover:text-brand">{o.phone}</a>}{o.hours && <div className="text-mist">{o.hours}</div>}{o.mapUrl && <a href={o.mapUrl} target="_blank" rel="noopener noreferrer" className="text-brand">Open in Maps</a>}</li>)}</ul>
              </div>
            )}
            <ul className="mt-8 flex gap-2">{s.socialLinks.filter((l) => l.url).map((l) => <li key={l.platform}><a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.platform} className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white text-ink hover:border-brand hover:text-brand"><SocialIcon platform={l.platform} className="h-4 w-4" /></a></li>)}</ul>
          </Reveal>
          <Reveal className="lg:col-span-8" y={50}>
            <InquiryForm fields={s.contactFields} markets={markets.map((m) => ({ id: m.id, name: m.name, slug: m.slug, flag: m.flag, cities: marketCitiesMap[m.id] }))} projects={projects.map((p) => ({ id: p.id, name: p.name, marketId: p.marketId }))} budgetOptions={s.budgetOptions} interestOptions={s.interestOptions} cityFieldEnabled={s.cityFieldEnabled} customBudgetEnabled={s.customBudgetEnabled} defaultMarketId={preProject?.marketId ?? markets.find((m) => m.slug === sp.market)?.id ?? null} defaultProjectId={preProject?.id ?? null} source="contact-page" />
            {s.mapUrl && <div className="mt-6 overflow-hidden rounded-3xl border border-ink/8 shadow-soft"><iframe title="Office map" src={`https://maps.google.com/maps?q=${encodeURIComponent(s.address)}&z=14&output=embed`} className="h-[300px] w-full" loading="lazy" /></div>}
          </Reveal>
        </div>
      </section>
    </>
  );
}
