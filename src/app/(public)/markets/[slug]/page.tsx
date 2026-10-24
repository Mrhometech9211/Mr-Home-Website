import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import { getCitiesByMarket, getMarketBySlug, getPublishedMarkets, getPublishedProjects, getSettings } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { buildWhatsAppLink, fillTemplate } from "@/lib/whatsapp";
import { Breadcrumbs, JsonLd } from "@/components/site/Breadcrumbs";
import { Button3D } from "@/components/ui/Button3D";
import { Reveal } from "@/components/site/Reveal";
import { ProjectCard } from "@/components/site/ProjectCard";
import { InquiryForm } from "@/components/site/InquiryForm";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMarketBySlug(slug);
  if (!m) return { title: "Market not found", robots: { index: false } };
  return buildMetadata(`/markets/${slug}`, { title: m.seoTitle || `Invest in ${m.name} Real Estate`, description: m.seoDescription || m.tagline || m.description, image: m.coverImage });
}

export default async function MarketPage({ params }: { params: Params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const [market, settings] = await Promise.all([getMarketBySlug(slug, !!user), getSettings()]);
  if (!market) notFound();
  const [projects, markets, marketCities] = await Promise.all([getPublishedProjects({ market: market.slug }), getPublishedMarkets(), getCitiesByMarket(market.id)]);
  const wa = buildWhatsAppLink(settings.whatsapp, fillTemplate(settings.whatsappMarketMessage, { market: market.name }));
  const crumbs = [{ name: "Home", href: "/" }, { name: "Markets", href: "/markets" }, { name: market.name, href: `/markets/${market.slug}` }];
  const ld = { "@context": "https://schema.org", "@type": "Place", name: market.name, description: market.description, geo: { "@type": "GeoCoordinates", latitude: market.latitude, longitude: market.longitude }, image: market.coverImage };

  return (
    <article>
      {!market.published && <><meta name="robots" content="noindex,nofollow" /><div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 py-1.5 text-center text-[12px] font-semibold text-white">Preview — this market is unpublished.</div></>}
      <JsonLd data={ld} />
      <section className="relative isolate overflow-hidden bg-space pt-28 text-white lg:pt-32">
        <div className="absolute inset-0">{market.coverImage && <Image src={market.coverImage} alt={market.name} fill priority className="object-cover opacity-60" sizes="100vw" />}<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,12,0.4),rgba(5,8,12,0.6)_50%,#05080c)]" /></div>
        <div className="relative mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
          <Breadcrumbs items={crumbs} dark />
          <Reveal className="mt-10 max-w-3xl">
            <div className="text-5xl" aria-hidden>{market.flag}</div>
            <h1 className="display mt-4 text-[clamp(2.6rem,6vw,5rem)]">{market.name}</h1>
            <p className="mt-4 text-[18px] text-white/75">{market.tagline}</p>
            {/* Cities come from the admin Cities module first, so a city added there
                appears here immediately; the market's tag list is the fallback. */}
            <p className="mt-3 flex items-center gap-2 text-[13px] text-white/50"><MapPin className="h-4 w-4 text-brand-bright" />{(marketCities.length ? marketCities.map((c) => c.name) : (market.cities ?? [])).join(" · ")} · {market.latitude.toFixed(2)}°, {market.longitude.toFixed(2)}°</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button3D href={`/projects?market=${market.slug}`}>View Projects ({projects.length})</Button3D>
              <Button3D href={wa} variant="whatsapp" icon="whatsapp" external>WhatsApp Advisor</Button3D>
            </div>
          </Reveal>
        </div>
      </section>

      {market.stats && market.stats.length > 0 && (
        <div className="relative z-10 mx-auto mt-8 max-w-[1400px] px-4 sm:px-6">
          <Reveal stagger="[data-s]" className="glass grid grid-cols-1 gap-px overflow-hidden rounded-[28px] shadow-card sm:grid-cols-3">
            {market.stats.map((s) => <div key={s.label} data-s className="px-6 py-6"><div className="text-[11px] uppercase tracking-wider text-mist">{s.label}</div><div className="mt-1 text-[24px] font-semibold tracking-tight text-brand">{s.value}</div></div>)}
          </Reveal>
        </div>
      )}

      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-7">
          <Reveal><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Market overview</h2><p className="mt-5 text-[16px] leading-relaxed text-charcoal/85">{market.description}</p></Reveal>
          {market.investmentOverview && <Reveal><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Investment outlook</h2><p className="mt-5 text-[16px] leading-relaxed text-charcoal/85">{market.investmentOverview}</p></Reveal>}
          {marketCities.length > 0 && (
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Explore cities in {market.name}</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {marketCities.map((c) => (
                  <li key={c.id}>
                    <Link href={`/markets/${market.slug}/${c.slug}`} className="group flex items-center justify-between rounded-2xl border border-ink/10 bg-white px-4 py-3.5 shadow-soft transition hover:border-brand hover:shadow-card">
                      <span>
                        <span className="block text-[14.5px] font-semibold text-ink">{c.name}</span>
                        {c.tagline && <span className="mt-0.5 block text-[12.5px] text-charcoal/70">{c.tagline}</span>}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-mist transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
          <Reveal>
            <div className="overflow-hidden rounded-3xl border border-ink/8 shadow-soft"><iframe title={`Map of ${market.name}`} src={`https://maps.google.com/maps?q=${market.latitude},${market.longitude}&z=5&output=embed`} className="h-[340px] w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
          </Reveal>
        </div>
        <aside className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <h2 className="mb-4 text-[20px] font-semibold tracking-tight text-ink">Invest in {market.name}</h2>
            <InquiryForm fields={settings.contactFields.filter((f) => f !== "market")} markets={markets.map((m) => ({ id: m.id, name: m.name, slug: m.slug, flag: m.flag, cities: m.cities }))} projects={projects.map((p) => ({ id: p.id, name: p.name, marketId: p.marketId }))} budgetOptions={settings.budgetOptions} interestOptions={settings.interestOptions} cityFieldEnabled={settings.cityFieldEnabled} customBudgetEnabled={settings.customBudgetEnabled} defaultMarketId={market.id} source="market-page" compact />
          </div>
        </aside>
      </div>

      <section className="bg-ivory-deep/60 py-20">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <Reveal className="flex items-end justify-between"><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Projects in {market.name}</h2></Reveal>
          {projects.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-ink/15 bg-white/60 p-12 text-center text-charcoal/70">New opportunities in {market.name} are being curated. <a href="#main" className="text-brand">Register your interest above.</a></div>
          ) : (
            <Reveal stagger="[data-p]" className="perspective mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{projects.map((p) => <div key={p.id} data-p><ProjectCard project={p} /></div>)}</Reveal>
          )}
        </div>
      </section>
    </article>
  );
}
